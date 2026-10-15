import { describe, expect, it } from "vitest";
import { TIER_ORDER, TIERS } from "@/config/tiers";
import { mockPixels } from "@/nft/mockArt";
import { generateRoom } from "./generate";
import { tierOf, withNative } from "./native";
import { simulateRaid } from "./simulate";
import { findSafePath, sampleTraps, validateTraps } from "./traps";
import type { TierId, Trait } from "./types";

const traitsFor = (tier: TierId): Trait[] =>
  tier === "legendary"
    ? [{ trait_type: "Base", value: "1:1" }, { trait_type: "Tier", value: "Legendary" }]
    : [{ trait_type: "Tier", value: TIERS[tier].name }];

const room = (id: number, tier: TierId, title: string | null = tier === "legendary" ? "Blaze" : null) =>
  generateRoom({ tokenId: id, pixels: mockPixels(id), traits: traitsFor(tier), title });

const IDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("tiers", () => {
  it("reads the tier from the Tier trait, falling back to its Base trait", () => {
    expect(tierOf([{ trait_type: "Tier", value: "Epic" }])).toBe("epic");
    expect(tierOf([{ trait_type: "Base", value: "Skull" }])).toBe("rare");
    expect(tierOf([{ trait_type: "Base", value: "1:1" }])).toBe("legendary");
    expect(tierOf([])).toBe("common");
  });

  for (const tier of TIER_ORDER) {
    describe(tier, () => {
      it("is solvable with native defenses, and with owner traps on top", () => {
        for (const id of IDS) {
          const r = room(id, tier);
          const route = findSafePath(r, r.native.traps);
          expect(route, `${tier} ${id}`).not.toBeNull();
          expect(simulateRaid(r, r.native.traps, route!).outcome, `${tier} ${id}`).toBe("breach");

          const owner = sampleTraps(r, id * 7);
          expect(validateTraps(r, owner).ok).toBe(true);
          const all = withNative(r, owner);
          const fair = findSafePath(r, all);
          expect(fair, `${tier} ${id} + owner`).not.toBeNull();
          expect(simulateRaid(r, all, fair!).outcome, `${tier} ${id} + owner`).toBe("breach");
        }
      });

      it("is deterministic", () => {
        for (const id of IDS.slice(0, 10)) expect(room(id, tier)).toEqual(room(id, tier));
      });

      it("applies the tier's raider limits and owner slots", () => {
        const r = room(3, tier);
        expect(r.tier.id).toBe(tier);
        expect(r.rules.raiderHp).toBe(TIERS[tier].raiderHp);
        expect(r.rules.maxMoves).toBe(TIERS[tier].maxMoves);
      });
    });
  }

  it("never lets the owner remove or overlap native defenses", () => {
    const r = room(5, "epic");
    const g = r.native.traps.find((t) => t.type === "guard")!;
    expect(g).toBeDefined();
    expect(validateTraps(r, [{ type: "spike", x: g.x, y: g.y }]).ok).toBe(false);
  });

  it("orders difficulty by tier: every step up scores measurably higher", () => {
    const avg = TIER_ORDER.map((tier) => IDS.reduce((s, id) => s + room(id, tier).difficulty.score, 0) / IDS.length);
    for (let i = 1; i < avg.length; i++) expect(avg[i], `${TIER_ORDER[i]} vs ${TIER_ORDER[i - 1]}`).toBeGreaterThan(avg[i - 1] + 3);
    for (const id of IDS) expect(room(id, "legendary").difficulty.score).toBeGreaterThan(room(id, "common").difficulty.score);
  });

  it("adds more native defenses on higher tiers", () => {
    const count = (tier: TierId) =>
      IDS.reduce((s, id) => {
        const n = room(id, tier).native;
        return s + n.traps.length + n.walls.length + n.hazards.length;
      }, 0);
    const counts = TIER_ORDER.map(count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });

  it("gives each named 1/1 its boss signature", () => {
    expect(room(9, "legendary", "Blaze").native.boss?.name).toBe("Inferno");
    expect(room(9, "legendary", "Frogger").native.moat.length).toBeGreaterThan(0);
    expect(room(9, "legendary", "Midas").native.traps.filter((t) => t.type === "lockdoor").length).toBeGreaterThanOrEqual(2);
  });
});
