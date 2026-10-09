// Trait -> room rule table for Chog Genesis. This is the one place to tune how traits shape a room.
//
// Built from the real collection metadata (1,969 Chogs, 13 trait types). Values are grouped
// by theme so the table stays readable:
//
//   Tier       rarer Chogs get more trap slots and more trap types
//   Eyes       lasers scorch the floor (embers); visors / VR / glasses unlock guards (they see you)
//   Head       royal & holy headgear: +1 slot; horns: embers; heist hats: lock doors
//   Body       armor & royal robes: +1 slot; jail & guard outfits: lock doors / guards; fire: embers
//   Mouth      gold teeth & coins: lock doors (a treasure vault)
//   Aura       fiery auras: embers; royal auras: +1 slot
//   Accessory  knife: guards; coin: lock doors; candles: embers
//   Background radioactive / blood-red skies: embers
//   Base/Form  skull Chogs raise undead guards; radioactive: embers; 1:1s get +2 slots
//   Skin, Side, Naked: no effect
//
// Lookup: TRAIT_RULES[trait_type][value, case-insensitive]. A listed trait type with an unlisted
// value has no effect. A trait type not listed at all (e.g. a future metadata field) gets a stable
// fallback from FALLBACK_EFFECTS by hashing "trait_type:value".

import { GAME } from "./config";
import { hashString } from "./rng";
import type { RoomRules, Trait, TrapType } from "./types";

export type TraitEffect = {
  /** Added to the defender's trap slots (total is capped at GAME.maxTrapSlots). */
  trapSlots?: number;
  /** Trap types this trait unlocks for the defender. */
  unlock?: TrapType[];
  /** Number of extra ember (hazard) tiles scattered across floor tiles. */
  hazardSprinkle?: number;
  /** Shown to players, e.g. "Crown: +1 trap slot". Generated from the effect if omitted. */
  note?: string;
};

export const BASE_TRAPS: TrapType[] = ["spike", "teleporter"];

/** Give every value in a themed group the same effect. Keys are lowercased. */
function group(values: string[], effect: TraitEffect): Record<string, TraitEffect> {
  return Object.fromEntries(values.map((v) => [v.toLowerCase(), effect]));
}

const LASERS = ["Purple laser", "fire laser", "Green laser", "cyan laser"];
const SEEING_EYES = [
  "Gradient visor", "Sunset visor", "Plasma visor", "Modern VR", "Classic VR", "Anime Glass",
  "Retro Glass", "3D Glass", "BTC Glass", "Chog Viper", "Thug", "MOG",
];
const ROYAL_HEAD = ["Crown", "Spartan Helmet", "Silver wreath", "Gold Thorn", "Silver Thorn", "Holy Seal", "Diamond"];
const HORNS = ["Red Horn", "Demon Horn", "Purple Horn", "Void Horn", "devil horn"];
const HEIST_HEAD = ["Robber", "Mafia Hat", "Plumber"];
const ARMOR_BODY = ["Golden Armor", "Kings Robe", "Astro Suit", "Sci Fi", "Dragon suit", "Shark Suit"];
const JAIL_BODY = ["Inmate", "Prisoner"];
const GUARD_BODY = ["Squid Game Guard", "Gangster suit", "Blue Mafia"];
const TREASURE_MOUTH = ["Gold Tooth", "BTC Coin", "Mon coin"];
const FIERY_AURA = ["Burning Aura", "Fiery Aura", "Fire", "Electric Shock"];
const ROYAL_AURA = ["Royal Aura", "Royal Blue Aura", "Royal Blue"];
const TOXIC_SKY = ["Radioactive", "Blood Red", "Red Sky"];

