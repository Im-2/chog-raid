import { classifyPixel, colorDistance, toHex } from "./color";
import { CARVE_COST, COLOR_RULES, GAME, ROOM_SIZE } from "./config";
import { DIR_ORDER, inBounds, samePoint, step } from "./grid";
import { MinHeap } from "./heap";
import { hashString, mulberry32, randInt } from "./rng";
import { TIERS } from "@/config/tiers";
import { bossFor, buildNative, difficultyOf, tierOf } from "./native";
import { resolveRules } from "./traitRules";
import type { Pixel, Point, Room, RoomInput, Tile } from "./types";

/**
 * Deterministic room generation: same tokenId + pixels + traits => same room.
 *
 * 1. Classify each pixel into a tile (see COLOR_RULES in config.ts).
 * 2. Flood-fill the flat background from the border into impassable void.
 * 3. Seeded entrance (left edge) and exit (right edge).
 * 4. Trait hazard sprinkle.
 * 5. Carve the cheapest path entrance -> exit so the room is always solvable.
 */
export function generateRoom(input: RoomInput): Room {
  const size = ROOM_SIZE;
  const n = size * size;
  if (input.pixels.length !== n) {
    throw new Error(`expected ${n} pixels, got ${input.pixels.length}`);
  }

  const seed = hashString(`chog-room:${input.tokenId}`);
  const rng = mulberry32(seed);
  const tiles: Tile[] = input.pixels.map(classifyPixel);
  markVoid(input.pixels, tiles, size);
  const colors = input.pixels.map(toHex);
  const carved: boolean[] = new Array(n).fill(false);
  const { rules, hazardSprinkle } = resolveRules(input.traits);
  // Tier sets the raider's limits and extra owner slots; native defenses are added at the end.
  const tierId = tierOf(input.traits);
  const spec = TIERS[tierId];
  rules.raiderHp = spec.raiderHp;
  rules.maxMoves = spec.maxMoves;
  rules.trapSlots = Math.min(GAME.maxTrapSlots + spec.extraTrapSlots, rules.trapSlots + spec.extraTrapSlots);

  const entrance = { x: 0, y: 2 + randInt(rng, size - 4) };
  const exit = { x: size - 1, y: 2 + randInt(rng, size - 4) };

  const candidates: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % size;
    if (tiles[i] === "floor" && x > 1 && x < size - 2) candidates.push(i);
  }
  for (let k = 0; k < hazardSprinkle && candidates.length > 0; k++) {
    const [i] = candidates.splice(randInt(rng, candidates.length), 1);
    tiles[i] = "hazard";
  }

  const open = (p: Point) => {
    const i = p.y * size + p.x;
    if (tiles[i] !== "floor") {
      tiles[i] = "floor";
      carved[i] = true;
    }
  };
  for (const p of [entrance, { x: 1, y: entrance.y }, exit, { x: size - 2, y: exit.y }]) open(p);

  for (const p of cheapestPath(tiles, size, entrance, exit)) open(p);

  if (walkCost(tiles, size, entrance, exit) > rules.maxMoves) {
    // Practically unreachable on a 16x16 grid, but keep the guarantee hard.
    for (let x = 0; x < size; x++) open({ x, y: entrance.y });
    const dy = Math.sign(exit.y - entrance.y);
    for (let y = entrance.y; y !== exit.y; y += dy) open({ x: size - 1, y });
  }

  const boss = tierId === "legendary" ? bossFor(input.title) : null;
  const room: Room = {
    tokenId: input.tokenId,
    size,
    seed,
    tiles,
    colors,
    carved,
    entrance,
    exit,
    rules,
    tier: { id: tierId, level: spec.level, name: spec.name, label: spec.label, lightRadius: spec.lightRadius + (boss?.lightRadiusDelta ?? 0) },
    native: { traps: [], walls: [], hazards: [], moat: [], boss: null },
    difficulty: { score: 0, rating: 1 },
  };
  room.native = buildNative(room, spec, boss);
  room.difficulty = difficultyOf(room);
  if (spec.level > 1) rules.notes.unshift(`${spec.name} tier: native defenses built in (${spec.label.toLowerCase()})`);
  if (room.native.boss) rules.notes.unshift(`Boss room, ${room.native.boss.name}: ${room.native.boss.blurb}`);
  return room;
}

/** Background flood fill: border-connected pixels close to the dominant border color. */
function markVoid(pixels: Pixel[], tiles: Tile[], size: number): void {
  const border: number[] = [];
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) border.push(i);
  }
  const counts = new Map<string, number>();
  let bgHex = "";
  let best = 0;
  for (const i of border) {
    const hex = toHex(pixels[i]);
    const c = (counts.get(hex) ?? 0) + 1;
    counts.set(hex, c);
    if (c > best) {
      best = c;
      bgHex = hex;
    }
  }
  // A busy, non-flat background has no void.
  if (best < border.length / 4) return;
  const bg = pixels[border.find((i) => toHex(pixels[i]) === bgHex)!];

  const seen = new Uint8Array(size * size);
  const queue = border.filter((i) => colorDistance(pixels[i], bg) <= COLOR_RULES.voidTolerance);
  queue.forEach((i) => (seen[i] = 1));
  while (queue.length > 0) {
    const i = queue.shift()!;
    tiles[i] = "void";
    const p = { x: i % size, y: Math.floor(i / size) };
    for (const m of DIR_ORDER) {
      const q = step(p, m);
      if (!inBounds(size, q)) continue;
      const j = q.y * size + q.x;
      if (!seen[j] && colorDistance(pixels[j], bg) <= COLOR_RULES.voidTolerance) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
}

function cheapestPath(tiles: Tile[], size: number, from: Point, to: Point): Point[] {
  const dist = new Array(size * size).fill(Infinity);
  const prev = new Array<number>(size * size).fill(-1);
  const start = from.y * size + from.x;
  const heap = new MinHeap<number>();
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size > 0) {
    const i = heap.pop()!;
    const p = { x: i % size, y: Math.floor(i / size) };
    if (samePoint(p, to)) break;
    for (const m of DIR_ORDER) {
      const q = step(p, m);
      if (!inBounds(size, q)) continue;
      const j = q.y * size + q.x;
      const d = dist[i] + CARVE_COST[tiles[j]];
      if (d < dist[j]) {
        dist[j] = d;
        prev[j] = i;
        heap.push(d, j);
      }
    }
  }
  const path: Point[] = [];
  for (let i = to.y * size + to.x; i !== -1; i = prev[i]) {
    path.push({ x: i % size, y: Math.floor(i / size) });
  }
  return path.reverse();
}

/** Move cost of the shortest damage-free walk, or Infinity. */
export function walkCost(tiles: Tile[], size: number, from: Point, to: Point): number {
  const dist = new Array(size * size).fill(Infinity);
  const heap = new MinHeap<number>();
  const start = from.y * size + from.x;
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size > 0) {
    const i = heap.pop()!;
    const p = { x: i % size, y: Math.floor(i / size) };
    if (samePoint(p, to)) return dist[i];
    for (const m of DIR_ORDER) {
      const q = step(p, m);
      if (!inBounds(size, q)) continue;
      const j = q.y * size + q.x;
      const t = tiles[j];
      if (t !== "floor" && t !== "water") continue;
      const d = dist[i] + (t === "water" ? GAME.waterMoveCost : 1);
      if (d < dist[j]) {
        dist[j] = d;
        heap.push(d, j);
      }
    }
  }
  return Infinity;
}
