import { describe, expect, it } from "vitest";
import { EXTRA_MOVES, TIERS } from "@/config/tiers";
import { mockPixels } from "@/nft/mockArt";
import { generateRoom } from "./generate";
import { legacyRoom, roomForRaid, NATIVE_ENGINE } from "./native";
import { simulateRaid } from "./simulate";
import { findSafePath, guardRoute } from "./traps";
import type { Move, Point, RaidInput, Room, TierId } from "./types";

const room = (id: number, tier: TierId): Room =>
  generateRoom({ tokenId: id, pixels: mockPixels(id), traits: [{ trait_type: "Tier", value: tier }] });

/** Moves that walk from `from` to `to` over open tiles (BFS), or null. */
function walk(r: Room, from: Point, to: Point): Move[] | null {
  const idx = (p: Point) => p.y * r.size + p.x;
  const prev = new Map<number, [number, Move]>([[idx(from), [-1, "U"]]]);
  const q = [from];
  const D: [Move, number, number][] = [["U", 0, -1], ["D", 0, 1], ["L", -1, 0], ["R", 1, 0]];
  while (q.length) {
    const p = q.shift()!;
    if (p.x === to.x && p.y === to.y) {
      const out: Move[] = [];
      for (let k = idx(p); prev.get(k)![0] !== -1; k = prev.get(k)![0]) out.push(prev.get(k)![1]);
      return out.reverse();
    }
    for (const [m, dx, dy] of D) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= r.size || n.y >= r.size || prev.has(idx(n))) continue;
      const t = r.tiles[idx(n)];
      if (t !== "floor" && t !== "water" && t !== "hazard") continue;
      prev.set(idx(n), [idx(p), m]);
      q.push(n);
    }
  }
  return null;
}

describe("extra moves", () => {
  it("places the tier's pickups a short detour off the route, deterministically", () => {
    for (const tier of ["common", "rare", "legendary"] as TierId[]) {
      for (let id = 1; id <= 20; id++) {
        const r = room(id, tier);
        expect(r.native.pickups.length).toBeLessThanOrEqual(TIERS[tier].movePickups);
        expect(room(id, tier).native.pickups).toEqual(r.native.pickups);
        for (const i of r.native.pickups) expect(r.tiles[i]).toBe("floor");
      }
    }
    const placed = Array.from({ length: 20 }, (_, i) => room(i + 1, "legendary").native.pickups.length);
    expect(placed.reduce((a, b) => a + b, 0)).toBeGreaterThan(20); // most boss rooms get both
  });

  it("a pickup adds moves once", () => {
    const r = Array.from({ length: 20 }, (_, k) => room(k + 1, "legendary")).find((x) => x.native.pickups.length > 0)!;
    const i = r.native.pickups[0];
    const target = { x: i % r.size, y: Math.floor(i / r.size) };
    const there = walk(r, r.entrance, target)!;
    expect(there).not.toBeNull();
    const back = walk(r, target, r.entrance)!;
    // Locked doors and hp aside, the walk only needs to reach the tile twice.
    const res = simulateRaid({ ...r, rules: { ...r.rules, raiderHp: 99, maxMoves: 999 } }, [], [...there, ...back, ...walk(r, r.entrance, target)!]);
    const gains = res.events.filter((e) => e.kind === "moves");
    expect(gains).toHaveLength(1);
    expect(gains[0].amount).toBe(EXTRA_MOVES.pickupValue);
    expect(res.pickedUp).toEqual([i]);
  });

  it("Keep going adds moves once, only right after running out, and replays exactly", () => {
    const r = room(4, "common");
    const bump: Move = r.entrance.x === 0 ? "L" : "R"; // walking into the edge spends a move
    const out: RaidInput[] = new Array(r.rules.maxMoves).fill(bump);
    expect(simulateRaid(r, [], out).outcome).toBe("out_of_moves");

    const more = simulateRaid(r, [], [...out, "E", "R"]);
    expect(more.outcome).toBe("incomplete");
    expect(more.extended).toBe(1);
    expect(more.movesLeft).toBe(EXTRA_MOVES.extend - 1);
    expect(simulateRaid(r, [], [...out, "E", "R"])).toEqual(more);

    // A second run-out ends the raid even with another "E".
    const twice = simulateRaid(r, [], [...out, "E", ...new Array(EXTRA_MOVES.extend).fill(bump), "E", "R"]);
    expect(twice.outcome).toBe("out_of_moves");
    expect(twice.extended).toBe(1);

    // "E" before running out does nothing.
    const early = simulateRaid(r, [], ["E", bump]);
    expect(early.movesLeft).toBe(r.rules.maxMoves - 1);
  });

  it("an E in the list doesn't shift guard timing", () => {
    const r = room(7, "epic");
    const g = r.native.traps.find((t) => t.type === "guard");
    if (!g) return;
    const moves = findSafePath(r, r.native.traps)!;
    const a = simulateRaid(r, r.native.traps, moves);
    const b = simulateRaid(r, r.native.traps, ["E", ...moves]);
    expect(b.guards).toEqual(a.guards);
    expect(guardRoute(r, g).length).toBeGreaterThan(0);
  });

  it("raids from before pickups replay on the room without them", () => {
    const r = room(4, "legendary");
    expect(roomForRaid(r, NATIVE_ENGINE).native.pickups).toEqual(r.native.pickups);
    expect(roomForRaid(r, 2).native.pickups).toEqual([]);
    expect(roomForRaid(r, 2).native.traps).toEqual(r.native.traps);
    expect(roomForRaid(r, undefined)).toEqual(legacyRoom(r));
  });
});
