// Server-authoritative raids. The client never sees hidden traps and never decides outcomes:
// it sends one move at a time, the server appends it to the stored move list, replays the
// whole list with the shared engine, and returns only what the raider can see.

import { randomUUID } from "node:crypto";
import {
  exploredCells,
  findSafePath,
  fogTraps,
  fogView,
  guardRoute,
  isRaidInput,
  hasNative,
  withNative,
  fitTraps,
  roomForRaid,
  NATIVE_ENGINE,
  practiceTraps,
  simulateRaid,
  type FogView,
  type Move,
  type RaidInput,
  type Point,
  type RaidEvent,
  type RaidOutcome,
  type Room,
  type Trap,
} from "@/engine";
import { EXTRA_MOVES } from "@/config/tiers";
import type { RaidRecord, RaidStatus, Store } from "./store/types";

export type RaidDeps = {
  store: Store;
  getRoom: (tokenId: number) => Promise<Room | null>;
  /** Current holder onchain (or mock). */
  ownerOf: (tokenId: number) => Promise<string | null>;
};

/** What the raider is allowed to know. */
export type RaidView = {
  raidId: string;
  tokenId: number;
  practice: boolean;
  status: RaidStatus;
  moveCount: number;
  outcome: RaidOutcome;
  path: Point[];
  hp: number;
  movesLeft: number;
  events: RaidEvent[];
  /** Current positions of the guards in visibleTraps (same order). */
  guards: Point[];
  /**
   * What the raider has found, fog of war applied: guards whose patrol they've seen, doors and
   * keys they've seen (an unseen half of a door/key pair is sent as -1,-1), and spikes and
   * teleporters they've stepped on. Nothing in unexplored darkness is ever sent.
   */
  visibleTraps: Trap[];
  /** Patrol route of each guard in visibleTraps, so the client never needs the tiles under it. */
  guardRoutes: Point[][];
  /** How many leading visibleTraps are the room's native defenses. */
  nativeTraps: number;
  /** Indices into visibleTraps of doors whose key is held. */
  keysHeld: number[];
  /** Explored map, colors of seen tiles, and what the torch lights right now. */
  fog: FogView;
  /** The raider's own move list so far (e.g. "RRUD"); lets the client predict ahead of the server. */
  moves: string;
};

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; view?: RaidView };

const fail = (status: number, error: string, view?: RaidView): Result<never> => ({ ok: false, status, error, view });

/** Traps a raider can see after walking `path`. Spikes and teleporters stay hidden until stepped on. */
export function visibleTraps(room: Room, traps: Trap[], path: Point[]): Trap[] {
  const stepped = new Set(path.map((p) => p.y * room.size + p.x));
  return traps.filter((t) => t.type === "guard" || t.type === "lockdoor" || stepped.has(t.y * room.size + t.x));
}

export function viewOf(current: Room, r: RaidRecord): RaidView {
  const room = roomForRaid(current, r.engine);
  const result = simulateRaid(room, r.traps, r.moves.split("") as RaidInput[]);
  const seen = exploredCells(room, result.path);
  const fog = fogView(room, result.path, seen);
  const visible = fogTraps(room, r.traps, result.path, seen);
  const nativeCount = hasNative(r.engine) ? room.native.traps.length : 0;
  const guardIndex = r.traps.flatMap((t, i) => (t.type === "guard" ? [i] : []));
  return {
    raidId: r.id,
    tokenId: r.tokenId,
    practice: r.practice,
    status: r.status,
    moveCount: r.moves.length,
    outcome: result.outcome,
    path: result.path,
    hp: result.hp,
    movesLeft: result.movesLeft,
    events: result.events,
    guards: result.guards.filter((_, k) => visible.some((v) => v.index === guardIndex[k])),
    visibleTraps: visible.map((v) => v.trap),
    guardRoutes: visible.flatMap((v) => (v.trap.type === "guard" ? [guardRoute(room, v.trap)] : [])),
    nativeTraps: visible.filter((v) => v.index < nativeCount).length,
    keysHeld: result.keys.flatMap((k) => {
      const i = visible.findIndex((v) => v.index === k);
      return i >= 0 ? [i] : [];
    }),
    moves: r.moves,
    fog,
  };
}