export const TRAIT_RULES: Record<string, Record<string, TraitEffect>> = {
  Tier: {
    uncommon: { trapSlots: 1, note: "Uncommon: +1 trap slot" },
    rare: { trapSlots: 1, unlock: ["guard"], note: "Rare: +1 trap slot, guards" },
    epic: { trapSlots: 2, unlock: ["guard", "lockdoor"], note: "Epic: +2 trap slots, guards, lock doors" },
    legendary: { trapSlots: 3, unlock: ["guard", "lockdoor"], note: "Legendary: +3 trap slots, every trap" },
  },
  Eyes: {
    ...group(LASERS, { hazardSprinkle: 4, note: "Laser eyes: the floor is scorched with embers" }),
    ...group(SEEING_EYES, { unlock: ["guard"], note: "Visor eyes: guards unlocked" }),
  },
  Head: {
    ...group(ROYAL_HEAD, { trapSlots: 1, note: "Royal headgear: +1 trap slot" }),
    ...group(HORNS, { hazardSprinkle: 3, note: "Horns: embers in the room" }),
    ...group(HEIST_HEAD, { unlock: ["lockdoor"], note: "Heist hat: lock doors unlocked" }),
    "blue laser": { hazardSprinkle: 4, note: "Laser: the floor is scorched with embers" },
  },
  Body: {
    ...group(ARMOR_BODY, { trapSlots: 1, note: "Armor: +1 trap slot" }),
    ...group(JAIL_BODY, { unlock: ["lockdoor"], note: "Jailbird: lock doors unlocked" }),
    ...group(GUARD_BODY, { unlock: ["guard"], note: "Enforcer outfit: guards unlocked" }),
    "fire shirt": { hazardSprinkle: 3, note: "Fire shirt: embers in the room" },
  },
  Mouth: {
    ...group(TREASURE_MOUTH, { unlock: ["lockdoor"], note: "Treasure mouth: lock doors unlocked" }),
  },
  Aura: {
    ...group(FIERY_AURA, { hazardSprinkle: 3, note: "Fiery aura: embers in the room" }),
    ...group(ROYAL_AURA, { trapSlots: 1, note: "Royal aura: +1 trap slot" }),
  },
  Accessory: {
    knife: { unlock: ["guard"], note: "Knife: guards unlocked" },
    coin: { unlock: ["lockdoor"], note: "Coin: lock doors unlocked" },
    "red candle": { hazardSprinkle: 2, note: "Red candle: embers in the room" },
    "green candle": { hazardSprinkle: 2, note: "Green candle: embers in the room" },
  },
  Background: {
    ...group(TOXIC_SKY, { hazardSprinkle: 3, note: "Toxic sky: embers in the room" }),
  },
  Base: {
    skull: { unlock: ["guard"], note: "Skull: undead guards unlocked" },
    radioactive: { hazardSprinkle: 3, note: "Radioactive: embers in the room" },
    "1:1": { trapSlots: 2, note: "1:1: +2 trap slots" },
  },
  Form: {},
  Skin: {},
  Side: {},
  Naked: {},
};

export const NO_EFFECT_VALUES = new Set(["none", "", "n/a"]);

/** For trait types we have never seen. Most do nothing, so rooms do not all max out. */
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
  const value = String(t.value).trim().toLowerCase();
  if (NO_EFFECT_VALUES.has(value)) return {};
  const table = TRAIT_RULES[t.trait_type];
  if (table) return table[value] ?? {};
  return FALLBACK_EFFECTS[hashString(`${t.trait_type}:${t.value}`) % FALLBACK_EFFECTS.length];
}

function describe(t: Trait, e: TraitEffect): string | null {
  if (e.note) return e.note;
  const parts: string[] = [];
  if (e.trapSlots) parts.push(`+${e.trapSlots} trap slot${e.trapSlots > 1 ? "s" : ""}`);
  if (e.unlock?.length) parts.push(`${e.unlock.join(", ")} unlocked`);
  if (e.hazardSprinkle) parts.push(`+${e.hazardSprinkle} embers`);
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
    if (note && !notes.includes(note)) notes.push(note);
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
