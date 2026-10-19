import "server-only";
// Season Rewards, server side. See src/config/rewards.ts for the rules and the honesty contract:
// the pool is the REAL on-chain balance of CHOG_PRIZE_POOL_ADDRESS, payouts are manual, nothing
// is automatic or claimable, and no keys exist here. This module only reads and computes.

import { cookies } from "next/headers";
import { isAddress } from "viem";
import { REWARDS, poolTarget, type Board } from "@/config/rewards";
import { env } from "@/lib/env";
import { projectedAmount, rankPlayers, roundDown, type RankedPlayer } from "@/lib/rewardMath";
import { chogBalance, prizePoolAddress } from "./chog";
import { assistedRaid, scoreRaids, seasonAt, seasonByIndex, standings, stepsOf, type Award } from "./retention";
import type { RaidRecord, Store } from "./store/types";

const lc = (s: string) => s.toLowerCase();
const finished = (r: RaidRecord) => r.status === "breach" || r.status === "defeated" || r.status === "out_of_moves";

// ---------------------------------------------------------------- the pool (real balance only)

export type PoolState = {
  address: string | null;
  /** Real on-chain $CHOG balance of the pool address (whole tokens), or null when it can't be read. */
  balance: string | null;
  /** unconfigured: no pool address set · unavailable: the balance couldn't be read · unfunded: 0 · funded: > 0 */
  state: "unconfigured" | "unavailable" | "unfunded" | "funded";
  /** The optional planned target. Shown separately, always labeled, never added to the balance. */
  target: number | null;
};

export async function poolState(): Promise<PoolState> {
  const address = prizePoolAddress();
  const target = poolTarget();
  if (!address) return { address: null, balance: null, state: "unconfigured", target };
  let balance: string | null = null;
  if (env.nftAdapter === "mock") {
    // Mock mode (never production) can fake a pool so the funded UI can be demoed offline.
    try {
      const c = (await cookies()).get("mock_pool_balance")?.value;
      if (c !== undefined && /^\d+(\.\d+)?$/.test(c)) balance = c;
    } catch {}
    if (balance === null && process.env.MOCK_POOL_BALANCE) balance = process.env.MOCK_POOL_BALANCE;
    if (balance === null) balance = "0";
  } else {
    balance = await chogBalance(address); // viem balanceOf, cached for about a minute
  }
  if (balance === null) return { address, balance: null, state: "unavailable", target };
  return { address, balance, state: Number(balance) > 0 ? "funded" : "unfunded", target };
}

// ---------------------------------------------------------------- automation detection

export type Automation = {
  /** raid id -> why it looks automated */
  raids: Map<string, string>;
  /** wallet (lowercase) -> reasons */
  wallets: Map<string, string[]>;
  /** token id -> reason */
  rooms: Map<number, string>;
};

/**
 * Looks for signs of automation in a season's finished raids. Everything flagged is EXCLUDED FROM
 * REWARDS PENDING REVIEW, not banned: a human decides.
 *  - impossible move speed (a raid averaging more moves per second than a person can press);
 *  - the same long move sequence on one room from many different wallets;
 *  - rooms whose failed raids come from a couple of wallets over and over (Warden farming).
 */
