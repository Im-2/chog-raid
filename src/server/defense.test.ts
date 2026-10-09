import { describe, expect, it } from "vitest";
import { findSafePath, generateRoom, type Trap } from "@/engine";
import { mockPixels, mockTraits } from "@/nft/mockArt";
import { getDefenseView, parseTraps, saveDefense } from "./defense";
import { applyMove, getReplay, startRaid, type RaidDeps } from "./raids";
import { createMemoryStore } from "./store/memory";

const OWNER = "0xAbCd000000000000000000000000000000000001";
const room = generateRoom({ tokenId: 7, pixels: mockPixels(7), traits: mockTraits(7) });

function setup(owner = OWNER) {
  const store = createMemoryStore();
  let holder = owner;
  const deps: RaidDeps = {
    store,
    getRoom: async (id) => (id === 7 ? room : null),
    ownerOf: async (id) => (id === 7 ? holder : null),
  };
  return { store, deps, transfer: (to: string) => (holder = to) };
}

const spike = (): Trap[] => {
  for (let i = 0; i < room.tiles.length; i++) {
    const x = i % room.size;
    const y = Math.floor(i / room.size);
    if (room.tiles[i] === "floor" && x > 1 && x < room.size - 2) return [{ type: "spike", x, y }];
  }
  return [];
};

describe("parseTraps", () => {
  it("keeps only known fields and rejects malformed input", () => {
    expect(parseTraps([{ type: "spike", x: 1, y: 2, evil: true }])).toEqual([{ type: "spike", x: 1, y: 2 }]);
    expect(parseTraps([{ type: "lockdoor", x: 1, y: 2 }])).toBeNull();
    expect(parseTraps([{ type: "guard", x: 1, y: 2, axis: "z" }])).toBeNull();
    expect(parseTraps([{ type: "bomb", x: 1, y: 2 }])).toBeNull();
    expect(parseTraps([{ type: "spike", x: "1", y: 2 }])).toBeNull();
    expect(parseTraps("nope")).toBeNull();
    expect(parseTraps(new Array(20).fill({ type: "spike", x: 1, y: 1 }))).toBeNull();
  });
});

describe("saving a defense", () => {
  it("lets only the current holder save, matching addresses case-insensitively", async () => {
    const { deps } = setup();
    expect((await saveDefense(deps, 7, null, spike())).ok).toBe(false);
    const stranger = await saveDefense(deps, 7, "0x0000000000000000000000000000000000000009", spike());
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.status).toBe(403);
    expect((await saveDefense(deps, 7, OWNER.toLowerCase(), spike())).ok).toBe(true);
  });

  it("validates traps against the room", async () => {
    const { deps } = setup();
    const r = await saveDefense(deps, 7, OWNER, [{ type: "spike", x: room.entrance.x, y: room.entrance.y }]);
    expect(r.ok).toBe(false);
  });

  it("hands the room to the new holder after a transfer", async () => {
    const { deps, transfer } = setup();
    await saveDefense(deps, 7, OWNER, spike());
    const NEW = "0x00000000000000000000000000000000000000Ff";
    transfer(NEW);
    expect((await saveDefense(deps, 7, OWNER, [])).ok).toBe(false);
    expect((await saveDefense(deps, 7, NEW, [])).ok).toBe(true);
    const view = await getDefenseView(deps, 7, OWNER);
    expect(view.ok && view.value.isOwner).toBe(false);
  });

  it("only shows saved traps to the holder", async () => {
    const { deps } = setup();
    await saveDefense(deps, 7, OWNER, spike());
    const mine = await getDefenseView(deps, 7, OWNER);
    const theirs = await getDefenseView(deps, 7, "0x0000000000000000000000000000000000000009");
    expect(mine.ok && mine.value.traps).toEqual(spike());
    expect(theirs.ok && theirs.value.traps).toBeNull();
    expect(theirs.ok && theirs.value.defended).toBe(true);
  });

  it("makes raids use the saved defense, records the defender, and lets the owner replay", async () => {
    const { deps } = setup();
    await saveDefense(deps, 7, OWNER, spike());
    const start = await startRaid(deps, 7, "guest:raider");
    if (!start.ok) throw new Error(start.error);
    expect(start.value.practice).toBe(false);
    const moves = findSafePath(room, spike())!;
    for (let i = 0; i < moves.length; i++) await applyMove(deps, start.value.raidId, "guest:raider", moves[i], i);
    const saved = await deps.store.getRaid(start.value.raidId);
    expect(saved?.defender).toBe(OWNER);
    expect((await getReplay(deps, start.value.raidId, OWNER.toLowerCase())).ok).toBe(true);
    expect((await getReplay(deps, start.value.raidId, "guest:someone")).ok).toBe(false);
  });
});