/** Traps used for a room right now: the owner's saved defense, or seeded practice traps. */
export async function trapsFor(
  deps: RaidDeps,
  room: Room,
  saved?: Awaited<ReturnType<Store["getDefense"]>>,
): Promise<{ traps: Trap[]; practice: boolean; defender: string | null }> {
  const defense = saved === undefined ? await deps.store.getDefense(room.tokenId) : saved;
  // The room's native defenses always come first; the owner's traps (or practice traps) go on top.
  return defense
    ? { traps: withNative(room, fitTraps(room, defense.traps)), practice: false, defender: defense.owner }
    : { traps: withNative(room, practiceTraps(room)), practice: true, defender: null };
}

export async function startRaid(deps: RaidDeps, tokenId: number, raider: string): Promise<Result<RaidView>> {
  // Independent lookups run together: the room, its saved defense, and closing any raid this
  // raider left open on it. Only the insert has to wait for them.
  const [room, defense] = await Promise.all([
    deps.getRoom(tokenId),
    deps.store.getDefense(tokenId),
    deps.store.abandonActive(raider, tokenId),
  ]);
  if (!room) return fail(404, "No such Chog.");
  const { traps, practice, defender } = await trapsFor(deps, room, defense);
  const now = new Date().toISOString();
  const record: RaidRecord = {
    id: randomUUID(),
    tokenId,
    raider,
    practice,
    defender,
    par: findSafePath(room, traps)?.length ?? null,
    difficulty: room.tier.level,
    engine: NATIVE_ENGINE,
    traps,
    moves: "",
    status: "active",
    hp: room.rules.raiderHp,
    movesLeft: room.rules.maxMoves,
    endX: room.entrance.x,
    endY: room.entrance.y,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.createRaid(record);
  return { ok: true, value: viewOf(room, record) };
}

/**
 * Apply one move at index `seq` (0-based). See applyMoves.
 */
export function applyMove(deps: RaidDeps, raidId: string, raider: string, move: unknown, seq: unknown): Promise<Result<RaidView>> {
  return applyMoves(deps, raidId, raider, [move], seq);
}

/**
 * Apply a batch of moves starting at index `seq` (0-based). Designed for an optimistic client
 * that keeps sending while earlier requests are in flight:
 *
 * - Resends are safe: moves the server already has (same index, same move) are skipped.
 * - A batch that starts past the end, or disagrees with stored moves, is "out of sync" (409)
 *   and returns the server's view so the client can reconcile.
 * - Moves after the raid ends are dropped; once over, further moves are rejected.
 */
export async function applyMoves(
  deps: RaidDeps,
  raidId: string,
  raider: string,
  moves: unknown,
  seq: unknown,
): Promise<Result<RaidView>> {
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > 120 || !moves.every(isRaidInput)) {
    return fail(400, "Moves must be a non-empty list of U, D, L, R (or E to keep going).");
  }
  if (!Number.isInteger(seq) || (seq as number) < 0) return fail(400, "seq must be a non-negative integer.");
  const rec = await deps.store.getRaid(raidId);
  if (!rec) return fail(404, "Raid not found.");
  if (rec.raider !== raider) return fail(403, "This isn't your raid.");
  const room = await deps.getRoom(rec.tokenId);
  if (!room) return fail(404, "No such Chog.");

  const n = seq as number;
  const have = rec.moves.length;
  if (n > have) return fail(409, "Out of sync.", viewOf(room, rec));
  const overlap = Math.min(have - n, moves.length);
  if (rec.moves.slice(n, n + overlap) !== (moves as RaidInput[]).slice(0, overlap).join("")) {
    return fail(409, "Out of sync.", viewOf(room, rec));
  }
  const fresh = (moves as RaidInput[]).slice(overlap);
  if (fresh.length === 0) return { ok: true, value: viewOf(room, rec) };
  // "Keep going": a raid that just ran out of moves reopens once with extra moves, if the very
  // next input is "E". Anything else after the end is rejected.
  const raidRoom = roomForRaid(room, rec.engine);
  const keepGoing =
    rec.status === "out_of_moves" &&
    fresh[0] === "E" &&
    rec.engine === NATIVE_ENGINE &&
    simulateRaid(raidRoom, rec.traps, rec.moves.split("") as RaidInput[]).extended < EXTRA_MOVES.extendLimit;
  if (rec.status !== "active" && !keepGoing) return fail(409, "This raid is over.", viewOf(room, rec));
  if (rec.status === "active" && fresh.includes("E") && !simulateRaid(raidRoom, rec.traps, [...(rec.moves.split("") as RaidInput[]), ...fresh]).extended) {
    return fail(400, "You can only keep going once you run out of moves.", viewOf(room, rec));
  }

  const all = (rec.moves + fresh.join("")).split("") as RaidInput[];
  const result = simulateRaid(raidRoom, rec.traps, all);
  const next: RaidRecord = {
    ...rec,
    moves: all.slice(0, result.stepsProcessed).join(""),
    status: result.outcome === "incomplete" ? "active" : result.outcome,
    hp: result.hp,
    movesLeft: result.movesLeft,
    endX: result.endAt.x,
    endY: result.endAt.y,
    updatedAt: new Date().toISOString(),
  };
  if (!(await deps.store.updateRaid(next, have))) {
    const cur = await deps.store.getRaid(raidId);
    return fail(409, "Out of sync.", cur ? viewOf(room, cur) : undefined);
  }
  return { ok: true, value: viewOf(room, next) };
}
export async function getRaidView(deps: RaidDeps, raidId: string, raider: string): Promise<Result<RaidView>> {
  const rec = await deps.store.getRaid(raidId);
  if (!rec) return fail(404, "Raid not found.");
  if (rec.raider !== raider) return fail(403, "This isn't your raid.");
  const room = await deps.getRoom(rec.tokenId);
  if (!room) return fail(404, "No such Chog.");
  return { ok: true, value: viewOf(room, rec) };
}

