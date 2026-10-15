import { describe, expect, it } from "vitest";
import { mockPixels } from "@/nft/mockArt";
import { fogRoom, fogView, publicRoom, seenMask } from "./fog";
import { generateRoom } from "./generate";
import { simulateRaid } from "./simulate";
import { findSafePath, sampleTraps } from "./traps";
import { exploredCells, litCells } from "./visibility";
import type { Room, TierId } from "./types";

const room = (id: number, tier: TierId = "rare"): Room =>
  generateRoom({ tokenId: id, pixels: mockPixels(id), traits: [{ trait_type: "Tier", value: tier }] });

describe("fog of war", () => {
  it("lights only tiles within the torch radius and in line of sight", () => {
    const r = room(7);
    const lit = litCells(r, r.entrance);
    for (const i of lit) {
      const x = i % r.size;
      const y = Math.floor(i / r.size);
      expect((x - r.entrance.x) ** 2 + (y - r.entrance.y) ** 2).toBeLessThanOrEqual(r.tier.lightRadius ** 2);
    }
    expect(lit).toContain(r.entrance.y * r.size + r.entrance.x);
    // A smaller torch on a higher tier never lights more.
    expect(litCells(room(7, "legendary"), r.entrance).length).toBeLessThanOrEqual(litCells(room(7, "common"), r.entrance).length);
  });

  it("walls block sight", () => {
    const r = room(3);
    r.tiles = r.tiles.map(() => "floor");
    const at = { x: 2, y: 8 };
    for (let y = 0; y < r.size; y++) r.tiles[y * r.size + 4] = "wall";
    const lit = new Set(litCells(r, at, 6));
    expect(lit.has(8 * r.size + 4)).toBe(true); // the wall itself is lit
    expect(lit.has(8 * r.size + 6)).toBe(false); // nothing behind it
  });

  it("never encodes an unseen tile, and the client rebuild matches every seen one", () => {
    for (let id = 1; id <= 40; id++) {
      const r = room(id);
      const traps = sampleTraps(r, id);
      const moves = findSafePath(r, traps)!.slice(0, 8);
      const path = simulateRaid(r, traps, moves).path;
      const fog = fogView(r, path);
      const seen = seenMask(fog);
      const explored = exploredCells(r, path);
      seen.forEach((s, i) => {
        const endpoint = i === r.entrance.y * r.size + r.entrance.x || i === r.exit.y * r.size + r.exit.x;
        expect(s).toBe(explored[i] || endpoint);
      });
      expect(fog.colors.length).toBe(seen.filter(Boolean).length * 6);
      const known = fogRoom(publicRoom(r), fog);
      seen.forEach((s, i) => {
        if (!s) return;
        expect(known.tiles[i]).toBe(r.tiles[i]);
        expect(known.colors[i]).toBe(r.colors[i]);
      });
    }
  });

  it("the public room carries no tiles, colors or native positions", () => {
    const pub = publicRoom(room(9, "legendary")) as Record<string, unknown>;
    expect(pub.tiles).toBeUndefined();
    expect(pub.colors).toBeUndefined();
    expect(pub.carved).toBeUndefined();
    expect(JSON.stringify(pub.native)).not.toMatch(/"x"|"walls":\[/);
  });

  it("is deterministic, so a replay shows exactly what the raider saw at every step", () => {
    const r = room(11, "epic");
    const moves = findSafePath(r, r.native.traps)!;
    const path = simulateRaid(r, r.native.traps, moves).path;
    for (let k = 1; k <= path.length; k++) expect(fogView(r, path.slice(0, k))).toEqual(fogView(r, path.slice(0, k)));
  });
});
