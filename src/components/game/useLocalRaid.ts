"use client";

import { useCallback, useMemo, useState } from "react";
import { simulateRaid, type Move, type RaidResult, type Room, type Trap } from "@/engine";

export type RaidView = {
  result: RaidResult;
  moves: Move[];
  movesUsed: number;
  /** Traps the raider can see: guards, doors (with keys), and spikes/teleporters they stepped on. */
  visibleTraps: Trap[];
  /** Indices into visibleTraps of doors whose key is held. */
  keysHeld: number[];
  over: boolean;
  move(m: Move): void;
  reset(): void;
};

/**
 * Runs a raid in the browser with the shared engine. Used for practice traps and
 * owner test runs, where the traps are not secret. Real raids on defended rooms
 * resolve each move on the server (milestone 4) and expose the same RaidView shape.
 */
export function useLocalRaid(room: Room, traps: Trap[]): RaidView {
  const [moves, setMoves] = useState<Move[]>([]);
  const result = useMemo(() => simulateRaid(room, traps, moves), [room, traps, moves]);
  const over = result.outcome !== "incomplete";

  const visibleTraps = useMemo(() => {
    const stepped = new Set(result.path.map((p) => p.y * room.size + p.x));
    return traps.filter((t) => t.type === "guard" || t.type === "lockdoor" || stepped.has(t.y * room.size + t.x));
  }, [traps, result.path, room.size]);
  const keysHeld = useMemo(
    () => result.keys.map((k) => visibleTraps.indexOf(traps[k])).filter((i) => i >= 0),
    [result.keys, visibleTraps, traps],
  );

  const move = useCallback((m: Move) => setMoves((ms) => (simulateRaid(room, traps, ms).outcome === "incomplete" ? [...ms, m] : ms)), [room, traps]);
  const reset = useCallback(() => setMoves([]), []);

  return { result, moves, movesUsed: moves.length, visibleTraps, keysHeld, over, move, reset };
}
