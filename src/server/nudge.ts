// "Rebuild nudge": after a breach, show the owner where raiders got through and suggest one trap change.
// Pure: built on the shared engine, so the heatmap is exactly the paths raiders walked.

import { fitTraps, guardRoute, roomForRaid, simulateRaid, validateTraps, type RaidInput, type Move, type Point, type Room, type Trap, type TrapType } from "@/engine";
import type { RaidRecord } from "./store/types";

export type Suggestion = {
  action: "add" | "move";
  /** Index into the current traps for "move". */
  trapIndex?: number;
  type: TrapType;
  to: Point;
  traps: Trap[];
  reason: string;
};

export type Nudge = {
  breaches: number;
  raids: number;
  /** Per tile: how many breaching raiders stepped there (row-major, room.size^2). */
  heat: number[];
  /** Where failed raids ended (deaths / out of moves). */
  deaths: Point[];
  suggestion: Suggestion | null;
};

const idx = (room: Room, p: Point) => p.y * room.size + p.x;

/** Tiles a trap covers (a guard's whole route). */
function coverage(room: Room, t: Trap): Point[] {
  return t.type === "guard" ? guardRoute(room, t) : [{ x: t.x, y: t.y }];
}

export function rebuildNudge(room: Room, traps: Trap[], raids: RaidRecord[], savedAt: string): Nudge {
  const recent = raids.filter((r) => !r.practice && r.createdAt >= savedAt && r.status !== "active" && r.status !== "abandoned");
  const heat = new Array(room.size * room.size).fill(0);
  const deaths: Point[] = [];
  let breaches = 0;
  for (const r of recent) {
    const res = simulateRaid(roomForRaid(room, r.engine), r.traps, r.moves.split("") as RaidInput[]);
    if (r.status === "breach") {
      breaches++;
      const seen = new Set<number>();
      for (const p of res.path) seen.add(idx(room, p));
      seen.forEach((i) => heat[i]++);
    } else {
      deaths.push(res.endAt);
    }
  }
  return { breaches, raids: recent.length, heat, deaths, suggestion: breaches ? suggest(room, fitTraps(room, traps), heat, breaches) : null };
}

function suggest(room: Room, traps: Trap[], heat: number[], breaches: number): Suggestion | null {
  const occupied = new Set<number>();
  traps.forEach((t) => {
    occupied.add(idx(room, t));
    if (t.type === "lockdoor") occupied.add(idx(room, t.key));
  });
  // Hottest walkable tiles first; break ties toward the exit side, where detours cost the raider most.
  const candidates = heat
    .map((h, i) => ({ h, i, p: { x: i % room.size, y: Math.floor(i / room.size) } }))
    .filter(({ h, i, p }) => h > 0 && !occupied.has(i) && (room.tiles[i] === "floor" || room.tiles[i] === "water") &&
      !(p.x === room.entrance.x && p.y === room.entrance.y) && !(p.x === room.exit.x && p.y === room.exit.y))
    .sort((a, b) => b.h - a.h || b.p.x - a.p.x);

  const type: TrapType = room.rules.allowedTraps.includes("spike") ? "spike" : room.rules.allowedTraps[0];
  const why = (h: number) => `${h} of ${breaches} raider${breaches === 1 ? "" : "s"} who got through walked this tile.`;

  // Free slot: add a trap on the hottest tile that keeps the room fair.
  if (traps.length < room.rules.trapSlots) {
    for (const c of candidates.slice(0, 40)) {
      const next = [...traps, { type, ...c.p } as Trap];
      if (validateTraps(room, next).ok) return { action: "add", type, to: c.p, traps: next, reason: why(c.h) };
    }
  }
  // No free slot: move the trap that the breaching raiders touched least onto the hottest tile.
  const usage = traps.map((t, i) => ({ i, used: coverage(room, t).reduce((s, p) => s + heat[idx(room, p)], 0) }));
  usage.sort((a, b) => a.used - b.used);
  for (const { i } of usage.slice(0, 3)) {
    const t = traps[i];
    if (t.type === "lockdoor") continue;
    for (const c of candidates.slice(0, 40)) {
      const moved = { ...t, x: c.p.x, y: c.p.y } as Trap;
      const next = traps.map((x, j) => (j === i ? moved : x));
      if (validateTraps(room, next).ok) {
        return { action: "move", trapIndex: i, type: t.type, to: c.p, traps: next, reason: `Your ${t.type} at ${t.x},${t.y} barely saw action. ${why(c.h)}` };
      }
    }
  }
  return null;
}
