import { describe, expect, it } from "vitest";
import { findSafePath, generateRoom, sampleTraps, simulateRaid, type Move, type Trap } from "@/engine";
import { mockPixels, mockTraits } from "@/nft/mockArt";
import { applyMove, getReplay, listRoomRaids, startRaid, visibleTraps, type RaidDeps, type RaidView } from "./raids";
import { createMemoryStore } from "./store/memory";

const room = (id: number) => generateRoom({ tokenId: id, pixels: mockPixels(id), traits: mockTraits(id) });

function setup(defense?: Trap[]) {
  const store = createMemoryStore();
  const r = room(42);
  if (defense) store.state.defenses["42"] = { tokenId: 42, owner: "0xowner", traps: defense, updatedAt: "" };
  const deps: RaidDeps = { store, getRoom: async (id) => (id === 42 ? r : null), ownerOf: async (id) => (id === 42 ? "0xOwner" : null) };
  return { store, deps, room: r };
}

const ok = <T,>(res: { ok: boolean; value?: T; error?: string }): T => {
  expect(res.ok, res.error).toBe(true);
  return res.value as T;
};

async function play(deps: RaidDeps, raidId: string, moves: Move[], raider = "alice"): Promise<RaidView> {
  let view!: RaidView;
  for (let i = 0; i < moves.length; i++) view = ok(await applyMove(deps, raidId, raider, moves[i], i));
  return view;
}

describe("server raids", () => {
  it("uses practice traps when the room has no defense", async () => {
    const { deps, room } = setup();
    const v = ok(await startRaid(deps, 42, "alice"));
    expect(v.practice).toBe(true);
    expect(v.path).toEqual([room.entrance]);
  });

  it("matches a full local replay move by move, and records the outcome", async () => {
    const { deps, store, room } = setup();
    const traps = sampleTraps(room, room.seed);
    const moves = findSafePath(room, traps)!;
    const v0 = ok(await startRaid(deps, 42, "alice"));
    const v = await play(deps, v0.raidId, moves);
    const local = simulateRaid(room, traps, moves);
    expect(v.outcome).toBe("breach");
    expect(v.path).toEqual(local.path);
    expect(v.hp).toBe(local.hp);
    const saved = (await store.getRaid(v0.raidId))!;
    expect(saved.status).toBe("breach");
    expect(saved.moves).toBe(moves.join(""));
  });

  it("never reveals hidden traps before they are stepped on", async () => {
    const r = room(42);
    const secret: Trap[] = [{ type: "spike", x: 2, y: r.entrance.y }];
    const { deps } = setup(secret);
    const v = ok(await startRaid(deps, 42, "alice"));
    expect(v.visibleTraps).toEqual([]);
    expect(visibleTraps(r, secret, [r.entrance, { x: 1, y: r.entrance.y }, { x: 2, y: r.entrance.y }])).toEqual(secret);
  });

  it("uses the saved defense when there is one", async () => {
    const { deps } = setup([]);
    expect(ok(await startRaid(deps, 42, "alice")).practice).toBe(false);
  });

  it("treats a resent move as a no-op and rejects moves from the future", async () => {
    const { deps } = setup([]);
    const v0 = ok(await startRaid(deps, 42, "alice"));
    const a = ok(await applyMove(deps, v0.raidId, "alice", "R", 0));
    const again = ok(await applyMove(deps, v0.raidId, "alice", "R", 0));
    expect(again.moveCount).toBe(1);
    expect(again.path).toEqual(a.path);
    const ahead = await applyMove(deps, v0.raidId, "alice", "R", 5);
    expect(ahead.ok).toBe(false);
    if (!ahead.ok) expect(ahead.status).toBe(409);
  });

  it("rejects other people's raids, bad moves and moves after the end", async () => {
    const { deps, room } = setup([]);
    const v0 = ok(await startRaid(deps, 42, "alice"));
    expect((await applyMove(deps, v0.raidId, "mallory", "R", 0)).ok).toBe(false);
    expect((await applyMove(deps, v0.raidId, "alice", "X", 0)).ok).toBe(false);
    const moves = findSafePath(room, [])!;
    await play(deps, v0.raidId, moves);
    const after = await applyMove(deps, v0.raidId, "alice", "L", moves.length);
    expect(after.ok).toBe(false);
  });

  it("abandons an unfinished raid when the same raider starts again", async () => {
    const { deps, store } = setup([]);
    const first = ok(await startRaid(deps, 42, "alice"));
    await applyMove(deps, first.raidId, "alice", "R", 0);
    ok(await startRaid(deps, 42, "alice"));
    expect((await store.getRaid(first.raidId))!.status).toBe("abandoned");
  });

  it("serves replays only when finished and allowed", async () => {
    const { deps, room } = setup([]);
    const v0 = ok(await startRaid(deps, 42, "alice"));
    expect((await getReplay(deps, v0.raidId, "alice")).ok).toBe(false); // still active
    await play(deps, v0.raidId, findSafePath(room, [])!);
    expect(ok(await getReplay(deps, v0.raidId, "alice")).moves.length).toBeGreaterThan(0);
    expect((await getReplay(deps, v0.raidId, "bob")).ok).toBe(false); // defended room, not the raider
  });

  it("lists finished raids without trap positions", async () => {
    const { deps, room } = setup();
    const v0 = ok(await startRaid(deps, 42, "alice"));
    await play(deps, v0.raidId, findSafePath(room, sampleTraps(room, room.seed))!);
    const log = await listRoomRaids(deps, 42);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("breach");
    expect(JSON.stringify(log)).not.toContain("traps");
  });

  it("is unknown-room safe", async () => {
    const { deps } = setup();
    const r = await startRaid(deps, 999, "alice");
    expect(r.ok).toBe(false);
  });
});

