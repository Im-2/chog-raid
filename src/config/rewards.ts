// Season Rewards: every rule and number in one place.
//
// HONEST BY DESIGN. The reward pool is the real on-chain $CHOG balance of CHOG_PRIZE_POOL_ADDRESS.
// Today it is unfunded, so nothing is claimable. When it is funded, the team pays out MANUALLY
// after the season ends, from a stored ranking snapshot. Nothing is automatic, nothing is
// guaranteed, there are no claim buttons, and no private keys exist anywhere in this project.

export type PayoutBand = {
  /** Ranks from..to (inclusive) share `pct` percent of the board's half of the pool, equally. */
  from: number;
  to: number;
  pct: number;
};

export type Board = "wardens" | "raiders";

export const REWARDS = {
  /** How the pool is divided between the two leaderboards. Must add up to 1. */
  split: { wardens: 0.5, raiders: 0.5 } as Record<Board, number>,

  /** The top N of each leaderboard share that board's half. */
  topN: 50,

  /**
   * Payout shape, as percentages of ONE board's half. A band's percentage is split equally among
   * its ranks. Must add up to 100 and cover ranks 1..topN with no gaps (validated by a test).
   */
  bands: [
    { from: 1, to: 1, pct: 20 },
    { from: 2, to: 2, pct: 12 },
    { from: 3, to: 3, pct: 8 },
    { from: 4, to: 10, pct: 25 },
    { from: 11, to: 50, pct: 35 },
  ] as readonly PayoutBand[],

  /** Who can be ranked for rewards. Everyone still appears on the public leaderboards. */
  eligibility: {
    /** Only wallets can be paid; guests are shown on the boards but never ranked for rewards. */
    walletsOnly: true,
    /** Raiders: distinct rooms cleared this season. */
    raiderMinRoomsCleared: 3,
    /**
     * Wardens: a Chog's Warden points count only if the wallet still HOLDS that Chog when the
     * season ends. Ownership is re-checked on-chain when the final snapshot is taken.
     */
    wardenMustHoldChog: true,
  },

  /** Signs of automation. Flagged raids/wallets/rooms are excluded from rewards pending review. */
  antiAbuse: {
    /** A raid with at least `speedMinMoves` moves averaging more than this many moves per second is not human. */
    maxMovesPerSecond: 12,
    speedMinMoves: 24,
    /** A wallet with this many too-fast raids is flagged. */
    flaggedRaidsToFlagWallet: 2,
    /** The same long move sequence on one room from this many different wallets is flagged. */
    identicalSequence: { minMoves: 30, minWallets: 5 },
    /** A room whose failed raids come from just a few wallets, repeatedly, is flagged (Warden farming). */
    roomFarming: { minFailedRaids: 30, maxDistinctRaiders: 2 },
  },

  /** The season is snapshotted this many minutes after it ends (the cron schedule is in vercel.json). */
  snapshotDelayMinutes: 5,
} as const;

/** Optional planned pool size, in whole $CHOG, from CHOG_POOL_TARGET. Always labeled as not funded. */
export const TARGET_LABEL = "Target (not yet funded)";
export function poolTarget(): number | null {
  const n = Number(process.env.CHOG_POOL_TARGET?.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
