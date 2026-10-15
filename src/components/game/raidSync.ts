// Optimistic raid sync. Pure state transitions, no React or network, so they can be tested.
//
// The player's moves apply instantly on screen using the shared engine and what the raider can
// already see (walls, water, embers, guards, doors/keys, spikes/teleporters already stepped on).
// Moves queue up and go to the server in batches, at most one request in flight, each tagged
// with the index of its first move (seq). The server stays the authority: every reply replaces
// the confirmed state, and the remaining unconfirmed moves are re-predicted on top of it. The
// on-screen raider only "snaps" when the server knows something the client didn't (a hidden
// trap), which is the only case where prediction and server can differ.
//
// Fog of war: the client never has the whole room. It predicts on the room as the raider knows it
// (rebuilt from the server's fog view: unseen tiles are void), with the guard routes the server
// sent. The raider only ever steps next to tiles they've already seen, so that is enough.

import { fogRoom, simulateRaid, type Move, type PublicRoom, type RaidResult, type Room } from "@/engine";
import type { RaidView as ServerView } from "@/server/raids";

export type Batch = { seq: number; moves: Move[] };

export type SyncState = {
  /** Latest state the server confirmed. */
  view: ServerView;
  /** Moves made after `view.moves`, oldest first. The in-flight batch is always a prefix. */
  pending: Move[];
  /** The batch currently on its way to the server, if any. */
  inflight: Batch | null;
};

export const initialSync = (view: ServerView): SyncState => ({ view, pending: [], inflight: null });

const known = new WeakMap<ServerView, Room>();

/** The room as far as the raider knows it after this server view (cached per view). */
export function knownRoom(pub: PublicRoom, v: ServerView): Room {
  let r = known.get(v);
  if (!r) {
    r = fogRoom(pub, v.fog);
    known.set(v, r);
  }
  return r;
}

/** What the raider should see right now: confirmed moves plus pending ones, predicted locally. */
export function predict(pub: PublicRoom, s: SyncState): RaidResult {
  return simulateRaid(knownRoom(pub, s.view), s.view.visibleTraps, [...(s.view.moves.split("") as Move[]), ...s.pending], {
    routes: s.view.guardRoutes,
  });
}

/** Add a move, unless the raid is (or is predicted to be) over. */
export function enqueue(room: PublicRoom, s: SyncState, m: Move): SyncState {
  if (s.view.status !== "active") return s;
  if (predict(room, s).outcome !== "incomplete") return s;
  return { ...s, pending: [...s.pending, m] };
}

/** The next batch to send: everything pending, starting where the server left off. */
export function takeBatch(s: SyncState): { state: SyncState; batch: Batch } | null {
  if (s.inflight || s.pending.length === 0 || s.view.status !== "active") return null;
  const batch: Batch = { seq: s.view.moves.length, moves: [...s.pending] };
  return { state: { ...s, inflight: batch }, batch };
}

/**
 * Apply a server view (success, or the view attached to a 409) for a batch we sent.
 * Ignores replies from other raids and replies older than what we already confirmed.
 */
export function onServerView(s: SyncState, sent: Batch | null, v: ServerView): SyncState {
  if (v.raidId !== s.view.raidId || v.moves.length < s.view.moves.length) {
    return { ...s, inflight: sent && s.inflight === sent ? null : s.inflight };
  }
  // Our full move list as we know it: confirmed + pending.
  const ours = s.view.moves + s.pending.join("");
  let pending: Move[];
  if (v.status !== "active") {
    pending = []; // raid over: anything unconfirmed is void
  } else if (ours.startsWith(v.moves)) {
    pending = ours.slice(v.moves.length).split("").filter(Boolean) as Move[];
  } else {
    pending = []; // server history differs from ours: trust the server, drop our guesses
  }
  return { view: v, pending, inflight: sent && s.inflight === sent ? null : s.inflight };
}

/** A request failed without a reply (dropped / timed out): keep the moves and resend later. */
export function onNetworkError(s: SyncState, sent: Batch): SyncState {
  return s.inflight === sent ? { ...s, inflight: null } : s;
}

/** True when what the player saw locally disagrees with the server (a hidden trap fired). */
export function diverged(room: PublicRoom, before: SyncState, after: SyncState): boolean {
  const a = predict(room, before);
  const b = predict(room, after);
  const n = Math.min(a.path.length, b.path.length);
  for (let i = 0; i < n; i++) if (a.path[i].x !== b.path[i].x || a.path[i].y !== b.path[i].y) return true;
  return a.hp !== b.hp;
}
