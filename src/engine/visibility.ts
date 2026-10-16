// Fog of war: what a raider can see by torchlight. Pure and deterministic, so the server (which
// decides what to send), the client (which predicts between replies) and replays all agree.

import type { Point, Room } from "./types";

const opaque = (room: Room, x: number, y: number) => {
  const t = room.tiles[y * room.size + x];
  return t === "wall" || t === "void";
};

/** True when nothing opaque stands strictly between the centers of a and b. */
function lineOfSight(room: Room, a: Point, b: Point): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  let lastX = a.x;
  let lastY = a.y;
  for (let k = 1; k < steps; k++) {
    // Sample the segment at half-tile resolution; round half away from the origin consistently.
    const x = Math.round(a.x + (dx * k) / steps);
    const y = Math.round(a.y + (dy * k) / steps);
    if ((x === lastX && y === lastY) || (x === b.x && y === b.y)) continue;
    if (opaque(room, x, y)) return false;
    lastX = x;
    lastY = y;
  }
  return true;
}

/** Tile indices lit by a torch at `at`: within `radius` (Euclidean) and in line of sight. Walls are lit, not see-through. */
export function litCells(room: Room, at: Point, radius: number = room.tier?.lightRadius ?? 5): number[] {
  const out: number[] = [];
  const r = Math.ceil(radius);
  for (let y = Math.max(0, at.y - r); y <= Math.min(room.size - 1, at.y + r); y++) {
    for (let x = Math.max(0, at.x - r); x <= Math.min(room.size - 1, at.x + r); x++) {
      const d2 = (x - at.x) ** 2 + (y - at.y) ** 2;
      if (d2 > radius * radius) continue;
      if (d2 <= 2 || lineOfSight(room, at, { x, y })) out.push(y * room.size + x);
    }
  }
  return out;
}

/** Every tile seen at some point along `path` (the raider's explored map). Rooms without fog: all of them. */
export function exploredCells(room: Room, path: Point[], radius?: number): boolean[] {
  const seen: boolean[] = new Array(room.size * room.size).fill(room.tier?.fog === false);
  if (room.tier?.fog === false) return seen;
  const done = new Set<number>();
  for (const p of path) {
    const k = p.y * room.size + p.x;
    if (done.has(k)) continue;
    done.add(k);
    for (const i of litCells(room, p, radius)) seen[i] = true;
  }
  return seen;
}
