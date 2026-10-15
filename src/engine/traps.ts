import { GAME } from "./config";
import { DIR_ORDER, inBounds, samePoint, step } from "./grid";
import { MinHeap } from "./heap";
import { mulberry32, pick, randInt } from "./rng";
import type { Move, Point, Room, Trap, TrapType } from "./types";

type Guard = Extract<Trap, { type: "guard" }>;

export const TRAP_INFO: Record<TrapType, { label: string; blurb: string }> = {
  spike: { label: "Spike", blurb: `Deals ${GAME.spikeDamage} damage when stepped on.` },
  teleporter: { label: "Teleporter", blurb: "Sends the raider back to the entrance." },
  guard: {
    label: "Guard",
    blurb: `Patrols up to ${GAME.guardRouteMax} tiles back and forth. Contact deals ${GAME.guardDamage} damage.`,
  },
  lockdoor: { label: "Lock door", blurb: "Blocks the way until the raider picks up its key." },
};

const tileAt = (room: Room, p: Point) => room.tiles[p.y * room.size + p.x];
const isEndpoint = (room: Room, p: Point) => samePoint(p, room.entrance) || samePoint(p, room.exit);

/** Tiles a guard walks, starting at its own tile, stopping at walls, void and the endpoints. */
export function guardRoute(room: Room, g: Pick<Guard, "x" | "y" | "axis">): Point[] {
  const route: Point[] = [{ x: g.x, y: g.y }];
  const d = g.axis === "h" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  for (let i = 1; i < GAME.guardRouteMax; i++) {
    const p = { x: g.x + d.x * i, y: g.y + d.y * i };
    if (!inBounds(room.size, p) || isEndpoint(room, p)) break;
    const t = tileAt(room, p);
    if (t === "wall" || t === "void") break;
    route.push(p);
  }
  return route;
}

/** Guard position after `turn` turns (ping-pong along the route). */
export function guardAt(route: Point[], turn: number): Point {
  if (route.length === 1) return route[0];
  const period = 2 * (route.length - 1);
  const k = turn % period;
  return route[k < route.length ? k : period - k];
}

export type TrapCheck = { ok: true } | { ok: false; error: string };

export function validateTraps(room: Room, traps: Trap[]): TrapCheck {
  if (traps.length > room.rules.trapSlots) {
    return { ok: false, error: `Only ${room.rules.trapSlots} trap slots in this room.` };
  }
  if (traps.filter((t) => t.type === "lockdoor").length > GAME.maxLockdoors) {
    return { ok: false, error: `At most ${GAME.maxLockdoors} lock doors.` };
  }
  // Native defenses occupy their tiles; the owner's traps go on top of them.
  const native = room.native?.traps ?? [];
  const used = new Set<number>();
  for (const t of native) {
    used.add(t.y * room.size + t.x);
    if (t.type === "lockdoor") used.add(t.key.y * room.size + t.key.x);
  }
  const claim = (p: Point, what: string): string | null => {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !inBounds(room.size, p)) {
      return `${what} is outside the room.`;
    }
    if (isEndpoint(room, p)) return `${what} can't go on the entrance or exit.`;
    const t = tileAt(room, p);
    if (t !== "floor" && t !== "water") return `${what} must go on floor or water.`;
    const i = p.y * room.size + p.x;
    if (used.has(i)) return `Tile ${p.x},${p.y} is already taken (a native defense or another trap).`;
    used.add(i);
    return null;
  };
  for (const t of traps) {
    if (!room.rules.allowedTraps.includes(t.type)) {
      return { ok: false, error: `${TRAP_INFO[t.type]?.label ?? t.type} is not unlocked in this room.` };
    }
    const err =
      claim(t, TRAP_INFO[t.type].label) ??
      (t.type === "lockdoor" ? claim(t.key, "Key") : null) ??
      (t.type === "guard" && t.axis !== "h" && t.axis !== "v" ? "Guard needs an axis." : null);
    if (err) return { ok: false, error: err };
  }
  if (!findSafePath(room, [...native, ...traps])) {
    return { ok: false, error: "That setup makes the room impossible. Raiders need a fair path to the exit." };
  }
  return { ok: true };
}

/**
 * Proof of solvability: a move list that reaches the exit, found by searching
 * (position, keys held, damage taken) by move cost. Guards are treated
 * pessimistically (every tile on a route deals contact damage once per guard),
 * so the real raid along this path can only take less damage. Teleporters are
 * avoided entirely. Returns null when no fair path exists.
 */
