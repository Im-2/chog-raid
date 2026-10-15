// Tier-based native defenses: every number that makes rarer Chogs harder (and more rewarding).
// Tiers come from the Chog Genesis "Tier" trait. Real counts (all 1,969 tokens):
//   Common 1,279 · Uncommon 590 · Rare 60 (Base: Skull) · Epic 30 (Base: Radioactive) · Legendary 10 (Base: 1:1, named bosses)
//
// Native defenses are generated per room from its tokenId and tier, are always on, and can't be
// removed by the owner. The owner's traps go on top. Every room stays solvable: each native piece
// is only kept if a fair route to the exit still exists.

import type { TierId } from "@/engine/types";
export type { TierId };

export type TierSpec = {
  id: TierId;
  /** 1 (easiest) to 5 (boss). */
  level: number;
  name: string;
  /** Short flavor label shown on badges. */
  label: string;
  /** Share of open floor turned into extra walls (tighter corridors). */
  wallDensity: number;
  /** Extra ember (hazard) tiles. */
  hazards: number;
  /** Built-in patrolling guards. */
  guards: number;
  /** Built-in locked doors; each key is placed at least `keyMinDistance` steps from its door. */
  doors: number;
  keyMinDistance: number;
  /** Raider limits in this tier. */
  raiderHp: number;
  maxMoves: number;
  /** Trap slots the owner gets on top of the trait-based slots. */
  extraTrapSlots: number;
  /** Torchlight radius in tiles (fog of war): smaller = darker room. */
  lightRadius: number;
  /** Multiplies raider points for clearing and Warden points for holding. */
  pointsMultiplier: number;
};

export const TIERS: Record<TierId, TierSpec> = {
  common: {
    id: "common", level: 1, name: "Common", label: "Base",
    wallDensity: 0, hazards: 0, guards: 0, doors: 0, keyMinDistance: 0,
    raiderHp: 5, maxMoves: 60, extraTrapSlots: 0, lightRadius: 5.5, pointsMultiplier: 1,
  },
  uncommon: {
    id: "uncommon", level: 2, name: "Uncommon", label: "Tougher",
    wallDensity: 0.06, hazards: 2, guards: 1, doors: 0, keyMinDistance: 0,
    raiderHp: 5, maxMoves: 56, extraTrapSlots: 0, lightRadius: 5, pointsMultiplier: 1.25,
  },
  rare: {
    id: "rare", level: 3, name: "Rare", label: "Hard",
    wallDensity: 0.1, hazards: 4, guards: 1, doors: 1, keyMinDistance: 6,
    raiderHp: 4, maxMoves: 54, extraTrapSlots: 1, lightRadius: 4.5, pointsMultiplier: 1.6,
  },
  epic: {
    id: "epic", level: 4, name: "Epic", label: "Fortress",
    wallDensity: 0.14, hazards: 6, guards: 2, doors: 1, keyMinDistance: 8,
    raiderHp: 4, maxMoves: 50, extraTrapSlots: 1, lightRadius: 4, pointsMultiplier: 2,
  },
  legendary: {
    id: "legendary", level: 5, name: "Legendary", label: "Boss room",
    wallDensity: 0.16, hazards: 8, guards: 3, doors: 2, keyMinDistance: 8,
    raiderHp: 4, maxMoves: 50, extraTrapSlots: 2, lightRadius: 3.5, pointsMultiplier: 3,
  },
};

export const TIER_ORDER: TierId[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** The tier for a level (1-5), as stored on raid records. */
export const tierAtLevel = (level: number | null | undefined): TierSpec => TIERS[TIER_ORDER[Math.max(1, Math.min(5, level ?? 1)) - 1]];

/**
 * Boss signatures for the named 1/1s (Legendary). Each adds to the Legendary baseline.
 * Keyed by the title in the metadata name ("CHOG #53 — Blaze" -> "Blaze").
 */
export type BossSignature = {
  name: string;
  /** One line shown in the room UI. */
  blurb: string;
  extraHazards?: number;
  extraGuards?: number;
  extraDoors?: number;
  extraWallDensity?: number;
  /** Turn floor near the exit into slow water. */
  moat?: number;
  lightRadiusDelta?: number;
};

export const BOSSES: Record<string, BossSignature> = {
  Blaze: { name: "Inferno", blurb: "The floor burns: embers everywhere.", extraHazards: 8 },
  "Burning Skully": { name: "Burning Halls", blurb: "Embers and a skeleton watch.", extraHazards: 5, extraGuards: 1 },
  "Chog Scream": { name: "Echo Maze", blurb: "Dense walls and doubled-back corridors.", extraWallDensity: 0.06 },
  Chogbomination: { name: "The Pit", blurb: "Walls, embers and a guard on every turn.", extraWallDensity: 0.03, extraHazards: 3, extraGuards: 1 },
  Frogger: { name: "Flooded Vault", blurb: "A slow moat guards the exit.", moat: 10 },
  Grim: { name: "Reaper's Watch", blurb: "Extra guards patrol the dark.", extraGuards: 2, lightRadiusDelta: -0.5 },
  Halo: { name: "Holy Ward", blurb: "Bright, but sealed by holy doors.", extraDoors: 1, lightRadiusDelta: 1 },
  Krown: { name: "Throne Room", blurb: "Royal guard and a locked throne.", extraGuards: 1, extraDoors: 1 },
  Midas: { name: "Gold Vault", blurb: "Three locked doors, keys far apart.", extraDoors: 1 },
  Redd: { name: "Blood Run", blurb: "Embers line the only road.", extraHazards: 6 },
};

/** Difficulty rating (1-5 stars) from the room's difficulty score (0-100). */
export const RATING_THRESHOLDS = [0, 22, 36, 50, 64] as const;
