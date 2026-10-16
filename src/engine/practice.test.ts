import { describe, expect, it } from "vitest";
import { PRACTICE, TIER_ORDER } from "@/config/tiers";
import { mockPixels } from "@/nft/mockArt";
import { generateRoom } from "./generate";
import { withNative } from "./native";
import { practiceTraps } from "./practice";
import { simulateRaid } from "./simulate";
import { findSafePath } from "./traps";
import type { Room, TierId } from "./types";

const room = (id: number, tier: TierId): Room =>
  generateRoom({ tokenId: id, pixels: mockPixels(id), traits: [{ trait_type: "Tier", value: tier }] });

describe("practice traps", { timeout: 60_000 }, () => {
  for (const tier of TIER_ORDER) {
    it(`${tier}: fair, deterministic, and never on native pieces or endpoints`, () => {
      for (let id = 1; id <= 40; id++) {
        const r = room(id, tier);
        const traps = practiceTraps(r);
        expect(practiceTraps(r)).toEqual(traps);
        const all = withNative(r, traps);
        const route = findSafePath(r, all);
        expect(route, `${tier} ${id}`).not.toBeNull();
        expect(simulateRaid(r, all, route!).outcome).toBe("breach");
        const taken = new Set(r.native.traps.flatMap((t) => (t.type === "lockdoor" ? [t, t.key] : [t])).map((p) => p.y * r.size + p.x));
        for (const t of traps) {
          for (const p of t.type === "lockdoor" ? [t, t.key] : [t]) {
            expect(taken.has(p.y * r.size + p.x)).toBe(false);
            expect(r.tiles[p.y * r.size + p.x] === "floor" || r.tiles[p.y * r.size + p.x] === "water").toBe(true);
          }
          expect(t.x === r.entrance.x && t.y === r.entrance.y).toBe(false);
          expect(t.x === r.exit.x && t.y === r.exit.y).toBe(false);
        }
      }
    });
  }

  it("common rooms always have something visible to dodge and something hidden", () => {
    let guards = 0;
    let doors = 0;
    let spikes = 0;
    const N = 60;
    for (let id = 1; id <= N; id++) {
      const traps = practiceTraps(room(id, "common"));
      expect(traps.length).toBeGreaterThan(0);
      guards += traps.filter((t) => t.type === "guard").length;
      doors += traps.filter((t) => t.type === "lockdoor").length;
      spikes += traps.filter((t) => t.type === "spike").length;
    }
    // Placement can fail in a cramped room, but nearly every room gets the full set.
    expect(guards).toBeGreaterThan(N * PRACTICE.common.guards * 0.9);
    expect(doors).toBeGreaterThan(N * PRACTICE.common.doors * 0.8);
    expect(spikes).toBeGreaterThan(N * PRACTICE.common.spikes * 0.9);
  });
});
