// Game constants and the fixed color -> tile mapping. Tune here, not in the logic.

export const ROOM_SIZE = 16;

export const GAME = {
  raiderHp: 5,
  maxMoves: 60,
  hazardDamage: 1,
  spikeDamage: 2,
  guardDamage: 2,
  /** Entering a water tile costs this many moves. */
  waterMoveCost: 2,
  /** A guard patrols up to this many tiles (including its start) along its axis. */
  guardRouteMax: 4,
  maxLockdoors: 2,
  baseTrapSlots: 3,
  maxTrapSlots: 6,
} as const;

/**
 * Color -> tile mapping, applied per downsampled pixel, in this order:
 *
 * 1. void   : connected to the image border AND within `voidTolerance` of the
 *             dominant border color (the flat background). Impassable. This is
 *             what makes the playable area the Chog's silhouette.
 * 2. wall   : luminance < `wallMaxLuminance` (outlines, eyes, mouths, dark marks).
 * 3. water  : hue in [waterHueMin, waterHueMax] and saturation >= `waterMinSat`. Slow.
 * 4. hazard : hue >= hazardHueMin or <= hazardHueMax (reds/oranges), saturation >=
 *             `hazardMinSat` and lightness in [hazardMinLight, hazardMaxLight]. Damages.
 * 5. floor  : everything else.
 */
export const COLOR_RULES = {
  voidTolerance: 40, // euclidean RGB distance
  wallMaxLuminance: 0.2,
  waterHueMin: 185,
  waterHueMax: 250,
  waterMinSat: 0.35,
  hazardHueMin: 340,
  hazardHueMax: 25,
  hazardMinSat: 0.55,
  hazardMinLight: 0.35,
  hazardMaxLight: 0.75,
} as const;

/** Cost of passing through each tile when carving the guaranteed path. */
export const CARVE_COST = {
  floor: 1,
  water: 2,
  hazard: 8,
  wall: 20,
  void: 30,
} as const;
