// Shared engine types. The engine is pure: no DOM, no network, no Math.random.

export type Pixel = readonly [number, number, number];

export type Tile = "floor" | "wall" | "water" | "hazard" | "void";

export type Point = { x: number; y: number };

export type TrapType = "spike" | "teleporter" | "guard" | "lockdoor";

export type Trap =
  | { type: "spike"; x: number; y: number }
  | { type: "teleporter"; x: number; y: number }
  | { type: "guard"; x: number; y: number; axis: "h" | "v" }
  | { type: "lockdoor"; x: number; y: number; key: Point };

export type Trait = { trait_type: string; value: string };

export type RoomInput = {
  tokenId: number;
  /** ROOM_SIZE * ROOM_SIZE pixels, row-major, already downsampled. */
  pixels: Pixel[];
  traits: Trait[];
  /** 1/1 title from the metadata name ("CHOG #53 — Blaze" -> "Blaze"), for boss rooms. */
  title?: string | null;
};

export type TierId = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Built-in defenses every room of a tier gets. Always on; the owner can't remove them. */
export type NativeDefenses = {
  traps: Trap[];
  /** Tile indices the tier turned into walls / embers / water. */
  walls: number[];
  hazards: number[];
  moat: number[];
  boss: { title: string; name: string; blurb: string } | null;
};

export type RoomRules = {
  trapSlots: number;
  allowedTraps: TrapType[];
  raiderHp: number;
  maxMoves: number;
  /** Human-readable reasons, one per trait effect that applied. */
  notes: string[];
};

export type Room = {
  tokenId: number;
  size: number;
  seed: number;
  /** Row-major, index = y * size + x. */
  tiles: Tile[];
  /** Source pixel color per tile (hex), so the room looks like its Chog. */
  colors: string[];
  /** Tiles changed by the generator to guarantee a path. */
  carved: boolean[];
  entrance: Point;
  exit: Point;
  rules: RoomRules;
  tier: { id: TierId; level: number; name: string; label: string; lightRadius: number };
  native: NativeDefenses;
  /** 0-100 score from the room's real layout and defenses, and its 1-5 star rating. */
  difficulty: { score: number; rating: number };
};

export type Move = "U" | "D" | "L" | "R";

export type RaidOutcome = "breach" | "defeated" | "out_of_moves" | "incomplete";

export type RaidEvent = {
  step: number;
  kind: "bump" | "damage" | "teleport" | "key" | "door" | "breach" | "defeated" | "out_of_moves";
  at: Point;
  amount?: number;
  source?: "hazard" | "spike" | "guard";
};

export type RaidResult = {
  outcome: RaidOutcome;
  hp: number;
  movesLeft: number;
  /** Number of moves from the input list that were applied. */
  stepsProcessed: number;
  /** Every position occupied, starting at the entrance (teleports appear as jumps). */
  path: Point[];
  /** Indices of lockdoor traps whose key the raider holds. */
  keys: number[];
  /** Guard positions after the last processed step, in trap order (guards only). */
  guards: Point[];
  events: RaidEvent[];
  endAt: Point;
};