export type SearchStart = { at: Point; keys: number[]; damage: number; movesUsed: number };

export function findSafePath(room: Room, traps: Trap[], from?: SearchStart): Move[] | null {
  const { size, rules } = room;
  const n = size * size;
  const hp = rules.raiderHp;
  const extraDamage = new Array(n).fill(0);
  const blocked = new Array(n).fill(false);
  const doorAt = new Array(n).fill(-1);
  const keyAt = new Array(n).fill(-1);

  traps.forEach((t, ti) => {
    const i = t.y * size + t.x;
    if (t.type === "spike") extraDamage[i] += GAME.spikeDamage;
    if (t.type === "teleporter") blocked[i] = true;
    if (t.type === "guard") {
      for (const p of guardRoute(room, t)) extraDamage[p.y * size + p.x] += GAME.guardDamage;
    }
    if (t.type === "lockdoor") {
      doorAt[i] = ti;
      keyAt[t.key.y * size + t.key.x] = ti;
    }
  });
  const doorBit = new Map<number, number>();
  traps.forEach((t, ti) => t.type === "lockdoor" && doorBit.set(ti, 1 << doorBit.size));

  const stateId = (cell: number, keys: number, dmg: number) => (keys * hp + dmg) * n + cell;
  const startKeys = (from?.keys ?? []).reduce((b, k) => b | (doorBit.get(k) ?? 0), 0);
  const startDmg = from?.damage ?? 0;
  if (startDmg >= hp) return null;
  const at = from?.at ?? room.entrance;
  const start = stateId(at.y * size + at.x, startKeys, startDmg);
  const cost = new Map<number, number>([[start, from?.movesUsed ?? 0]]);
  const prev = new Map<number, [number, Move]>();
  const heap = new MinHeap<number>();
  heap.push(from?.movesUsed ?? 0, start);

  while (heap.size > 0) {
    const s = heap.pop()!;
    const c = cost.get(s)!;
    const cell = s % n;
    const dmg = Math.floor(s / n) % hp;
    const keys = Math.floor(s / n / hp);
    const p = { x: cell % size, y: Math.floor(cell / size) };

    for (const m of DIR_ORDER) {
      const q = step(p, m);
      if (!inBounds(size, q)) continue;
      const j = q.y * size + q.x;
      const t = room.tiles[j];
      if (t === "wall" || t === "void" || blocked[j]) continue;
      if (doorAt[j] >= 0 && !(keys & doorBit.get(doorAt[j])!)) continue;
      const nc = c + (t === "water" ? GAME.waterMoveCost : 1);
      if (nc > rules.maxMoves) continue;

      if (samePoint(q, room.exit)) {
        const moves: Move[] = [m];
        for (let k = s; prev.has(k); k = prev.get(k)![0]) moves.push(prev.get(k)![1]);
        return moves.reverse();
      }
      const nd = dmg + (t === "hazard" ? GAME.hazardDamage : 0) + extraDamage[j];
      if (nd >= hp) continue;
      const nk = keyAt[j] >= 0 ? keys | doorBit.get(keyAt[j])! : keys;
      const ns = stateId(j, nk, nd);
      if (nc < (cost.get(ns) ?? Infinity)) {
        cost.set(ns, nc);
        prev.set(ns, [s, m]);
        heap.push(nc, ns);
      }
    }
  }
  return null;
}

/**
 * A seeded, valid trap layout using the room's slots and unlocked types.
 * Used for tests and for trying a room before its owner has defended it.
 */
export function sampleTraps(room: Room, seed: number): Trap[] {
  const rng = mulberry32(seed);
  const open: Point[] = [];
  room.tiles.forEach((t, i) => {
    const p = { x: i % room.size, y: Math.floor(i / room.size) };
    if ((t === "floor" || t === "water") && !isEndpoint(room, p)) open.push(p);
  });
  const traps: Trap[] = [];
  for (let attempt = 0; attempt < 60 && traps.length < room.rules.trapSlots; attempt++) {
    const type = pick(rng, room.rules.allowedTraps);
    const p = open[randInt(rng, open.length)];
    let trap: Trap;
    if (type === "guard") trap = { type, ...p, axis: rng() < 0.5 ? "h" : "v" };
    else if (type === "lockdoor") trap = { type, ...p, key: open[randInt(rng, open.length)] };
    else trap = { type, ...p };
    if (validateTraps(room, [...traps, trap]).ok) traps.push(trap);
  }
  return traps;
}
