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
  /** Fog of war: only what the torch has lit is shown. Off = the whole room is visible. */
  fog: boolean;
  /** Torchlight radius in tiles when there is fog. */
  lightRadius: number;
  /** "+moves" pickups placed a short detour off the route (see EXTRA_MOVES.pickupValue). */
  movePickups: number;
  /** Multiplies raider points for clearing and Warden points for holding. */
  pointsMultiplier: number;
};

export const TIERS: Record<TierId, TierSpec> = {
  common: {
    id: "common", level: 1, name: "Common", label: "Base",
    wallDensity: 0, hazards: 0, guards: 0, doors: 0, keyMinDistance: 0,
    raiderHp: 5, maxMoves: 60, extraTrapSlots: 0, fog: false, lightRadius: 6, movePickups: 0, pointsMultiplier: 1,
  },
  uncommon: {
    id: "uncommon", level: 2, name: "Uncommon", label: "Tougher",
    wallDensity: 0.06, hazards: 2, guards: 1, doors: 0, keyMinDistance: 0,
    raiderHp: 5, maxMoves: 56, extraTrapSlots: 0, fog: false, lightRadius: 6, movePickups: 0, pointsMultiplier: 1.25,
  },
  rare: {
    id: "rare", level: 3, name: "Rare", label: "Hard",
    wallDensity: 0.1, hazards: 4, guards: 1, doors: 1, keyMinDistance: 6,
    raiderHp: 4, maxMoves: 54, extraTrapSlots: 1, fog: false, lightRadius: 6, movePickups: 1, pointsMultiplier: 1.6,
  },
  epic: {
    id: "epic", level: 4, name: "Epic", label: "Fortress",
    wallDensity: 0.28, hazards: 10, guards: 4, doors: 1, keyMinDistance: 10,
    raiderHp: 4, maxMoves: 48, extraTrapSlots: 1, fog: false, lightRadius: 6, movePickups: 1, pointsMultiplier: 2,
  },
  legendary: {
    id: "legendary", level: 5, name: "Legendary", label: "Boss room",
    wallDensity: 0.28, hazards: 12, guards: 4, doors: 2, keyMinDistance: 10,
    raiderHp: 4, maxMoves: 44, extraTrapSlots: 3, fog: true, lightRadius: 4.5, movePickups: 2, pointsMultiplier: 3,
  },
};

export const TIER_ORDER: TierId[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** The tier for a level (1-5), as stored on raid records. */
export const tierAtLevel = (level: number | null | undefined): TierSpec => TIERS[TIER_ORDER[Math.max(1, Math.min(5, level ?? 1)) - 1]];

/**
 * Practice traps: what an undefended room gets until its holder sets their own. Placed on or
 * beside the fair route so a practice raid always has something to dodge: guards and locked doors
 * are visible, spikes and teleporters hidden until stepped on. Rarer tiers already have native
 * guards and doors, so their practice set is mostly hidden traps.
 */
export const PRACTICE: Record<TierId, { guards: number; doors: number; spikes: number; teleporters: number }> = {
  common: { guards: 1, doors: 1, spikes: 2, teleporters: 0 },
  uncommon: { guards: 1, doors: 1, spikes: 2, teleporters: 1 },
  rare: { guards: 0, doors: 0, spikes: 2, teleporters: 1 },
  epic: { guards: 0, doors: 0, spikes: 2, teleporters: 1 },
  legendary: { guards: 0, doors: 0, spikes: 3, teleporters: 1 },
};

/** Ways to get more moves. */
export const EXTRA_MOVES = {
  /** Moves added by each pickup on the map (once per pickup per raid). */
  pickupValue: 6,
  /** "Keep going": moves added when a raider runs out, and how many times per raid. */
  extend: 10,
  extendLimit: 1,
  /** A clear that used "Keep going" pays this share of raider points and skips fast-clear,
   *  fastest-clear and daily-board rankings. */
  assistedPointsMultiplier: 0.5,
} as const;

/** Fog look in boss rooms: explored-but-unlit dimming, and darkness at the torch's edge (0-1). */
export const FOG_LOOK = { explored: 0.3, edge: 0.45 } as const;

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

/**
 * Difficulty score (0-100) weights, applied to the room's real layout after native defenses
 * (engine/native.ts difficultyOf). Each term is capped so no single factor (like a very red
 * Chog's art turning into embers) can dominate.
 */
export const DIFFICULTY = {
  /** Shortest fair route as a share of the move budget: 0 points at `routeFrom`, `route` points at `routeTo`. */
  route: 30,
  routeFrom: 0.25,
  routeTo: 0.75,
  /** Per HP below the base 5. */
  perMissingHp: 10,
  perGuard: 5,
  maxGuards: 4,
  perDoor: 6,
  /** Per ember tile, counting at most `maxHazards`. */
  perHazard: 0.3,
  maxHazards: 30,
  /** Times the share of the room that is wall or void. */
  cramped: 10,
  /** Per owner trap slot above the base 3. */
  perExtraSlot: 2.5,
  /** Per move below the base 60. */
  perMissingMove: 0.5,
} as const;

/** Difficulty rating (1-5 pips) from the score: the minimum score for each rating. */
export const RATING_THRESHOLDS = [0, 20, 36, 50, 66] as const;
