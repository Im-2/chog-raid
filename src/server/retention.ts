// Points, streaks, seasons, badges and the daily raid. Everything is derived from the stored raid
// history (no separate points table), so it is deterministic and can be recomputed at any time.
// All tunable numbers live in src/config/retention.ts.

import { RETENTION } from "@/config/retention";
import { tierAtLevel } from "@/config/tiers";
import { hashString, NATIVE_ENGINE } from "@/engine";
import type { RaidRecord } from "./store/types";

const DAY = 86_400_000;
const R = RETENTION;

export type Season = { index: number; start: Date; end: Date };

export function seasonAt(t: Date | number): Season {
  const epoch = Date.parse(R.season.epoch);
  const len = R.season.lengthDays * DAY;
  const index = Math.floor((+t - epoch) / len);
  const start = new Date(epoch + index * len);
  return { index, start, end: new Date(+start + len) };
}

export const seasonByIndex = (i: number): Season => seasonAt(Date.parse(R.season.epoch) + i * R.season.lengthDays * DAY);

/** UTC calendar day, e.g. "2026-10-10". */
export const dayKey = (t: Date | number | string) => new Date(t).toISOString().slice(0, 10);

/** Today's featured room: the same for everyone, from the date and a fixed seed. */
export function dailyTokenId(day: string, supply: number): number {
  return 1 + (hashString(`${R.daily.seed}:${day}`) % Math.max(1, supply));
}

export type AwardPart = { label: string; points: number };
export type Award = { raidId: string; who: string; role: "raider" | "warden"; season: number; points: number; parts: AwardPart[] };

const finished = (r: RaidRecord) => r.status === "breach" || r.status === "defeated" || r.status === "out_of_moves";
const lc = (s: string) => s.toLowerCase();

/**
 * Score every finished raid, oldest first. Raider awards come from clears; Warden awards from
 * raids that failed against a saved defense (never a holder raiding their own room).
 */
export function scoreRaids(raids: RaidRecord[], supply: number): Award[] {
  const list = raids.filter(finished).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const awards: Award[] = [];
  const clearedThisSeason = new Set<string>(); // season:raider:room
  const everCleared = new Set<number>(); // defended rooms someone has cleared
  const dailyClaimed = new Set<string>(); // day:raider
  const holdsSinceBreach = new Map<number, number>(); // room -> consecutive holds

  for (const r of list) {
    const season = seasonAt(Date.parse(r.createdAt)).index;
    const breach = r.status === "breach";
    const moves = r.moves.length;

    if (breach) {
      const parts: AwardPart[] = [];
      const key = `${season}:${lc(r.raider)}:${r.tokenId}`;
      if (!clearedThisSeason.has(key)) {
        clearedThisSeason.add(key);
        parts.push({ label: "Clear", points: R.raider.clear }, { label: "First clear of this room this season", points: R.raider.firstClearOfRoom });
      } else {
        parts.push({ label: "Repeat clear", points: R.raider.repeatClear });
      }
      if (!r.practice && !everCleared.has(r.tokenId)) parts.push({ label: "First ever to clear this room", points: R.raider.firstClearEver });
      if (r.par) {
        const worst = r.par * R.raider.fastClearSlack;
        const k = Math.max(0, Math.min(1, (worst - moves) / (worst - r.par)));
        const bonus = Math.round(R.raider.fastClearMax * k);
        if (bonus > 0) parts.push({ label: moves <= r.par ? "Perfect route" : "Fast clear", points: bonus });
      }
      const day = dayKey(r.createdAt);
      if (r.tokenId === dailyTokenId(day, supply) && !dailyClaimed.has(`${day}:${lc(r.raider)}`)) {
        dailyClaimed.add(`${day}:${lc(r.raider)}`);
        parts.push({ label: "Daily raid", points: R.raider.dailyClear });
      }
      // Harder tiers pay more (raids from before native defenses keep their old points).
      const tier = r.engine === NATIVE_ENGINE ? tierAtLevel(r.difficulty) : null;
      const tierMult = tier?.pointsMultiplier ?? 1;
      const mult = (r.practice ? R.raider.practiceMultiplier : 1) * tierMult;
      const scaled = parts.map((p) => ({ ...p, points: Math.round(p.points * mult) }));
      if (tier && tierMult !== 1) scaled.push({ label: `${tier.name} room (x${tierMult})`, points: 0 });
      if (r.practice) scaled.push({ label: `Practice room (x${R.raider.practiceMultiplier})`, points: 0 });
      awards.push({ raidId: r.id, who: r.raider, role: "raider", season, points: scaled.reduce((s, p) => s + p.points, 0), parts: scaled });
      if (!r.practice) everCleared.add(r.tokenId);
    }

    if (!r.practice && r.defender && lc(r.defender) !== lc(r.raider)) {
      if (breach) {
        holdsSinceBreach.set(r.tokenId, 0);
      } else {
        const streak = holdsSinceBreach.get(r.tokenId) ?? 0;
        const diff = r.difficulty ?? 1;
        const parts: AwardPart[] = [{ label: "Raider failed", points: R.warden.hold }];
        if (r.engine === NATIVE_ENGINE) {
          // Holding a harder room is worth more: the hold scales with the tier's multiplier.
          const tier = tierAtLevel(diff);
          const bonus = Math.round(R.warden.hold * (tier.pointsMultiplier - 1));
          if (bonus > 0) parts.push({ label: `${tier.name} room (x${tier.pointsMultiplier})`, points: bonus });
        } else {
          const diffBonus = Math.round(R.warden.hold * R.warden.difficultyStep * (diff - 1));
          if (diffBonus > 0) parts.push({ label: `Difficulty ${diff}`, points: diffBonus });
        }
        const streakBonus = Math.min(R.warden.streakCap, R.warden.perConsecutiveHold * streak);
        if (streakBonus > 0) parts.push({ label: `${streak} holds in a row`, points: streakBonus });
        holdsSinceBreach.set(r.tokenId, streak + 1);
        awards.push({ raidId: r.id, who: r.defender, role: "warden", season, points: parts.reduce((s, p) => s + p.points, 0), parts });
      }
    }
  }
  return awards;
}

