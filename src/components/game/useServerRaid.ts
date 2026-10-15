"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fogRoom, litCells, seenMask, type Move, type PublicRoom, type RaidResult, type Trap } from "@/engine";
import type { RaidView as ServerView } from "@/server/raids";
import { markInput } from "./latency";
import { enqueue, initialSync, knownRoom, onNetworkError, onServerView, predict, takeBatch, type Batch, type SyncState } from "./raidSync";
import type { RaidView, Sight } from "./useLocalRaid";

export type ServerRaid = RaidView & {
  phase: "starting" | "ready" | "error";
  error: string | null;
  practice: boolean | null;
  raidId: string | null;
  /** Moves are waiting for the server to confirm them. */
  busy: boolean;
  retry(): void;
};

const RETRY_MS = [400, 1000, 2500];

type Reply = { ok: boolean; status: number; data: { error?: string; view?: ServerView } & Partial<ServerView> };

async function post(url: string, body: unknown): Promise<Reply> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * A server-authoritative raid with optimistic movement. Moves show instantly (predicted with the
 * shared engine from what the raider can see), go to the server in batches, and are reconciled
 * against every reply (see raidSync.ts). Same shape as useLocalRaid for the game screen.
 *
 * `room` is the public room: no tiles. What the raider has explored arrives with each server view.
 */
export function useServerRaid(room: PublicRoom): ServerRaid {
  const [sync, setSync] = useState<SyncState | null>(null);
  const [phase, setPhase] = useState<ServerRaid["phase"]>("starting");
  const [error, setError] = useState<string | null>(null);
  const syncRef = useRef<SyncState | null>(null);
  const generation = useRef(0);
  const started = useRef<number | null>(null);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The server no longer knows this raid (e.g. replaced from another tab): retry starts a new one. */
  const lost = useRef(false);

  const commit = (s: SyncState) => {
    syncRef.current = s;
    setSync(s);
  };

  const start = useCallback(async () => {
    const gen = ++generation.current;
    lost.current = false;
    failures.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    syncRef.current = null;
    setSync(null);
    setPhase("starting");
    setError(null);
    try {
      const r = await post("/api/raids", { tokenId: room.tokenId });
      if (gen !== generation.current) return;
      if (!r.ok) throw new Error(r.data.error ?? "Couldn't start the raid.");
      commit(initialSync(r.data as ServerView));
      setPhase("ready");
    } catch (e) {
      if (gen !== generation.current) return;
      setError((e as Error).message || "Couldn't reach the server.");
      setPhase("error");
    }
  }, [room.tokenId]);

  // Send whatever is pending, one request at a time, until nothing is left.
  const pump = useCallback(async () => {
    const gen = generation.current;
    const s = syncRef.current;
    if (!s) return;
    const next = takeBatch(s);
    if (!next) return;
    commit(next.state);
    const batch: Batch = next.batch;
    let reply: Reply;
    try {
      reply = await post(`/api/raids/${s.view.raidId}/moves`, { moves: batch.moves, seq: batch.seq });
    } catch {
      reply = { ok: false, status: 0, data: {} };
    }
    if (gen !== generation.current || !syncRef.current) return;

    const v = reply.ok ? (reply.data as ServerView) : reply.data.view;
    if (v) {
      failures.current = 0;
      commit(onServerView(syncRef.current, batch, v));
      if (v.status === "abandoned") {
        setError("You started this room again somewhere else.");
        setPhase("error");
        return;
      }
      void pump();
      return;
    }
    // No usable reply: keep the moves (on screen and queued) and resend after a short wait.
    commit(onNetworkError(syncRef.current, batch));
    if (reply.status === 404 || reply.status === 403) {
      lost.current = true;
      setError("This raid was closed. Start a fresh one.");
      setPhase("error");
      return;
    }
    const wait = RETRY_MS[failures.current++];
    if (wait === undefined) {
      setError(reply.data.error ?? "Connection lost. Your moves are saved; try again.");
      setPhase("error");
      return;
    }
    retryTimer.current = setTimeout(() => void pump(), wait);
  }, []);

  // Start exactly once per room. React dev mode runs effects twice; a second start would race the
  // first on the server and could close the raid this page is actually playing.
  useEffect(() => {
    if (started.current === room.tokenId) return;
    started.current = room.tokenId;
    void start();
  }, [start, room.tokenId]);

  useEffect(() => () => void (retryTimer.current && clearTimeout(retryTimer.current)), []);

  const move = useCallback(
    (m: Move) => {
      const s = syncRef.current;
      if (!s) return;
      const next = enqueue(room, s, m);
      if (next === s) return;
      markInput();
      commit(next);
      void pump();
    },
    [pump, room],
  );

  const retry = useCallback(() => {
    if (!syncRef.current || lost.current || syncRef.current.view.status === "abandoned") return void start();
    failures.current = 0;
    setError(null);
    setPhase("ready");
    void pump();
  }, [pump, start]);

  const result = useMemo<RaidResult>(
    () =>
      sync
        ? predict(room, sync)
        : { outcome: "incomplete", hp: room.rules.raiderHp, movesLeft: room.rules.maxMoves, stepsProcessed: 0, path: [room.entrance], keys: [], guards: [], events: [], endAt: room.entrance },
    [sync, room],
  );

  const visibleTraps: Trap[] = useMemo(() => sync?.view.visibleTraps ?? [], [sync]);
  const view = sync?.view;

  // Fog of war: the explored map comes from the server; the torch follows the predicted position
  // (lighting only what's already known, so nothing unseen is ever drawn).
  const known = useMemo(() => (view ? knownRoom(room, view) : fogRoom(room, { radius: room.tier.lightRadius, map: "", colors: "", lit: [] })), [room, view]);
  const seen = useMemo(() => (view ? seenMask(view.fog) : new Array(room.size * room.size).fill(false)), [view, room.size]);
  const sight = useMemo<Sight>(
    () => ({
      room: known,
      seen,
      lit: litCells(known, result.endAt).filter((i) => seen[i]),
      guardRoutes: view?.guardRoutes ?? [],
      nativeTraps: view?.nativeTraps ?? 0,
      guards: result.guards,
    }),
    [known, seen, result.endAt, result.guards, view],
  );

  return {
    result,
    moves: [] as Move[],
    movesUsed: result.stepsProcessed,
    visibleTraps,
    keysHeld: result.keys,
    // Only the server decides a raid is over; the board already shows the predicted ending.
    over: !!view && view.status !== "active" && view.status !== "abandoned",
    move,
    reset: () => void start(),
    phase,
    error,
    practice: view?.practice ?? null,
    raidId: view?.raidId ?? null,
    busy: !!sync && sync.pending.length > 0,
    retry,
    sight,
  };
}
