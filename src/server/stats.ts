// Stats and leaderboards, aggregated from finished raids.
//
// Counting rules:
// - Every finished raid counts for the room's raid totals and for the raider.
// - Defender stats only count raids against a saved defense (not practice), and never a
//   holder raiding their own room.
// - "Fastest clear" = fewest moves in a breach; ties go to whoever did it first.

import type { RaidRecord, Store } from "./store/types";

export type RoomStats = {
  tokenId: number;
  raids: number;
  breaches: number;
  /** Share of raids that failed, 0-1. Uses defended raids when there are any. */
  defenseRate: number;
  defendedRaids: number;
  defendedBreaches: number;
  fastestClear: { moves: number; raider: string; at: string } | null;
  lastRaidAt: string | null;
};

export type RaiderStats = { raider: string; raids: number; clears: number; roomsCleared: number; fastestClear: number | null };
export type DefenderStats = { defender: string; raidsFaced: number; held: number; breaches: number; rooms: number; defenseRate: number };

export type Stats = {
  rooms: Map<number, RoomStats>;
  raiders: RaiderStats[];
  defenders: DefenderStats[];
  totalRaids: number;
};

const finished = (r: RaidRecord) => r.status === "breach" || r.status === "defeated" || r.status === "out_of_moves";

export function computeStats(raids: RaidRecord[]): Stats {
  // Oldest first, so "first to set the record" wins ties.
  const list = raids.filter(finished).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rooms = new Map<number, RoomStats>();
  const raiders = new Map<string, { raids: number; clears: number; rooms: Set<number>; fastest: number | null }>();
  const defenders = new Map<string, { id: string; faced: number; held: number; rooms: Set<number> }>();

  for (const r of list) {
    const breach = r.status === "breach";
    const moves = r.moves.length;

    const room = rooms.get(r.tokenId) ?? {
      tokenId: r.tokenId,
      raids: 0,
      breaches: 0,
      defenseRate: 0,
      defendedRaids: 0,
      defendedBreaches: 0,
      fastestClear: null,
      lastRaidAt: null,
    };
    room.raids++;
    if (breach) room.breaches++;
    if (!r.practice) {
      room.defendedRaids++;
      if (breach) room.defendedBreaches++;
    }
    if (breach && (!room.fastestClear || moves < room.fastestClear.moves)) {
      room.fastestClear = { moves, raider: r.raider, at: r.createdAt };
    }
    room.lastRaidAt = r.createdAt;
    rooms.set(r.tokenId, room);

    const rd = raiders.get(r.raider) ?? { raids: 0, clears: 0, rooms: new Set<number>(), fastest: null };
    rd.raids++;
    if (breach) {
      rd.clears++;
      rd.rooms.add(r.tokenId);
      rd.fastest = rd.fastest === null ? moves : Math.min(rd.fastest, moves);
    }
    raiders.set(r.raider, rd);

    if (!r.practice && r.defender && r.defender.toLowerCase() !== r.raider.toLowerCase()) {
      const key = r.defender.toLowerCase();
      const d = defenders.get(key) ?? { id: r.defender, faced: 0, held: 0, rooms: new Set<number>() };
      d.faced++;
      if (!breach) d.held++;
      d.rooms.add(r.tokenId);
      defenders.set(key, d);
    }
  }

  for (const room of rooms.values()) {
    const [n, b] = room.defendedRaids > 0 ? [room.defendedRaids, room.defendedBreaches] : [room.raids, room.breaches];
    room.defenseRate = n ? (n - b) / n : 0;
  }

  return {
    rooms,
    totalRaids: list.length,
    raiders: [...raiders].map(([raider, v]) => ({
      raider,
      raids: v.raids,
      clears: v.clears,
      roomsCleared: v.rooms.size,
      fastestClear: v.fastest,
    })),
    defenders: [...defenders.values()].map((v) => ({
      defender: v.id,
      raidsFaced: v.faced,
      held: v.held,
      breaches: v.faced - v.held,
      rooms: v.rooms.size,
      defenseRate: v.faced ? v.held / v.faced : 0,
    })),
  };
}

export const rankRaiders = (s: Stats, n = 20) =>
  [...s.raiders]
    .filter((r) => r.clears > 0)
    .sort((a, b) => b.roomsCleared - a.roomsCleared || b.clears - a.clears || (a.fastestClear ?? 999) - (b.fastestClear ?? 999))
    .slice(0, n);

export const rankDefenders = (s: Stats, n = 20) =>
  [...s.defenders].sort((a, b) => b.held - a.held || b.defenseRate - a.defenseRate || b.raidsFaced - a.raidsFaced).slice(0, n);

export const rankFastest = (s: Stats, n = 20) =>
  [...s.rooms.values()]
    .filter((r) => r.fastestClear)
    .sort((a, b) => a.fastestClear!.moves - b.fastestClear!.moves || a.fastestClear!.at.localeCompare(b.fastestClear!.at))
    .slice(0, n);

/** Rooms by most raids, then most recent. */
export const mostRaided = (s: Stats) =>
  [...s.rooms.values()].sort((a, b) => b.raids - a.raids || (b.lastRaidAt ?? "").localeCompare(a.lastRaidAt ?? ""));

/** Rooms raiders get through most often (lowest defense rate first). */
export const leastDefended = (s: Stats) =>
  [...s.rooms.values()].sort((a, b) => a.defenseRate - b.defenseRate || b.raids - a.raids);

// Short cache: stats are recomputed at most every few seconds.
let cached: { at: number; stats: Promise<Stats> } | null = null;
export function getStats(store: Store, maxAgeMs = 5000): Promise<Stats> {
  if (!cached || Date.now() - cached.at > maxAgeMs) {
    cached = { at: Date.now(), stats: store.listFinishedRaids(20000).then(computeStats) };
    cached.stats.catch(() => (cached = null));
  }
  return cached.stats;
}
