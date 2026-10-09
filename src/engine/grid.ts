import type { Move, Point } from "./types";

export const DIRS: Record<Move, Point> = {
  U: { x: 0, y: -1 },
  R: { x: 1, y: 0 },
  D: { x: 0, y: 1 },
  L: { x: -1, y: 0 },
};

/** Fixed neighbor order. Changing it changes generated rooms, so don't. */
export const DIR_ORDER: Move[] = ["U", "R", "D", "L"];

export function isMove(m: unknown): m is Move {
  return m === "U" || m === "D" || m === "L" || m === "R";
}

export function inBounds(size: number, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function step(p: Point, m: Move): Point {
  return { x: p.x + DIRS[m].x, y: p.y + DIRS[m].y };
}
