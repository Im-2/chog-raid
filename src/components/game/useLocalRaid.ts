"use client";

import { useCallback, useMemo, useState } from "react";
import { EXTRA_MOVES } from "@/config/tiers";
import { guardRoute, litCells, raiderSight, simulateRaid, type Move, type Point, type RaidInput, type RaidResult, type Room, type Trap } from "@/engine";

/** Fog of war for drawing: the room as the raider knows it, what they've seen, what's lit now. */
export type Sight = {
  room: Room;
  seen: boolean[];
  lit: number[];
  /** Guard patrol routes, in visibleTraps order (for warnings). */
  guardRoutes: Point[][];
  /** How many leading visibleTraps are native defenses. */
  nativeTraps: number;
  /** Current positions of the guards in visibleTraps. */
  guards: Point[];
};

export type RaidView = {
  result: RaidResult;
  moves: RaidInput[];
  movesUsed: number;
  /** Traps the raider knows about (fog of war applied): see fogTraps in engine/fog.ts. */
  visibleTraps: Trap[];
  /** Indices into visibleTraps of doors whose key is held. */
  keysHeld: number[];
  over: boolean;
  sight: Sight | null;
  move(m: Move): void;
  reset(): void;
  /** Out of moves with "Keep going" still available. */
  canKeepGoing: boolean;
  keepGoing(): void;
};

/**
 * Runs a raid in the browser with the shared engine. Used for owner test runs, where the traps
 * are not secret, with the same fog of war a real raider gets. Real raids resolve each move on the
 * server (useServerRaid) and expose the same RaidView shape.
 */
export function useLocalRaid(room: Room, traps: Trap[]): RaidView {
  const [moves, setMoves] = useState<RaidInput[]>([]);
  const result = useMemo(() => simulateRaid(room, traps, moves), [room, traps, moves]);
  const over = result.outcome !== "incomplete";

  const sightAll = useMemo(() => raiderSight(room, traps, result.path), [room, traps, result.path]);
  const visibleTraps = useMemo(() => sightAll.visible.map((v) => v.trap), [sightAll]);
  const keysHeld = useMemo(
    () => result.keys.flatMap((k) => {
      const i = sightAll.visible.findIndex((v) => v.index === k);
      return i >= 0 ? [i] : [];
    }),
    [result.keys, sightAll],
  );
  const nativeCount = room.native?.traps.length ?? 0;
  const sight = useMemo<Sight>(() => {
    const guardIdx = traps.flatMap((t, i) => (t.type === "guard" ? [i] : []));
    const seenGuard = new Set(sightAll.visible.map((v) => v.index));
    return {
      room,
      seen: sightAll.seen,
      lit: litCells(room, result.endAt),
      guardRoutes: visibleTraps.flatMap((t) => (t.type === "guard" ? [guardRoute(room, t)] : [])),
      nativeTraps: sightAll.visible.filter((v) => v.index < nativeCount).length,
      guards: result.guards.filter((_, k) => seenGuard.has(guardIdx[k])),
    };
  }, [room, traps, sightAll, visibleTraps, result.endAt, result.guards, nativeCount]);

  const move = useCallback((m: Move) => setMoves((ms) => (simulateRaid(room, traps, ms).outcome === "incomplete" ? [...ms, m] : ms)), [room, traps]);
  const reset = useCallback(() => setMoves([]), []);
  const canKeepGoing = result.outcome === "out_of_moves" && result.extended < EXTRA_MOVES.extendLimit;
  const keepGoing = useCallback(() => setMoves((ms) => [...ms, "E"]), []);
  return { result, moves, movesUsed: moves.length, visibleTraps, keysHeld, over, sight, move, reset, canKeepGoing, keepGoing };
}
