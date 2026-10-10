import { describe, expect, it } from "vitest";
import { mockPixels, mockTraits } from "@/nft/mockArt";
import { classifyPixel } from "./color";
import { GAME, ROOM_SIZE } from "./config";
import { generateRoom } from "./generate";
import { simulateRaid } from "./simulate";
import { effectForTrait, resolveRules, TRAIT_RULES } from "./traitRules";
import { findSafePath, guardAt, guardRoute, sampleTraps, validateTraps } from "./traps";
import type { Move, Room, Tile, Trap } from "./types";

const mockRoom = (id: number) =>
  generateRoom({ tokenId: id, pixels: mockPixels(id), traits: mockTraits(id) });

/** Hand-built room. Legend: '.' floor, '#' wall, '~' water, '^' hazard, ' ' void. Missing rows/cols are wall. */
function makeRoom(rows: string[], overrides: Partial<Room["rules"]> = {}): Room {
  const map: Record<string, Tile> = { ".": "floor", "#": "wall", "~": "water", "^": "hazard", " ": "void" };
  const tiles: Tile[] = [];
  for (let y = 0; y < ROOM_SIZE; y++) {
    for (let x = 0; x < ROOM_SIZE; x++) tiles.push(map[rows[y]?.[x] ?? "#"]);
  }
  const n = ROOM_SIZE * ROOM_SIZE;
  return {
    tokenId: 0,
    size: ROOM_SIZE,
    seed: 0,
    tiles,
    colors: new Array(n).fill("#000000"),
    carved: new Array(n).fill(false),
    entrance: { x: 0, y: 1 },
    exit: { x: 15, y: 1 },
    rules: {
      trapSlots: 6,
      allowedTraps: ["spike", "teleporter", "guard", "lockdoor"],
      raiderHp: GAME.raiderHp,
      maxMoves: GAME.maxMoves,
      notes: [],
      ...overrides,
    },
  };
}

// A straight corridor on row 1 from entrance (0,1) to exit (15,1), open area on rows 2-3.
const CORRIDOR = ["################", "................", "................", "................"];
const R = (k: number): Move[] => new Array(k).fill("R");

describe("color mapping", () => {
  it("maps colors to tiles by the documented rules", () => {
    expect(classifyPixel([20, 15, 40])).toBe("wall");
    expect(classifyPixel([59, 130, 246])).toBe("water");
    expect(classifyPixel([255, 59, 47])).toBe("hazard");
    expect(classifyPixel([142, 92, 240])).toBe("floor");
    expect(classifyPixel([245, 238, 220])).toBe("floor");
  });
});

describe("room generation", () => {
  it("is deterministic", () => {
    for (let id = 1; id <= 100; id++) expect(mockRoom(id)).toEqual(mockRoom(id));
  });

  it("differs between Chogs", () => {
    expect(mockRoom(1).tiles).not.toEqual(mockRoom(2).tiles);
  });

  it("puts entrance on the left edge and exit on the right edge, both open", () => {
    for (let id = 1; id <= 100; id++) {
      const r = mockRoom(id);
      expect(r.entrance.x).toBe(0);
      expect(r.exit.x).toBe(ROOM_SIZE - 1);
      expect(r.tiles[r.entrance.y * r.size]).toBe("floor");
      expect(r.tiles[r.exit.y * r.size + r.size - 1]).toBe("floor");
    }
  });

  it("is always solvable without traps, and the proof path actually breaches", () => {
    for (let id = 1; id <= 600; id++) {
      const r = mockRoom(id);
      const path = findSafePath(r, []);
      expect(path, `room ${id}`).not.toBeNull();
      expect(simulateRaid(r, [], path!).outcome, `room ${id}`).toBe("breach");
    }
  });

  it("turns the flat background into void and keeps the Chog's dark marks as walls", () => {
    const r = mockRoom(1);
    expect(r.tiles[0]).toBe("void");
    const traits = Object.fromEntries(mockTraits(1).map((t) => [t.trait_type, t.value]));
    if (traits.Eyes === "Round") expect(r.tiles[7 * ROOM_SIZE + 3]).toBe("wall");
  });

  it("rejects wrong pixel counts", () => {
    expect(() => generateRoom({ tokenId: 1, pixels: [], traits: [] })).toThrow();
  });
});

