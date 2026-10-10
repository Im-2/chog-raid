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

export type RoomBest = { attempts: number; cleared: boolean; bestMoves: number | null; lastOutcome: string | null };

/** This player's results per room: attempts, whether cleared, fewest moves on a clear. */
export function myRooms(snap: Snapshot, me: string): Map<number, RoomBest> {
  const out = new Map<number, RoomBest>();
  const mine = snap.raids.filter((r) => lc(r.raider) === lc(me)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of mine) {
    const b = out.get(r.tokenId) ?? { attempts: 0, cleared: false, bestMoves: null, lastOutcome: null };
    b.attempts++;
    b.lastOutcome = r.status;
    if (r.status === "breach") {
      b.cleared = true;
      b.bestMoves = b.bestMoves === null ? r.moves.length : Math.min(b.bestMoves, r.moves.length);
    }
    out.set(r.tokenId, b);
  }
  return out;
}

export type NextRoom = { tokenId: number; reason: string };

/**
 * A room to play next: today's daily raid if you haven't cleared it, else a room you haven't
 * cleared at a similar difficulty, else any room you haven't cleared.
 */
export function suggestNextRoom(
  snap: Snapshot,
  me: string | null,
  from: number,
  difficulty: (tokenId: number) => number | null,
  candidates: { tokenId: number; difficulty: number }[],
  now = new Date(),
): NextRoom {
  const rooms = me ? myRooms(snap, me) : new Map<number, RoomBest>();
  const cleared = (id: number) => rooms.get(id)?.cleared ?? false;
  const today = dailyTokenId(dayKey(now), snap.supply);
  const doneDaily = me ? dailyBoard(snap.raids, dayKey(now), today).some((e) => lc(e.raider) === lc(me)) : false;
  if (today !== from && !doneDaily) return { tokenId: today, reason: "Today's daily raid" };

  // Seeded pick, so the suggestion is stable for this player and room but differs between rooms.
  let seed = 0;
  for (const ch of `${me ?? "anon"}:${from}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pickFrom = <T,>(list: T[]) => list[seed % list.length];

  const d = difficulty(from);
  if (d !== null) {
    const similar = candidates.filter((c) => c.tokenId !== from && !cleared(c.tokenId) && Math.abs(c.difficulty - d) <= 1);
    if (similar.length) return { tokenId: pickFrom(similar).tokenId, reason: "Similar difficulty, not cleared yet" };
  }
  for (let i = 0; i < snap.supply; i++) {
    const id = 1 + ((seed + i * 7919) % snap.supply);
    if (id !== from && !cleared(id)) return { tokenId: id, reason: "Not cleared yet" };
  }
  return { tokenId: 1 + (seed % snap.supply), reason: "Random room" };
}
