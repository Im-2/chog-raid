// Pure reward math (no I/O): payout shape validation, rank shares, ties, cutoffs, projections.
// Shared by the server (snapshots, projections) and the UI, and covered by tests.

import { REWARDS, type Board, type PayoutBand } from "@/config/rewards";

/** Problems with a payout shape ([] = valid): bands must cover ranks 1..topN once and add up to 100%. */
export function validateBands(bands: readonly PayoutBand[] = REWARDS.bands, topN: number = REWARDS.topN, split: Record<Board, number> = REWARDS.split): string[] {
  const errors: string[] = [];
  const sum = bands.reduce((s, b) => s + b.pct, 0);
  if (Math.abs(sum - 100) > 1e-9) errors.push(`band percentages add up to ${sum}, not 100`);
  let next = 1;
  for (const b of bands) {
    if (!(b.pct >= 0)) errors.push(`band ${b.from}-${b.to} has a negative percentage`);
    if (b.from !== next) errors.push(`band ${b.from}-${b.to} should start at rank ${next}`);
    if (b.to < b.from) errors.push(`band ${b.from}-${b.to} ends before it starts`);
    next = b.to + 1;
  }
  if (next - 1 !== topN) errors.push(`bands cover ranks 1-${next - 1}, not 1-${topN}`);
  const splitSum = split.wardens + split.raiders;
  if (Math.abs(splitSum - 1) > 1e-9) errors.push(`the board split adds up to ${splitSum}, not 1`);
  return errors;
}

/** The fraction of ONE board's half-pool paid to each single rank: index 0 is rank 1. Sums to 1. */
export function rankShares(bands: readonly PayoutBand[] = REWARDS.bands, topN: number = REWARDS.topN): number[] {
  const out = new Array<number>(topN).fill(0);
  for (const b of bands) {
    const n = b.to - b.from + 1;
    for (let r = b.from; r <= Math.min(b.to, topN); r++) out[r - 1] = b.pct / 100 / n;
  }
  return out;
}

export type Candidate = { id: string; points: number; count?: number };
export type RankedPlayer = {
  id: string;
  points: number;
  /** Competition rank: players on equal points share the best rank of their group (1, 2, 2, 4). */
  rank: number;
  inZone: boolean;
  /** Fraction of the board's half-pool, after splitting ties. */
  share: number;
};

/**
 * Rank candidates (already sorted best first) and give each their share. Players tied on points
 * split the combined shares of the positions they occupy; a tie that straddles the cutoff splits
 * only the positions inside the top N, and everyone in that group counts as in the zone.
 */
export function rankPlayers(sorted: readonly Candidate[], topN: number = REWARDS.topN, bands: readonly PayoutBand[] = REWARDS.bands): RankedPlayer[] {
  const shares = rankShares(bands, topN);
  const out: RankedPlayer[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].points === sorted[i].points) j++;
    const size = j - i + 1;
    const first = i + 1;
    let pool = 0;
    for (let pos = first; pos <= i + size; pos++) if (pos <= topN) pool += shares[pos - 1];
    for (let k = i; k <= j; k++) out.push({ id: sorted[k].id, points: sorted[k].points, rank: first, inZone: first <= topN, share: first <= topN ? pool / size : 0 });
    i = j + 1;
  }
  return out;
}

/**
 * Points a player outside the zone needs to reach it: enough to at least tie whoever holds the
 * last place inside (a tie there counts as inside). Null when they're already inside, aren't
 * ranked, or fewer than topN players are ranked (then there is no cutoff to reach).
 */
export function pointsToCutoff(ranked: readonly RankedPlayer[], id: string, topN: number = REWARDS.topN): number | null {
  const me = ranked.find((r) => r.id === id);
  if (!me || me.inZone || ranked.length < topN) return null;
  return Math.max(1, ranked[topN - 1].points - me.points);
}

/** A board's half of the pool, in whole $CHOG. A zero, missing or unreadable pool is 0. */
export function boardPool(poolBalance: number | string | null | undefined, board: Board, split: Record<Board, number> = REWARDS.split): number {
  const n = Number(poolBalance);
  return Number.isFinite(n) && n > 0 ? n * split[board] : 0;
}

/** Projected amount in whole $CHOG for a share of a board's half-pool (0 until the pool is funded). */
export function projectedAmount(share: number, poolBalance: number | string | null | undefined, board: Board, split: Record<Board, number> = REWARDS.split): number {
  return share * boardPool(poolBalance, board, split);
}

/** Round money for display and CSV without ever rounding a positive amount up past what the pool holds. */
export const roundDown = (n: number, decimals = 2) => Math.floor(n * 10 ** decimals + 1e-9) / 10 ** decimals;
