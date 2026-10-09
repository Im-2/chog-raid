// Server-authoritative raids. The client never sees hidden traps and never decides outcomes:
// it sends one move at a time, the server appends it to the stored move list, replays the
// whole list with the shared engine, and returns only what the raider can see.

import { randomUUID } from "node:crypto";
import { roomDifficulty } from "@/config/retention";
import {
  findSafePath,
  isMove,
  sampleTraps,
  simulateRaid,
  type Move,
  type Point,
  type RaidEvent,
  type RaidOutcome,
  type Room,
  type Trap,
} from "@/engine";
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
  guards: Point[];
  /** Guards, lock doors (with keys), and spikes/teleporters the raider has stepped on. */
  visibleTraps: Trap[];
  /** Indices into visibleTraps of doors whose key is held. */
  keysHeld: number[];
};

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; view?: RaidView };

const fail = (status: number, error: string, view?: RaidView): Result<never> => ({ ok: false, status, error, view });

/** Traps a raider can see after walking `path`. Spikes and teleporters stay hidden until stepped on. */
export function visibleTraps(room: Room, traps: Trap[], path: Point[]): Trap[] {
  const stepped = new Set(path.map((p) => p.y * room.size + p.x));
  return traps.filter((t) => t.type === "guard" || t.type === "lockdoor" || stepped.has(t.y * room.size + t.x));
}

export function viewOf(room: Room, r: RaidRecord): RaidView {
  const result = simulateRaid(room, r.traps, r.moves.split("") as Move[]);
  const visible = visibleTraps(room, r.traps, result.path);
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
    guards: result.guards,
    visibleTraps: visible,
    keysHeld: result.keys.map((k) => visible.indexOf(r.traps[k])).filter((i) => i >= 0),
  };
}

/** Traps used for a room right now: the owner's saved defense, or seeded practice traps. */
export async function trapsFor(deps: RaidDeps, room: Room): Promise<{ traps: Trap[]; practice: boolean; defender: string | null }> {
  const defense = await deps.store.getDefense(room.tokenId);
  return defense
    ? { traps: defense.traps, practice: false, defender: defense.owner }
    : { traps: sampleTraps(room, room.seed), practice: true, defender: null };
}

export async function startRaid(deps: RaidDeps, tokenId: number, raider: string): Promise<Result<RaidView>> {
  const room = await deps.getRoom(tokenId);
  if (!room) return fail(404, "No such Chog.");
  const { traps, practice, defender } = await trapsFor(deps, room);
  await deps.store.abandonActive(raider, tokenId);
  const now = new Date().toISOString();
  const record: RaidRecord = {
    id: randomUUID(),
    tokenId,
    raider,
    practice,
    defender,
    par: findSafePath(room, traps)?.length ?? null,
    difficulty: roomDifficulty(room.rules, room.tiles.filter((t) => t === "hazard").length),
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
 * Apply move number `seq` (0-based). Retries of an already-applied seq return the current view,
 * so a flaky connection can safely resend. A seq from the future means the client is out of sync.
 */
export async function applyMove(
  deps: RaidDeps,
  raidId: string,
  raider: string,
  move: unknown,
  seq: unknown,
): Promise<Result<RaidView>> {
  if (!isMove(move)) return fail(400, "Move must be U, D, L or R.");
  if (!Number.isInteger(seq) || (seq as number) < 0) return fail(400, "seq must be a non-negative integer.");
  const rec = await deps.store.getRaid(raidId);
  if (!rec) return fail(404, "Raid not found.");
  if (rec.raider !== raider) return fail(403, "This isn't your raid.");
  const room = await deps.getRoom(rec.tokenId);
  if (!room) return fail(404, "No such Chog.");

  const n = seq as number;
  if (n < rec.moves.length) return { ok: true, value: viewOf(room, rec) };
  if (n > rec.moves.length) return fail(409, "Out of sync.", viewOf(room, rec));
  if (rec.status !== "active") return fail(409, "This raid is over.", viewOf(room, rec));

  const moves = rec.moves + move;
  const result = simulateRaid(room, rec.traps, moves.split("") as Move[]);
  const next: RaidRecord = {
    ...rec,
    moves,
    status: result.outcome === "incomplete" ? "active" : result.outcome,
    hp: result.hp,
    movesLeft: result.movesLeft,
    endX: result.endAt.x,
    endY: result.endAt.y,
    updatedAt: new Date().toISOString(),
  };
  if (!(await deps.store.updateRaid(next, rec.moves.length))) {
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

export type Replay = { raidId: string; tokenId: number; practice: boolean; status: RaidStatus; traps: Trap[]; moves: Move[] };

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
    value: { raidId: rec.id, tokenId: rec.tokenId, practice: rec.practice, status: rec.status, traps: rec.traps, moves: rec.moves.split("") as Move[] },
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
