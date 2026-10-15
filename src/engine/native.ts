// Native defenses: built-in walls, embers, water, guards and locked doors that every room of a
// tier gets, generated deterministically from the tokenId and tier (numbers in config/tiers.ts).
// Each piece is only kept if a fair route to the exit still exists, so rooms stay solvable.

import { BOSSES, DIFFICULTY, RATING_THRESHOLDS, TIERS, type BossSignature, type TierSpec } from "@/config/tiers";
import { DIR_ORDER, inBounds, samePoint, step } from "./grid";
import { hashString, mulberry32, randInt } from "./rng";
import { GAME } from "./config";
import { findSafePath, validateTraps } from "./traps";
import type { NativeDefenses, Point, Room, TierId, Trait, Trap } from "./types";

/** The room's tier, from the Tier trait (falling back to the Base trait it always pairs with). */
export function tierOf(traits: Trait[]): TierId {
  const tier = traits.find((t) => t.trait_type === "Tier")?.value?.toLowerCase();
  if (tier && tier in TIERS) return tier as TierId;
  const base = traits.find((t) => t.trait_type === "Base")?.value;
  if (base === "1:1") return "legendary";
  if (base === "Radioactive") return "epic";
  if (base === "Skull") return "rare";
  return "common";
}

/** All traps a raider faces: the room's native defenses first, then the owner's (or practice) traps. */
export function withNative(room: Room, traps: Trap[]): Trap[] {
  return room.native?.traps.length ? [...room.native.traps, ...traps] : traps;
}

