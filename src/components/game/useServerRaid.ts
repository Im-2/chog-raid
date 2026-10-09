"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Move, RaidResult, Trap } from "@/engine";
import type { RaidView as ServerView } from "@/server/raids";
import type { RaidView } from "./useLocalRaid";

export type ServerRaid = RaidView & {
  phase: "starting" | "ready" | "error";
  error: string | null;
  practice: boolean | null;
  raidId: string | null;
  /** A move is on its way to the server. */
  busy: boolean;
  retry(): void;
};

const MAX_BUFFERED = 6;

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: { error?: string; view?: ServerView } & Partial<ServerView> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

function toResult(v: ServerView): RaidResult {
  return {
    outcome: v.outcome,
    hp: v.hp,
    movesLeft: v.movesLeft,
    stepsProcessed: v.moveCount,
    path: v.path,
    keys: v.keysHeld,
    guards: v.guards,
    events: v.events,
    endAt: v.path[v.path.length - 1],
  };
}

/**
 * A raid resolved by the server, one move at a time. Same shape as useLocalRaid so the
 * game screen doesn't care which one it runs. Key presses made while a move is in flight
 * are buffered (up to MAX_BUFFERED) and sent in order with their sequence number, so a
 * resend after a network error is harmless.
 */
export function useServerRaid(tokenId: number, entrance: { x: number; y: number }, maxHp: number, maxMoves: number): ServerRaid {
  const [view, setView] = useState<ServerView | null>(null);
  const [phase, setPhase] = useState<ServerRaid["phase"]>("starting");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Move[]>([]);
  const viewRef = useRef<ServerView | null>(null);
  const sending = useRef(false);
  const generation = useRef(0);

  const apply = (v: ServerView) => {
    viewRef.current = v;
    setView(v);
  };

  const start = useCallback(async () => {
    const gen = ++generation.current;
    queue.current = [];
    sending.current = false;
    setBusy(false);
    setPhase("starting");
    setError(null);
    try {
      const r = await post("/api/raids", { tokenId });
      if (gen !== generation.current) return;
      if (!r.ok) throw new Error(r.data.error ?? "Couldn't start the raid.");
      apply(r.data as ServerView);
      setPhase("ready");
    } catch (e) {
      if (gen !== generation.current) return;
      setError((e as Error).message || "Couldn't reach the server.");
      setPhase("error");
    }
  }, [tokenId]);

  const pump = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const gen = generation.current;
    try {
      while (queue.current.length && viewRef.current && viewRef.current.status === "active") {
        const v = viewRef.current;
        const r = await post(`/api/raids/${v.raidId}/moves`, { move: queue.current[0], seq: v.moveCount });
        if (gen !== generation.current) return;
        if (r.ok) {
          queue.current.shift();
          apply(r.data as ServerView);
        } else if (r.data.view) {
          // Out of sync or already over: trust the server's view and drop buffered input.
          queue.current = [];
          apply(r.data.view);
          if (r.data.view.status === "abandoned") throw new Error("You started this room again somewhere else.");
        } else {
          throw new Error(r.data.error ?? "The move didn't go through.");
        }
      }
    } catch (e) {
      if (gen !== generation.current) return;
      setError((e as Error).message || "Connection lost.");
      setPhase("error");
    } finally {
      if (gen === generation.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const move = useCallback(
    (m: Move) => {
      const v = viewRef.current;
      if (!v || v.status !== "active" || queue.current.length >= MAX_BUFFERED) return;
      queue.current.push(m);
      void pump();
    },
    [pump],
  );

  const retry = useCallback(() => {
    if (!viewRef.current || viewRef.current.status === "abandoned") return void start();
    setError(null);
    setPhase("ready");
    void pump();
  }, [pump, start]);

  const result = useMemo<RaidResult>(
    () =>
      view
        ? toResult(view)
        : { outcome: "incomplete", hp: maxHp, movesLeft: maxMoves, stepsProcessed: 0, path: [entrance], keys: [], guards: [], events: [], endAt: entrance },
    [view, entrance, maxHp, maxMoves],
  );

  const visibleTraps: Trap[] = useMemo(() => view?.visibleTraps ?? [], [view]);

  return {
    result,
    moves: [] as Move[],
    movesUsed: view?.moveCount ?? 0,
    visibleTraps,
    keysHeld: view?.keysHeld ?? [],
    over: !!view && view.status !== "active" && view.status !== "abandoned",
    move,
    reset: () => void start(),
    phase,
    error,
    practice: view?.practice ?? null,
    raidId: view?.raidId ?? null,
    busy,
    retry,
  };
}