export type Standing = { who: string; points: number; count: number };

/** Season totals per player for one role, best first. */
export function standings(awards: Award[], role: Award["role"], season: number): Standing[] {
  const m = new Map<string, Standing>();
  for (const a of awards) {
    if (a.role !== role || a.season !== season) continue;
    const k = lc(a.who);
    const s = m.get(k) ?? { who: a.who, points: 0, count: 0 };
    s.points += a.points;
    s.count++;
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => b.points - a.points || b.count - a.count || a.who.localeCompare(b.who));
}

export type Badge = { season: number; board: "raider" | "warden"; place: number };

/** Top places of every completed season (before `current`). */
export function badgesFor(awards: Award[], current: number): Map<string, Badge[]> {
  const out = new Map<string, Badge[]>();
  const seasons = new Set(awards.map((a) => a.season).filter((s) => s < current));
  for (const season of seasons) {
    for (const board of ["raider", "warden"] as const) {
      standings(awards, board, season)
        .slice(0, R.season.badgePlaces)
        .forEach((s, i) => {
          const k = lc(s.who);
          out.set(k, [...(out.get(k) ?? []), { season, board, place: i + 1 }]);
        });
    }
  }
  return out;
}

export type Streak = { current: number; best: number; activeToday: boolean };

/** Consecutive UTC days with a finished raid. Still alive until the end of the day after the last raid day. */
export function raidStreak(raids: RaidRecord[], who: string, now: Date): Streak {
  const days = [...new Set(raids.filter((r) => finished(r) && lc(r.raider) === lc(who)).map((r) => dayKey(r.createdAt)))].sort();
  if (!days.length) return { current: 0, best: 0, activeToday: false };
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = Date.parse(days[i]) - Date.parse(days[i - 1]) === DAY ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const today = dayKey(now);
  const last = days[days.length - 1];
  const alive = last === today || Date.parse(today) - Date.parse(last) === DAY;
  return { current: alive ? run : 0, best, activeToday: last === today };
}

/** Whole days a defended room has gone without a breach (since its last breach or its last save). */
export function daysHeld(raids: RaidRecord[], tokenId: number, savedAt: string, now: Date): number {
  const lastBreach = raids
    .filter((r) => r.tokenId === tokenId && r.status === "breach" && !r.practice && r.createdAt >= savedAt)
    .reduce<string | null>((m, r) => (m && m > r.createdAt ? m : r.createdAt), null);
  const since = Date.parse(lastBreach ?? savedAt);
  return Math.max(0, Math.floor((+now - since) / DAY));
}

export type DailyEntry = { raider: string; moves: number; at: string; raidId: string };

/** Today's daily raid board: each raider's best clear of the featured room today. */
export function dailyBoard(raids: RaidRecord[], day: string, tokenId: number): DailyEntry[] {
  const best = new Map<string, DailyEntry>();
  for (const r of raids) {
    if (r.status !== "breach" || r.tokenId !== tokenId || dayKey(r.createdAt) !== day) continue;
    const k = lc(r.raider);
    const cur = best.get(k);
    const e = { raider: r.raider, moves: r.moves.length, at: r.createdAt, raidId: r.id };
    if (!cur || e.moves < cur.moves || (e.moves === cur.moves && e.at < cur.at)) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => a.moves - b.moves || a.at.localeCompare(b.at)).slice(0, R.daily.leaderboardSize);
}
