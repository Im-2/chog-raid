// Every tunable number for points, streaks, seasons and the daily raid. ($CHOG: src/config/chog.ts)
// Change values here; nothing else hardcodes them.

export const RETENTION = {
  season: {
    /** Seasons are fixed-length windows counted from this instant (a Monday, 00:00 UTC). */
    epoch: "2026-10-05T00:00:00Z",
    lengthDays: 7,
    /** How many places per board get a season badge. */
    badgePlaces: 3,
  },

  /** Raider points, earned only on a breach (clear). */
  raider: {
    clear: 100,
    /** Extra for your first clear of a given room in this season. Repeat clears earn `repeatClear` instead of `clear`. */
    firstClearOfRoom: 50,
    repeatClear: 10,
    /** Extra for being the first raider ever to clear a defended room. */
    firstClearEver: 150,
    /**
     * Fast clear bonus, up to `fastClearMax`: full when you match the room's par (the shortest
     * safe path), falling to 0 at par * `fastClearSlack`.
     */
    fastClearMax: 60,
    fastClearSlack: 2,
    /** Practice rooms (no defender) pay this share of raider points. */
    practiceMultiplier: 0.5,
    /** Extra for clearing today's daily raid (once per day). */
    dailyClear: 75,
  },

  /** Warden (defender) points, earned when a raider fails in your defended room. Wardens never lose points. */
  warden: {
    hold: 20,
    /** Raids from before native defenses only: each difficulty step above 1 adds this share of `hold`.
     *  Newer raids scale `hold` (and raider points) by the tier's pointsMultiplier in config/tiers.ts. */
    difficultyStep: 0.25,
    /** Each consecutive hold since the room's last breach adds this, up to `streakCap`. */
    perConsecutiveHold: 5,
    streakCap: 50,
  },

  streaks: {
    /** A raider's streak counts consecutive UTC days with at least one finished raid. */
    raidDayMinRaids: 1,
  },

  daily: {
    /** The featured room is picked from this seed + the UTC date, so everyone gets the same one. */
    seed: "chog-raid-daily",
    leaderboardSize: 20,
  },
} as const;

/** Room difficulty (1-5) from its rules and ember count: more slots, trap types and embers = harder. */
export function roomDifficulty(rules: { trapSlots: number; allowedTraps: readonly string[] }, hazardTiles: number, baseSlots = 3): number {
  const score = (rules.trapSlots - baseSlots) * 2 + (rules.allowedTraps.length - 2) * 1.5 + hazardTiles / 6;
  return Math.max(1, Math.min(5, 1 + Math.round(score / 2)));
}