describe("trait rules", () => {
  it("applies real Chog Genesis trait effects", () => {
    const { rules, hazardSprinkle } = resolveRules([
      { trait_type: "Tier", value: "Rare" },
      { trait_type: "Head", value: "Crown" },
      { trait_type: "Eyes", value: "fire laser" },
      { trait_type: "Skin", value: "Pink" },
    ]);
    expect(rules.trapSlots).toBe(GAME.baseTrapSlots + 2);
    expect(rules.allowedTraps).toContain("guard");
    expect(hazardSprinkle).toBe(4);
    expect(rules.notes.length).toBe(3);
  });

  it("gives a common Chog the base rules", () => {
    const { rules, hazardSprinkle } = resolveRules([
      { trait_type: "Tier", value: "Common" },
      { trait_type: "Eyes", value: "Happy" },
      { trait_type: "Head", value: "Mon Cap" },
    ]);
    expect(rules.trapSlots).toBe(GAME.baseTrapSlots);
    expect(rules.allowedTraps).toEqual(["spike", "teleporter"]);
    expect(hazardSprinkle).toBe(0);
  });

  it("matches values case-insensitively", () => {
    expect(effectForTrait({ trait_type: "Eyes", value: "FIRE LASER" })).toEqual(
      effectForTrait({ trait_type: "Eyes", value: "fire laser" }),
    );
  });

  it("ignores unlisted values of known types, and gives unknown types a stable fallback", () => {
    expect(effectForTrait({ trait_type: "Head", value: "Brand New Hat" })).toEqual({});
    expect(effectForTrait({ trait_type: "Head", value: "None" })).toEqual({});
    const t = { trait_type: "Weather", value: "Rain" };
    expect(effectForTrait(t)).toEqual(effectForTrait({ ...t }));
  });

  it("only uses trait types from the real collection", () => {
    const real = ["Accessory", "Aura", "Background", "Base", "Body", "Eyes", "Form", "Head", "Mouth", "Naked", "Side", "Skin", "Tier"];
    expect(Object.keys(TRAIT_RULES).sort()).toEqual(real);
  });

  it("caps trap slots", () => {
    const many = Array.from({ length: 10 }, () => ({ trait_type: "Head", value: "Crown" }));
    expect(resolveRules(many).rules.trapSlots).toBe(GAME.maxTrapSlots);
  });
});

describe("trap validation", () => {
  const room = makeRoom(CORRIDOR);

  it("accepts a fair setup", () => {
    expect(validateTraps(room, [{ type: "spike", x: 5, y: 1 }])).toEqual({ ok: true });
  });

  it("rejects bad placements", () => {
    const bad: [string, Trap[]][] = [
      ["wall", [{ type: "spike", x: 5, y: 0 }]],
      ["entrance", [{ type: "spike", x: 0, y: 1 }]],
      ["outside", [{ type: "spike", x: 16, y: 1 }]],
      ["overlap", [{ type: "spike", x: 5, y: 1 }, { type: "teleporter", x: 5, y: 1 }]],
    ];
    for (const [why, traps] of bad) expect(validateTraps(room, traps).ok, why).toBe(false);
  });

  it("enforces slots and unlocked types", () => {
    const limited = makeRoom(CORRIDOR, { trapSlots: 1, allowedTraps: ["spike", "teleporter"] });
    expect(validateTraps(limited, [{ type: "spike", x: 3, y: 1 }, { type: "spike", x: 4, y: 1 }]).ok).toBe(false);
    expect(validateTraps(limited, [{ type: "guard", x: 3, y: 1, axis: "h" }]).ok).toBe(false);
  });

  it("rejects setups that make the room impossible", () => {
    const walled: Trap[] = [1, 2, 3].map((y) => ({ type: "teleporter", x: 8, y }));
    expect(validateTraps(room, walled).ok).toBe(false);
  });

  it("random valid layouts stay solvable in real simulation", () => {
    for (let id = 1; id <= 300; id++) {
      const r = mockRoom(id);
      const traps = sampleTraps(r, id);
      expect(validateTraps(r, traps).ok).toBe(true);
      const path = findSafePath(r, traps)!;
      expect(simulateRaid(r, traps, path).outcome, `room ${id}`).toBe("breach");
    }
  });
});

