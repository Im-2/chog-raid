// Trait -> room rule table. This is the one place to tune how traits shape a room.
//
// Lookup per trait: TRAIT_RULES[trait_type][value]. If a trait_type/value pair is
// not listed (e.g. real collection traits we have not tuned yet), a deterministic
// fallback is picked from FALLBACK_EFFECTS by hashing "trait_type:value", so every
// trait still has a stable effect. Values in NO_EFFECT_VALUES never do anything.
//
// Current table covers the mock collection. Replace/extend it with the real
// Chog traits once the onchain metadata is known.

import { GAME } from "./config";
import { hashString } from "./rng";
import type { RoomRules, Trait, TrapType } from "./types";

export type TraitEffect = {
  /** Added to the defender's trap slots (total is capped at GAME.maxTrapSlots). */
  trapSlots?: number;
  /** Trap types this trait unlocks for the defender. */
  unlock?: TrapType[];
  /** Number of extra hazard tiles scattered across floor tiles. */
  hazardSprinkle?: number;
  /** Shown to players, e.g. "Crown: +1 trap slot". Filled in automatically if omitted. */
  note?: string;
};

export const BASE_TRAPS: TrapType[] = ["spike", "teleporter"];

// List every known value, even with {} (no effect), so it skips the fallback.
export const TRAIT_RULES: Record<string, Record<string, TraitEffect>> = {
  Background: {
    Lilac: {}, Sky: {}, Mint: {}, Peach: {}, Cream: {},
    Night: { unlock: ["guard"], note: "Night: guards unlocked" },
  },
  Body: {
    Purple: {}, Pink: {}, Lime: {},
    Gold: { unlock: ["lockdoor"], note: "Gold: vault doors unlocked" },
    Grape: { trapSlots: 1 },
    Frost: { note: "Frost: the whole room is icy water" },
  },
  Eyes: {
    Round: {}, Sleepy: {}, Star: {},
    Laser: { hazardSprinkle: 4, note: "Laser eyes: scorched floor" },
    Shades: { unlock: ["guard"] },
  },
  Mouth: {
    Smile: {}, Grin: {}, Open: {},
    Fangs: { trapSlots: 1 },
    Tongue: { hazardSprinkle: 3 },
  },
  Pattern: {
    Spots: {}, Stripes: {}, Belly: {}, Puddles: {},
    Embers: { hazardSprinkle: 4 },
  },
  Head: {
    Crown: { trapSlots: 1 },
    Halo: { trapSlots: 1 },
    Horns: { unlock: ["guard"] },
    Cap: { unlock: ["lockdoor"] },
  },
};

export const NO_EFFECT_VALUES = new Set(["none", "", "n/a"]);

/** Most unknown traits do nothing, so rooms do not all max out. */
export const FALLBACK_EFFECTS: TraitEffect[] = [
  {},
  {},
  {},
  {},
  { trapSlots: 1 },
  { unlock: ["guard"] },
  { unlock: ["lockdoor"] },
  { hazardSprinkle: 3 },
];

export function effectForTrait(t: Trait): TraitEffect {
  if (NO_EFFECT_VALUES.has(String(t.value).toLowerCase())) return {};
  const listed = TRAIT_RULES[t.trait_type]?.[t.value];
  if (listed) return listed;
  return FALLBACK_EFFECTS[hashString(`${t.trait_type}:${t.value}`) % FALLBACK_EFFECTS.length];
}

function describe(t: Trait, e: TraitEffect): string | null {
  if (e.note) return e.note;
  const parts: string[] = [];
  if (e.trapSlots) parts.push(`+${e.trapSlots} trap slot${e.trapSlots > 1 ? "s" : ""}`);
  if (e.unlock?.length) parts.push(`${e.unlock.join(", ")} unlocked`);
  if (e.hazardSprinkle) parts.push(`+${e.hazardSprinkle} hazards`);
  return parts.length ? `${t.value}: ${parts.join(", ")}` : null;
}

export function resolveRules(traits: Trait[]): { rules: RoomRules; hazardSprinkle: number } {
  let slots: number = GAME.baseTrapSlots;
  const allowed = new Set<TrapType>(BASE_TRAPS);
  let hazardSprinkle = 0;
  const notes: string[] = [];

  for (const t of traits) {
    const e = effectForTrait(t);
    slots += e.trapSlots ?? 0;
    e.unlock?.forEach((u) => allowed.add(u));
    hazardSprinkle += e.hazardSprinkle ?? 0;
    const note = describe(t, e);
    if (note) notes.push(note);
  }

  const order: TrapType[] = ["spike", "teleporter", "guard", "lockdoor"];
  return {
    rules: {
      trapSlots: Math.min(slots, GAME.maxTrapSlots),
      allowedTraps: order.filter((t) => allowed.has(t)),
      raiderHp: GAME.raiderHp,
      maxMoves: GAME.maxMoves,
      notes,
    },
    hazardSprinkle,
  };
}
