// Practice traps for rooms nobody defends yet: a small, fair set on or beside the route so every
// practice raid has something to dodge, on every tier. Deterministic per room (seeded), and every
// piece is kept only if a fair route to the exit still exists. Counts: PRACTICE in config/tiers.ts.

import { PRACTICE } from "@/config/tiers";
import { DIR_ORDER, inBounds, step } from "./grid";
import { pathPoints, withNative } from "./native";
import { hashString, mulberry32, randInt } from "./rng";
import { findSafePath } from "./traps";
import type { Point, Room, Trap } from "./types";

export function practiceTraps(room: Room): Trap[] {
  const spec = PRACTICE[room.tier?.id ?? "common"];
  const rng = mulberry32(hashString(`practice:${room.tokenId}`));
  const { size } = room;
  const at = (p: Point) => p.y * size + p.x;
  const pt = (i: number): Point => ({ x: i % size, y: Math.floor(i / size) });
  const shuffle = <T,>(items: T[]): T[] => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Tiles already taken: endpoints and the steps next to them, native pieces, pickups.
  const used = new Set<number>([room.entrance, room.exit, { x: 1, y: room.entrance.y }, { x: size - 2, y: room.exit.y }].map(at));
  for (const t of room.native?.traps ?? []) {
    used.add(at(t));
    if (t.type === "lockdoor") used.add(at(t.key));
  }
  for (const i of room.native?.pickups ?? []) used.add(i);
  const open = (p: Point) => inBounds(size, p) && !used.has(at(p)) && (room.tiles[at(p)] === "floor" || room.tiles[at(p)] === "water");

  const traps: Trap[] = [];
  const fair = (extra: Trap) => findSafePath(room, withNative(room, [...traps, extra])) !== null;
  const add = (t: Trap, cells: Point[]) => {
    traps.push(t);
    cells.forEach((c) => used.add(at(c)));
  };
  const route = () => pathPoints(room, findSafePath(room, withNative(room, traps)) ?? []).slice(2, -2);
  const near = (cells: Point[], reach: number) => {
    const out = new Set<number>();
    for (const p of cells) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const q = { x: p.x + dx, y: p.y + dy };
          if (Math.abs(dx) + Math.abs(dy) <= reach && open(q)) out.add(at(q));
        }
      }
    }
    return [...out].map(pt);
  };

  // Guards: on the route first (crossing it), then beside it; both patrol axes.
  for (let g = 0; g < spec.guards; g++) {
    const r = route();
    let placed = false;
    for (const p of [...shuffle(r.filter(open)), ...shuffle(near(r, 2))].slice(0, 40)) {
      const first: "h" | "v" = rng() < 0.5 ? "h" : "v";
      for (const axis of [first, first === "h" ? "v" : "h"] as const) {
        const t: Trap = { type: "guard", x: p.x, y: p.y, axis };
        if (fair(t)) {
          add(t, [p]);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  // Locked doors: across the route, the key somewhere reachable without passing the door.
  for (let d = 0; d < spec.doors; d++) {
    const r = route();
    let placed = false;
    for (const door of shuffle(r.slice(2, -2).filter(open)).slice(0, 10)) {
      const reach = reachable(room, room.entrance, new Set([at(door), ...traps.flatMap((t) => (t.type === "lockdoor" ? [at(t)] : []))]));
      const keys = shuffle([...reach].map(pt).filter((k) => open(k) && Math.abs(k.x - door.x) + Math.abs(k.y - door.y) >= 4)).slice(0, 12);
      for (const key of keys) {
        const t: Trap = { type: "lockdoor", x: door.x, y: door.y, key };
        if (fair(t)) {
          add(t, [door, key]);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  // Hidden spikes and teleporters just beside the route: they catch raiders who wander or take a
  // shortcut, not everyone who walks the obvious path (that was too punishing for practice).
  const onRoute = () => new Set(route().map(at));
  for (let k = 0; k < spec.spikes; k++) {
    const r = onRoute();
    for (const p of shuffle(near(route(), 1).filter((q) => !r.has(at(q)))).slice(0, 20)) {
      const t: Trap = { type: "spike", x: p.x, y: p.y };
      if (fair(t)) {
        add(t, [p]);
        break;
      }
    }
  }
  for (let k = 0; k < spec.teleporters; k++) {
    const r = onRoute();
    for (const p of shuffle(near(route(), 1).filter((q) => !r.has(at(q)))).slice(0, 20)) {
      const t: Trap = { type: "teleporter", x: p.x, y: p.y };
      if (fair(t)) {
        add(t, [p]);
        break;
      }
    }
  }
  return traps;
}

/** Tiles reachable from `from` without passing `blocked`. */
function reachable(room: Room, from: Point, blocked: Set<number>): Set<number> {
  const seen = new Set<number>([from.y * room.size + from.x]);
  const q = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const m of DIR_ORDER) {
      const n = step(p, m);
      const i = n.y * room.size + n.x;
      if (!inBounds(room.size, n) || seen.has(i) || blocked.has(i)) continue;
      const t = room.tiles[i];
      if (t === "wall" || t === "void") continue;
      seen.add(i);
      q.push(n);
    }
  }
  return seen;
}