describe("raid simulation", () => {
  const room = makeRoom(CORRIDOR);

  it("breaches by walking to the exit", () => {
    const res = simulateRaid(room, [], R(15));
    expect(res.outcome).toBe("breach");
    expect(res.stepsProcessed).toBe(15);
    expect(res.movesLeft).toBe(GAME.maxMoves - 15);
  });

  it("is incomplete when moves run out of input", () => {
    expect(simulateRaid(room, [], R(3)).outcome).toBe("incomplete");
  });

  it("ignores moves after the raid ends", () => {
    const res = simulateRaid(room, [], [...R(15), "L", "L"]);
    expect(res.outcome).toBe("breach");
    expect(res.stepsProcessed).toBe(15);
  });

  it("bumps into walls without moving but spends a move", () => {
    const res = simulateRaid(room, [], ["U"]);
    expect(res.endAt).toEqual(room.entrance);
    expect(res.movesLeft).toBe(GAME.maxMoves - 1);
    expect(res.events[0].kind).toBe("bump");
  });

  it("charges extra moves for water and damage for hazards", () => {
    const r = makeRoom(["################", ".~^............."]);
    const res = simulateRaid(r, [], ["R", "R"]);
    expect(res.movesLeft).toBe(GAME.maxMoves - GAME.waterMoveCost - 1);
    expect(res.hp).toBe(GAME.raiderHp - GAME.hazardDamage);
  });

  it("spikes hurt and can kill", () => {
    const spikes: Trap[] = [1, 2, 3].map((x) => ({ type: "spike", x, y: 1 }));
    const res = simulateRaid(room, spikes, R(3));
    expect(res.outcome).toBe("defeated");
    expect(res.endAt).toEqual({ x: 3, y: 1 });
  });

  it("teleporters send you back to the entrance", () => {
    const res = simulateRaid(room, [{ type: "teleporter", x: 2, y: 1 }], R(2));
    expect(res.endAt).toEqual(room.entrance);
    expect(res.events.some((e) => e.kind === "teleport")).toBe(true);
  });

  it("lock doors block until the key is picked up", () => {
    const traps: Trap[] = [{ type: "lockdoor", x: 3, y: 1, key: { x: 1, y: 2 } }];
    expect(simulateRaid(room, traps, R(3)).endAt).toEqual({ x: 2, y: 1 });
    const withKey = simulateRaid(room, traps, ["D", "R", "U", "R", "R", "R"]);
    expect(withKey.keys).toEqual([0]);
    expect(withKey.endAt).toEqual({ x: 4, y: 1 });
  });

  it("guards patrol back and forth and hurt on contact", () => {
    const g = { type: "guard" as const, x: 5, y: 1, axis: "h" as const };
    const route = guardRoute(room, g);
    expect(route.length).toBe(GAME.guardRouteMax);
    expect([0, 1, 2, 3, 4, 5, 6].map((t) => guardAt(route, t).x)).toEqual([5, 6, 7, 8, 7, 6, 5]);
    const res = simulateRaid(room, [g], R(8));
    expect(res.events.some((e) => e.source === "guard")).toBe(true);
  });

  it("runs out of moves", () => {
    const res = simulateRaid(room, [], new Array(GAME.maxMoves).fill("U"));
    expect(res.outcome).toBe("out_of_moves");
  });

  it("rejects invalid moves", () => {
    expect(() => simulateRaid(room, [], ["X" as Move])).toThrow();
  });

  it("is deterministic", () => {
    const r = mockRoom(42);
    const traps = sampleTraps(r, 7);
    const moves = findSafePath(r, traps)!;
    expect(simulateRaid(r, traps, moves)).toEqual(simulateRaid(r, traps, moves));
  });
});
