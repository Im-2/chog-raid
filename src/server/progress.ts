import "server-only";
import { RETENTION } from "@/config/retention";
import { getNftAdapter } from "@/nft";
import { raiderLabel } from "./identity";
import {
  badgesFor,
  dailyBoard,
  dailyTokenId,
  dayKey,
  daysHeld,
  raidStreak,
  scoreRaids,
  seasonAt,
  standings,
  type Award,
  type Badge,
} from "./retention";
import { getStore } from "./store";
import type { DefenseRecord, RaidRecord } from "./store/types";

const lc = (s: string) => s.toLowerCase();

export type Snapshot = {
  raids: RaidRecord[];
  awards: Award[];
  defenses: DefenseRecord[];
  supply: number;
  badges: Map<string, Badge[]>;
  season: ReturnType<typeof seasonAt>;
};

// Recomputed at most every few seconds; everything below reads from one snapshot.
let cached: { at: number; snap: Promise<Snapshot> } | null = null;
export function snapshot(maxAgeMs = 4000): Promise<Snapshot> {
  if (!cached || Date.now() - cached.at > maxAgeMs) {
    const store = getStore();
    const snap = (async () => {
      const [raids, defenses, supply] = await Promise.all([
        store.listFinishedRaids(20000),
        store.listDefenses(),
        getNftAdapter().totalSupply(),
      ]);
      const awards = scoreRaids(raids, supply);
      const season = seasonAt(Date.now());
      return { raids, awards, defenses, supply, season, badges: badgesFor(awards, season.index) };
    })();
    cached = { at: Date.now(), snap };
    snap.catch(() => (cached = null));
  }
  return cached.snap;
}

export function badgesOf(snap: Snapshot, who: string | null | undefined): Badge[] {
  return who ? (snap.badges.get(lc(who)) ?? []) : [];
}

const rankOf = (list: { who: string }[], who: string) => {
  const i = list.findIndex((s) => lc(s.who) === lc(who));
  return i < 0 ? null : i + 1;
};

/** Points, ranks, streaks, badges and defended rooms for one player. */
export function playerSummary(snap: Snapshot, who: string, now = new Date()) {
  const raiders = standings(snap.awards, "raider", snap.season.index);
  const wardens = standings(snap.awards, "warden", snap.season.index);
  const mine = (role: Award["role"]) => snap.awards.filter((a) => a.role === role && lc(a.who) === lc(who));
  const seasonPts = (role: Award["role"]) => mine(role).filter((a) => a.season === snap.season.index).reduce((s, a) => s + a.points, 0);
  const rooms = snap.defenses
    .filter((d) => lc(d.owner) === lc(who))
    .map((d) => ({ tokenId: d.tokenId, traps: d.traps.length, daysHeld: daysHeld(snap.raids, d.tokenId, d.updatedAt, now) }))
    .sort((a, b) => b.daysHeld - a.daysHeld);
  return {
    id: who,
    label: raiderLabel(who),
    isWallet: !who.startsWith("guest:"),
    season: { index: snap.season.index, endsAt: snap.season.end.toISOString() },
    raider: { points: seasonPts("raider"), rank: rankOf(raiders, who), allTime: mine("raider").reduce((s, a) => s + a.points, 0) },
    warden: { points: seasonPts("warden"), rank: rankOf(wardens, who), allTime: mine("warden").reduce((s, a) => s + a.points, 0) },
    streak: raidStreak(snap.raids, who, now),
    bestDaysHeld: rooms[0]?.daysHeld ?? 0,
    rooms,
    badges: badgesOf(snap, who),
  };
}

export function seasonBoards(snap: Snapshot, me: string | null, size = 20) {
  const label = (list: ReturnType<typeof standings>) =>
    list.slice(0, size).map((s, i) => ({
      place: i + 1,
      id: s.who,
      label: raiderLabel(s.who),
      points: s.points,
      count: s.count,
      me: !!me && lc(me) === lc(s.who),
      badges: badgesOf(snap, s.who),
    }));
  return {
    season: snap.season.index,
    endsAt: snap.season.end.toISOString(),
    raiders: label(standings(snap.awards, "raider", snap.season.index)),
    wardens: label(standings(snap.awards, "warden", snap.season.index)),
  };
}

export function daily(snap: Snapshot, me: string | null, now = new Date()) {
  const day = dayKey(now);
  const tokenId = dailyTokenId(day, snap.supply);
  const next = new Date(Date.parse(day) + 86_400_000);
  return {
    day,
    tokenId,
    endsAt: next.toISOString(),
    bonus: RETENTION.raider.dailyClear,
    board: dailyBoard(snap.raids, day, tokenId).map((e, i) => ({
      place: i + 1,
      label: raiderLabel(e.raider),
      moves: e.moves,
      me: !!me && lc(me) === lc(e.raider),
    })),
  };
}

/** The award for one raid (shown on the result card). */
export function awardFor(snap: Snapshot, raidId: string): Award | null {
  return snap.awards.find((a) => a.raidId === raidId && a.role === "raider") ?? null;
}