export type Replay = {
  raidId: string;
  tokenId: number;
  practice: boolean;
  status: RaidStatus;
  traps: Trap[];
  moves: RaidInput[];
  /** False for raids recorded before native defenses. */
  native: boolean;
  /** Engine version: replay on roomForRaid(room, engine). */
  engine: number;
};

/**
 * Full replay, including every trap. Only for finished raids, and only for practice raids,
 * the raider, or the room's current holder.
 */
export async function getReplay(deps: RaidDeps, raidId: string, requester: string): Promise<Result<Replay>> {
  const rec = await deps.store.getRaid(raidId);
  if (!rec) return fail(404, "Raid not found.");
  if (rec.status === "active") return fail(409, "This raid is still in progress.");
  if (!rec.practice && rec.raider.toLowerCase() !== requester.toLowerCase()) {
    const owner = await deps.ownerOf(rec.tokenId);
    if (!owner || owner.toLowerCase() !== requester.toLowerCase()) return fail(403, "Only the raider or the room's owner can replay this.");
  }
  return {
    ok: true,
    value: { raidId: rec.id, tokenId: rec.tokenId, practice: rec.practice, status: rec.status, traps: rec.traps, moves: rec.moves.split("") as RaidInput[], native: hasNative(rec.engine), engine: rec.engine ?? 1 },
  };
}

export type RaidSummary = {
  id: string;
  raider: string;
  practice: boolean;
  status: RaidStatus;
  moves: number;
  hp: number;
  end: Point;
  createdAt: string;
};

/** Public raid log for a room: outcomes and where raids ended, never trap positions. */
export async function listRoomRaids(deps: RaidDeps, tokenId: number, limit = 30): Promise<RaidSummary[]> {
  const raids = await deps.store.listRaids(tokenId, limit);
  return raids
    .filter((r) => r.status !== "abandoned" && r.moves.length > 0)
    .map((r) => ({
      id: r.id,
      raider: r.raider,
      practice: r.practice,
      status: r.status,
      moves: r.moves.length,
      hp: r.hp,
      end: { x: r.endX, y: r.endY },
      createdAt: r.createdAt,
    }));
}
