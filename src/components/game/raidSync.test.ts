import { describe, expect, it } from "vitest";
import { findSafePath, generateRoom, type Move, type Trap } from "@/engine";
import { mockPixels, mockTraits } from "@/nft/mockArt";
import { applyMoves, startRaid, type RaidDeps, type RaidView } from "@/server/raids";
import { createMemoryStore } from "@/server/store/memory";
import { diverged, enqueue, initialSync, onNetworkError, onServerView, predict, takeBatch, type SyncState } from "./raidSync";

const room = generateRoom({ tokenId: 42, pixels: mockPixels(42), traits: mockTraits(42) });
const path = findSafePath(room, [])!;

function server(defense: Trap[] = []) {
  const store = createMemoryStore();
  store.state.defenses["42"] = { tokenId: 42, owner: "0xowner", traps: defense, updatedAt: "" };
  const deps: RaidDeps = { store, getRoom: async () => room, ownerOf: async () => "0xowner" };
  return deps;
}
const view = (r: { ok: boolean; value?: RaidView; view?: RaidView }) => (r.ok ? r.value! : r.view!);
const send = (deps: RaidDeps, raidId: string, b: { seq: number; moves: Move[] }) => applyMoves(deps, raidId, "alice", b.moves, b.seq);

async function begin(defense?: Trap[]) {
  const deps = server(defense);
  const v0 = view(await startRaid(deps, 42, "alice"));
  return { deps, s: initialSync(v0), raidId: v0.raidId };
}
const press = (s: SyncState, ms: Move[]) => ms.reduce((acc, m) => enqueue(room, acc, m), s);

describe("optimistic raid sync", () => {
  it("moves instantly, then the server confirms the same state", async () => {
    const { deps, s: s0, raidId } = await begin();
    let s = press(s0, path.slice(0, 3));
    const shown = predict(room, s);
    expect(shown.path).toHaveLength(4); // visible before any reply
    const t = takeBatch(s)!;
    s = onServerView(t.state, t.batch, view(await send(deps, raidId, t.batch)));
    expect(s.pending).toEqual([]);
    expect(s.inflight).toBeNull();
    expect(predict(room, s).path).toEqual(shown.path);
  });

  it("keeps moves made while a request is in flight, and sends them next with the right seq", async () => {
    const { deps, s: s0, raidId } = await begin();
    let s = press(s0, path.slice(0, 2));
    const t1 = takeBatch(s)!;
    s = press(t1.state, path.slice(2, 5)); // typed while waiting
    expect(takeBatch(s)).toBeNull(); // one request at a time
    s = onServerView(s, t1.batch, view(await send(deps, raidId, t1.batch)));
    expect(s.pending).toEqual(path.slice(2, 5));
    const t2 = takeBatch(s)!;
    expect(t2.batch.seq).toBe(2);
    s = onServerView(t2.state, t2.batch, view(await send(deps, raidId, t2.batch)));
    expect(s.view.moves).toBe(path.slice(0, 5).join(""));
  });

  it("reconciles when the server disagrees (hidden spike), without ever revealing it early", async () => {
    // A spike on the raider's route that the client cannot see.
    let p = room.entrance;
    for (const m of path.slice(0, 3)) p = { x: p.x + (m === "R" ? 1 : m === "L" ? -1 : 0), y: p.y + (m === "D" ? 1 : m === "U" ? -1 : 0) };
    const spike: Trap = { type: "spike", x: p.x, y: p.y };
    const { deps, s: s0, raidId } = await begin([spike]);
    expect(s0.view.visibleTraps).toEqual([]); // hidden at start
    const before = press(s0, path.slice(0, 3));
    expect(predict(room, before).hp).toBe(room.rules.raiderHp); // client guessed no damage
    const t = takeBatch(before)!;
    const after = onServerView(t.state, t.batch, view(await send(deps, raidId, t.batch)));
    expect(after.view.hp).toBe(room.rules.raiderHp - 2); // server: the spike hit
    expect(after.view.visibleTraps).toEqual([spike]); // revealed only once stepped on
    expect(diverged(room, before, after)).toBe(true);
    expect(predict(room, after).hp).toBe(after.view.hp); // screen now matches the server
  });

  it("resends safely after a dropped request (lost before or after the server applied it)", async () => {
    const { deps, s: s0, raidId } = await begin();
    // Lost on the way: server never saw it.
    let s = press(s0, path.slice(0, 2));
    let t = takeBatch(s)!;
    s = onNetworkError(t.state, t.batch);
    expect(s.pending).toEqual(path.slice(0, 2));
    t = takeBatch(s)!;
    expect(t.batch.seq).toBe(0);
    s = onServerView(t.state, t.batch, view(await send(deps, raidId, t.batch)));
    expect(s.view.moves).toBe(path.slice(0, 2).join(""));

    // Lost on the way back: server applied it, client didn't hear.
    s = press(s, path.slice(2, 4));
    t = takeBatch(s)!;
    await send(deps, raidId, t.batch); // applied, reply dropped
    s = onNetworkError(t.state, t.batch);
    t = takeBatch(s)!; // resend the same moves at the same seq
    s = onServerView(t.state, t.batch, view(await send(deps, raidId, t.batch)));
    expect(s.view.moves).toBe(path.slice(0, 4).join("")); // not applied twice
    expect(s.pending).toEqual([]);
  });

  it("ignores an out-of-order (stale) reply", async () => {
    const { deps, s: s0, raidId } = await begin();
    let s = press(s0, path.slice(0, 1));
    let t = takeBatch(s)!;
    const old = view(await send(deps, raidId, t.batch));
    s = onServerView(t.state, t.batch, old);
    s = press(s, path.slice(1, 3));
    t = takeBatch(s)!;
    const fresh = view(await send(deps, raidId, t.batch));
    s = onServerView(t.state, t.batch, fresh);
    const late = onServerView(s, null, old); // the older reply arrives late
    expect(late.view.moves).toBe(fresh.moves);
    expect(late.pending).toEqual([]);
  });

  it("trusts the server when its history differs (e.g. another tab), dropping local guesses", async () => {
    const { deps, s: s0, raidId } = await begin();
    await applyMoves(deps, raidId, "alice", ["L"], 0); // someone else moved first
    let s = press(s0, ["R", "R"]);
    const t = takeBatch(s)!;
    const r = await send(deps, raidId, t.batch);
    expect(r.ok).toBe(false); // 409 out of sync, with the server view
    s = onServerView(t.state, t.batch, view(r));
    expect(s.view.moves).toBe("L");
    expect(s.pending).toEqual([]);
  });

  it("stops accepting moves once the raid is predicted or confirmed over", async () => {
    const { deps, s: s0, raidId } = await begin();
    let s = press(s0, path);
    expect(predict(room, s).outcome).toBe("breach");
    expect(enqueue(room, s, "L")).toBe(s);
    const t = takeBatch(s)!;
    s = onServerView(t.state, t.batch, view(await send(deps, raidId, t.batch)));
    expect(s.view.status).toBe("breach");
    expect(enqueue(room, s, "L")).toBe(s);
    expect(takeBatch(s)).toBeNull();
  });
});

describe("batched move API", () => {
  it("drops moves sent after the raid ends", async () => {
    const deps = server();
    const v0 = view(await startRaid(deps, 42, "alice"));
    const r = await applyMoves(deps, v0.raidId, "alice", [...path, "L", "L"], 0);
    expect(view(r).status).toBe("breach");
    expect(view(r).moves).toBe(path.join(""));
  });
});