const shuffle = <T,>(rng: () => number, items: T[]): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Steps from `from` to every tile, not passing `blocked`. */
function distances(room: Room, from: Point, blocked: Set<number>): Int16Array {
  const n = room.size * room.size;
  const dist = new Int16Array(n).fill(-1);
  const q = [from.y * room.size + from.x];
  dist[q[0]] = 0;
  while (q.length) {
    const i = q.shift()!;
    const p = { x: i % room.size, y: Math.floor(i / room.size) };
    for (const m of DIR_ORDER) {
      const r = step(p, m);
      if (!inBounds(room.size, r)) continue;
      const j = r.y * room.size + r.x;
      const t = room.tiles[j];
      if (dist[j] >= 0 || blocked.has(j) || t === "wall" || t === "void") continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

export function bossFor(title: string | null | undefined): (BossSignature & { title: string }) | null {
  if (!title) return null;
  const sig = BOSSES[title];
  if (sig) return { ...sig, title };
  // An unknown 1/1: pick a signature deterministically so it still feels unique.
  const all = Object.values(BOSSES);
  return { ...all[hashString(`boss:${title}`) % all.length], title };
}

/**
 * Add the tier's native defenses to a freshly generated room (mutates room.tiles) and return them.
 */
export function buildNative(room: Room, spec: TierSpec, boss: (BossSignature & { title: string }) | null): NativeDefenses {
  const rng = mulberry32(hashString(`native:${room.tokenId}`));
  const { size } = room;
  const native: NativeDefenses = { traps: [], walls: [], hazards: [], moat: [], boss: boss ? { title: boss.title, name: boss.name, blurb: boss.blurb } : null };
  const fair = (traps: Trap[] = native.traps) => findSafePath(room, traps) !== null;
  const reserved = new Set<number>();
  const at = (p: Point) => p.y * size + p.x;
  for (const p of [room.entrance, room.exit, { x: 1, y: room.entrance.y }, { x: size - 2, y: room.exit.y }]) reserved.add(at(p));

  const floor = () => room.tiles.flatMap((t, i) => (t === "floor" && !reserved.has(i) ? [i] : []));

  // 1. Boss moat: slow water around the exit.
  if (boss?.moat) {
    const d = distances(room, room.exit, new Set());
    const near = floor().filter((i) => d[i] > 0).sort((a, b) => d[a] - d[b]);
    for (const i of near) {
      if (native.moat.length >= boss.moat) break;
      room.tiles[i] = "water";
      if (fair()) native.moat.push(i);
      else room.tiles[i] = "floor";
    }
  }

  // 2. Tighter corridors: extra walls.
  const density = spec.wallDensity + (boss?.extraWallDensity ?? 0);
  const wallTarget = Math.round(density * floor().length);
  for (const i of shuffle(rng, floor())) {
    if (native.walls.length >= wallTarget) break;
    room.tiles[i] = "wall";
    if (fair()) native.walls.push(i);
    else room.tiles[i] = "floor";
  }

  // 3. Embers.
  const hazardTarget = spec.hazards + (boss?.extraHazards ?? 0);
  for (const i of shuffle(rng, floor())) {
    if (native.hazards.length >= hazardTarget) break;
    room.tiles[i] = "hazard";
    if (fair()) native.hazards.push(i);
    else room.tiles[i] = "floor";
  }

  const used = new Set<number>(reserved);
  const claim = (p: Point) => used.add(at(p));
  const free = (p: Point) => !used.has(at(p)) && (room.tiles[at(p)] === "floor" || room.tiles[at(p)] === "water");

  // 4. Locked doors across the fair route, each key far from its door.
  const doorTarget = spec.doors + (boss?.extraDoors ?? 0);
  for (let d = 0; d < doorTarget; d++) {
    const route = pathPoints(room, findSafePath(room, native.traps) ?? []);
    const mid = route.slice(3, -3).filter(free);
    let placed = false;
    for (const door of shuffle(rng, mid).slice(0, 8)) {
      const dist = distances(room, room.entrance, new Set([at(door), ...native.traps.flatMap((t) => (t.type === "lockdoor" ? [at(t)] : []))]));
      const fromDoor = distances(room, door, new Set());
      const keys = floor()
        .map((i) => ({ x: i % size, y: Math.floor(i / size) }))
        .filter((k) => free(k) && dist[at(k)] > 0 && fromDoor[at(k)] >= spec.keyMinDistance)
        .sort((a, b) => fromDoor[at(b)] - fromDoor[at(a)]);
      for (const key of keys.slice(0, 12)) {
        const trap: Trap = { type: "lockdoor", x: door.x, y: door.y, key };
        if (fair([...native.traps, trap])) {
          native.traps.push(trap);
          claim(door);
          claim(key);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  // 5. Guards patrolling near the fair route.
  const guardTarget = spec.guards + (boss?.extraGuards ?? 0);
  for (let g = 0; g < guardTarget; g++) {
    const route = pathPoints(room, findSafePath(room, native.traps) ?? []);
    let placed = false;
    for (const p of shuffle(rng, route.slice(2, -2).filter(free)).slice(0, 12)) {
      const trap: Trap = { type: "guard", x: p.x, y: p.y, axis: rng() < 0.5 ? "h" : "v" };
      if (fair([...native.traps, trap])) {
        native.traps.push(trap);
        claim(p);
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }

  return native;
}

/** Positions visited by a move list, from the entrance. */
export function pathPoints(room: Room, moves: string[] | readonly string[]): Point[] {
  const pts: Point[] = [room.entrance];
  for (const m of moves) {
    const p = step(pts[pts.length - 1], m as "U" | "D" | "L" | "R");
    if (!samePoint(p, pts[pts.length - 1])) pts.push(p);
  }
  return pts;
}

/**
 * A room's difficulty score (0-100) from its real layout and native defenses: how much of the
 * move budget the shortest fair route eats, raider HP and moves, guards, doors, embers, how
 * cramped the room is, and how many traps its owner can add. Weights: DIFFICULTY in config/tiers.ts.
 */
export function difficultyOf(room: Room): { score: number; rating: number } {
  const W = DIFFICULTY;
  const route = findSafePath(room, room.native.traps);
  const par = route ? route.length : room.rules.maxMoves;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const open = room.tiles.filter((t) => t === "floor" || t === "water").length / room.tiles.length;
  const hazards = room.tiles.filter((t) => t === "hazard").length;
  const guards = room.native.traps.filter((t) => t.type === "guard").length;
  const doors = room.native.traps.filter((t) => t.type === "lockdoor").length;
  const raw =
    W.route * clamp01((par / room.rules.maxMoves - W.routeFrom) / (W.routeTo - W.routeFrom)) +
    W.perMissingHp * Math.max(0, GAME.raiderHp - room.rules.raiderHp) +
    W.perMissingMove * Math.max(0, GAME.maxMoves - room.rules.maxMoves) +
    W.perGuard * Math.min(W.maxGuards, guards) +
    W.perDoor * doors +
    W.perHazard * Math.min(W.maxHazards, hazards) +
    W.cramped * (1 - open) +
    W.perExtraSlot * Math.max(0, room.rules.trapSlots - GAME.baseTrapSlots);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  let rating = 1;
  RATING_THRESHOLDS.forEach((t, i) => score >= t && (rating = i + 1));
  return { score, rating };
}

/** Engine version stamped on raids played with native defenses. Older raids replay on legacyRoom. */
export const NATIVE_ENGINE = 2;

/**
 * The room as it was before native defenses existed: native tiles back to floor, no native
 * traps, and the old raider limits. Raids recorded before then replay exactly on this.
 */
export function legacyRoom(room: Room): Room {
  if (!room.native) return room;
  const tiles = [...room.tiles];
  for (const i of [...room.native.walls, ...room.native.hazards, ...room.native.moat]) tiles[i] = "floor";
  return {
    ...room,
    tiles,
    rules: { ...room.rules, raiderHp: GAME.raiderHp, maxMoves: GAME.maxMoves },
    native: { traps: [], walls: [], hazards: [], moat: [], boss: null },
  };
}

/** The room a recorded raid was played on. */
export const roomForRaid = (room: Room, engine: number | undefined): Room => (engine === NATIVE_ENGINE ? room : legacyRoom(room));

/**
 * Owner traps saved before native defenses (or before a tier change) may now overlap a native
 * piece. Keep every trap that still fits, in order, so the defense stays valid and fair.
 */
export function fitTraps(room: Room, traps: Trap[]): Trap[] {
  if (validateTraps(room, traps).ok) return traps;
  const kept: Trap[] = [];
  for (const t of traps) if (validateTraps(room, [...kept, t]).ok) kept.push(t);
  return kept;
}