export function detectAutomation(raids: RaidRecord[], cfg = REWARDS.antiAbuse): Automation {
  const out: Automation = { raids: new Map(), wallets: new Map(), rooms: new Map() };
  const addWallet = (w: string, why: string) => out.wallets.set(lc(w), [...(out.wallets.get(lc(w)) ?? []), why]);

  const tooFast = new Map<string, number>();
  for (const r of raids) {
    if (!finished(r)) continue;
    const steps = stepsOf(r);
    const secs = (Date.parse(r.updatedAt) - Date.parse(r.createdAt)) / 1000;
    if (steps >= cfg.speedMinMoves && secs > 0 && steps / secs > cfg.maxMovesPerSecond) {
      out.raids.set(r.id, `${(steps / secs).toFixed(1)} moves per second is faster than a person can play`);
      tooFast.set(lc(r.raider), (tooFast.get(lc(r.raider)) ?? 0) + 1);
    } else if (steps >= cfg.speedMinMoves && secs <= 0) {
      out.raids.set(r.id, "all moves arrived at the same instant");
      tooFast.set(lc(r.raider), (tooFast.get(lc(r.raider)) ?? 0) + 1);
    }
  }
  for (const [w, n] of tooFast) if (n >= cfg.flaggedRaidsToFlagWallet) addWallet(w, `${n} raids played at impossible speed`);

  const sameSeq = new Map<string, Set<string>>();
  for (const r of raids) {
    if (!finished(r) || stepsOf(r) < cfg.identicalSequence.minMoves) continue;
    const k = `${r.tokenId}:${r.moves}`;
    (sameSeq.get(k) ?? sameSeq.set(k, new Set()).get(k)!).add(lc(r.raider));
  }
  for (const [k, who] of sameSeq) {
    if (who.size < cfg.identicalSequence.minWallets) continue;
    for (const w of who) addWallet(w, `the same ${stepsOf({ moves: k.split(":")[1] })}-move sequence as ${who.size - 1} other wallets on room ${k.split(":")[0]}`);
  }

  const failed = new Map<number, string[]>();
  for (const r of raids) if (finished(r) && r.status !== "breach" && !r.practice) (failed.get(r.tokenId) ?? failed.set(r.tokenId, []).get(r.tokenId)!).push(lc(r.raider));
  for (const [token, who] of failed) {
    const distinct = new Set(who).size;
    if (who.length >= cfg.roomFarming.minFailedRaids && distinct <= cfg.roomFarming.maxDistinctRaiders) {
      out.rooms.set(token, `${who.length} failed raids from only ${distinct} wallet${distinct === 1 ? "" : "s"}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- ranking

export type Flag = { kind: "wallet" | "room"; id: string; reason: string };
export type Ranking = {
  wardens: RankedPlayer[];
  raiders: RankedPlayer[];
  flags: Flag[];
  /** Wallets that were dropped for not holding the Chog at the snapshot (Warden points on it didn't count). */
  droppedPoints: { wallet: string; tokenId: number; points: number }[];
};

export type RankInput = {
  /** All finished raids (scoring is order-dependent, so pass the full history). */
  raids: RaidRecord[];
  season: number;
  supply: number;
  /** When given (the final snapshot), Warden points only count for Chogs the wallet still holds. */
  ownerOf?: (tokenId: number) => Promise<string | null>;
};

const isWallet = (id: string) => isAddress(id, { strict: false });

/** Rank both boards for the rewards: wallets only, eligibility applied, flagged wallets/raids/rooms excluded. */
export async function computeRanking(inp: RankInput, cfg = REWARDS): Promise<Ranking> {
  const win = seasonByIndex(inp.season);
  const inSeason = (r: RaidRecord) => Date.parse(r.createdAt) >= +win.start && Date.parse(r.createdAt) < +win.end;
  const seasonRaids = inp.raids.filter((r) => finished(r) && inSeason(r));
  const auto = detectAutomation(seasonRaids, cfg.antiAbuse);

  const clean = inp.raids.filter((r) => !auto.raids.has(r.id) && !auto.wallets.has(lc(r.raider)));
  const awards = scoreRaids(clean, inp.supply);
  const raidById = new Map(clean.map((r) => [r.id, r]));

  // ---- Raiders: wallets with enough distinct rooms cleared this season.
  const cleared = new Map<string, Set<number>>();
  for (const r of clean) if (r.status === "breach" && inSeason(r)) (cleared.get(lc(r.raider)) ?? cleared.set(lc(r.raider), new Set()).get(lc(r.raider))!).add(r.tokenId);
  const raiderCandidates = standings(awards, "raider", inp.season)
    .filter((s) => (!cfg.eligibility.walletsOnly || isWallet(s.who)) && (cleared.get(lc(s.who))?.size ?? 0) >= cfg.eligibility.raiderMinRoomsCleared)
    .map((s) => ({ id: s.who, points: s.points, count: s.count }));

  // ---- Wardens: wallets only; points on a Chog count only if the wallet still holds it.
  const dropped: Ranking["droppedPoints"] = [];
  const owners = new Map<number, string | null>();
  const wardenAwards = awards.filter((a: Award) => a.role === "warden" && a.season === inp.season && (!cfg.eligibility.walletsOnly || isWallet(a.who)));
  if (inp.ownerOf && cfg.eligibility.wardenMustHoldChog) {
    const tokens = [...new Set(wardenAwards.map((a) => raidById.get(a.raidId)?.tokenId).filter((t): t is number => t !== undefined))];
    let next = 0;
    // A failed read throws: a snapshot with a guess in it is worse than no snapshot.
    await Promise.all(
      Array.from({ length: Math.min(8, tokens.length) }, async () => {
        while (next < tokens.length) {
          const t = tokens[next++];
          owners.set(t, await inp.ownerOf!(t));
        }
      }),
    );
  }
  const perWarden = new Map<string, { who: string; points: number; count: number }>();
  for (const a of wardenAwards) {
    const token = raidById.get(a.raidId)?.tokenId;
    if (token === undefined || auto.rooms.has(token)) continue;
    if (inp.ownerOf && cfg.eligibility.wardenMustHoldChog) {
      const holder = owners.get(token);
      if (!holder || lc(holder) !== lc(a.who)) {
        dropped.push({ wallet: lc(a.who), tokenId: token, points: a.points });
        continue;
      }
    }
    const k = lc(a.who);
    const e = perWarden.get(k) ?? { who: a.who, points: 0, count: 0 };
    e.points += a.points;
    e.count++;
    perWarden.set(k, e);
  }
  const wardenCandidates = [...perWarden.values()]
    .sort((a, b) => b.points - a.points || b.count - a.count || a.who.localeCompare(b.who))
    .map((s) => ({ id: s.who, points: s.points, count: s.count }));

  const flags: Flag[] = [
    ...[...auto.wallets].map(([id, why]) => ({ kind: "wallet" as const, id, reason: why.join("; ") })),
    ...[...auto.rooms].map(([id, reason]) => ({ kind: "room" as const, id: String(id), reason })),
  ];
  return { wardens: rankPlayers(wardenCandidates, cfg.topN, cfg.bands), raiders: rankPlayers(raiderCandidates, cfg.topN, cfg.bands), flags, droppedPoints: dropped };
}

// ---------------------------------------------------------------- the season snapshot

export type SnapshotEntry = {
  wallet: string;
  rank: number;
  points: number;
  /** Percent of this board's half of the pool. */
  sharePctOfBoard: number;
  /** Percent of the whole pool. */
  sharePctOfPool: number;
  /** What this share was worth in $CHOG at the pool balance when the snapshot was taken (0 if unfunded). */
  amount: number;
};

export type SeasonSnapshot = {
  version: 1;
  season: number;
  seasonStart: string;
  seasonEnd: string;
  takenAt: string;
  pool: { address: string | null; balance: string | null; state: PoolState["state"] };
  split: Record<Board, number>;
  topN: number;
  wardens: SnapshotEntry[];
  raiders: SnapshotEntry[];
  eligible: { wardens: number; raiders: number };
  /** Excluded from rewards pending review (automation signs). */
  flagged: Flag[];
  /** Warden points not counted because the wallet no longer held the Chog at the snapshot. */
  droppedPoints: Ranking["droppedPoints"];
};

export const snapshotKey = (season: number) => `rewards:snapshot:${season}`;

/** Turn a ranking and the pool balance at this moment into the stored snapshot document. Pure. */
export function buildSnapshot(ranking: Ranking, season: number, pool: PoolState, now: Date, cfg = REWARDS): SeasonSnapshot {
  const win = seasonByIndex(season);
  const entries = (board: Board): SnapshotEntry[] =>
    ranking[board]
      .filter((r) => r.inZone)
      .map((r) => ({
        wallet: lc(r.id),
        rank: r.rank,
        points: r.points,
        sharePctOfBoard: roundDown(r.share * 100, 4),
        sharePctOfPool: roundDown(r.share * cfg.split[board] * 100, 4),
        amount: roundDown(projectedAmount(r.share, pool.balance, board, cfg.split), 4),
      }));
  return {
    version: 1,
    season,
    seasonStart: win.start.toISOString(),
    seasonEnd: win.end.toISOString(),
    takenAt: now.toISOString(),
    pool: { address: pool.address, balance: pool.balance, state: pool.state },
    split: cfg.split,
    topN: cfg.topN,
    wardens: entries("wardens"),
    raiders: entries("raiders"),
    eligible: { wardens: ranking.wardens.length, raiders: ranking.raiders.length },
    flagged: ranking.flags,
    droppedPoints: ranking.droppedPoints,
  };
}

export type SnapshotDeps = {
  store: Store;
  loadRaids: () => Promise<RaidRecord[]>;
  supply: number;
  ownerOf: (tokenId: number) => Promise<string | null>;
  pool: () => Promise<PoolState>;
  now?: Date;
};

/**
 * Store the final ranking for a finished season, once. The snapshot is immutable: of racing
 * callers exactly one writes it, and everyone gets that same document. Ownership of every
 * ranked Chog is re-checked on-chain now (a failed read aborts, so nothing guessed is stored).
 */
export async function ensureSnapshot(season: number, deps: SnapshotDeps): Promise<{ snapshot: SeasonSnapshot; created: boolean }> {
  const existing = await deps.store.getKv<SeasonSnapshot>(snapshotKey(season));
  if (existing) return { snapshot: existing, created: false };
  const now = deps.now ?? new Date();
  if (+now < +seasonByIndex(season).end) throw new Error(`Season ${season + 1} hasn't ended yet.`);
  const ranking = await computeRanking({ raids: await deps.loadRaids(), season, supply: deps.supply, ownerOf: deps.ownerOf });
  const snapshot = buildSnapshot(ranking, season, await deps.pool(), now);
  if (await deps.store.insertKv(snapshotKey(season), snapshot)) return { snapshot, created: true };
  return { snapshot: (await deps.store.getKv<SeasonSnapshot>(snapshotKey(season)))!, created: false };
}

// ---------------------------------------------------------------- CSV export for manual payouts

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per paid-zone wallet, plus the flagged ones marked "pending_review". No keys, no transfers. */
export function snapshotCsv(s: SeasonSnapshot): string {
  const head = ["season", "board", "rank", "wallet", "points", "share_pct_of_board", "share_pct_of_pool", "amount_chog_at_snapshot", "pool_balance_at_snapshot", "pool_state", "status", "note"];
  const rows: (string | number)[][] = [];
  for (const board of ["wardens", "raiders"] as const) {
    for (const e of s[board]) rows.push([s.season + 1, board, e.rank, e.wallet, e.points, e.sharePctOfBoard, e.sharePctOfPool, e.amount, s.pool.balance ?? "", s.pool.state, "verified", ""]);
  }
  for (const f of s.flagged) rows.push([s.season + 1, f.kind, "", f.id, "", "", "", "", s.pool.balance ?? "", s.pool.state, "pending_review", f.reason]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- admin

/** Wallets allowed to download the payout export (ADMIN_WALLETS, comma separated). Unset = nobody. */
export function isAdminWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  return (process.env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .includes(lc(wallet));
}

// ---------------------------------------------------------------- live view (what the UI shows)

const liveCache = new WeakMap<RaidRecord[], Map<number, Promise<Ranking>>>();

/** The current season's ranking, without the on-chain ownership check (that happens at the snapshot). Cached per snapshot. */
export function liveRanking(raids: RaidRecord[], supply: number, season = seasonAt(Date.now()).index): Promise<Ranking> {
  let bySeason = liveCache.get(raids);
  if (!bySeason) liveCache.set(raids, (bySeason = new Map()));
  let p = bySeason.get(season);
  if (!p) bySeason.set(season, (p = computeRanking({ raids, season, supply })));
  return p;
}

/** One player's standing on one board, for the leaderboard rows and the panel. */
export function standingOf(ranked: RankedPlayer[], id: string | null, board: Board, pool: PoolState, topN = REWARDS.topN) {
  const row = id ? ranked.find((r) => lc(r.id) === lc(id)) : undefined;
  if (!row) return null;
  return {
    rank: row.rank,
    inZone: row.inZone,
    sharePct: roundDown(row.share * 100, 2),
    amount: roundDown(projectedAmount(row.share, pool.balance, board), 2),
    toCutoff: row.inZone || ranked.length < topN ? null : Math.max(1, ranked[topN - 1].points - row.points),
  };
}
