// Fog of war on the wire. The server sends only tiles the raider has seen; the client rebuilds
// a partial Room from that, so it can predict moves and draw the explored map without ever
// holding an unseen tile type. Pure; shared by the server, the client, replays and tests.

import { exploredCells, litCells } from "./visibility";
import { guardRoute } from "./traps";
import type { Point, Room, Tile, Trap } from "./types";

/**
 * One char per tile, row-major:
 *   ? unseen   (space) void   # wall   . floor   c carved floor   ~ water   ^ embers
 *   W native wall   E native embers   M native moat
 */
export type FogView = {
  radius: number;
  map: string;
  /** Hex colors ("rrggbb") of seen tiles only, in index order. */
  colors: string;
  /** Tiles lit by the torch right now. */
  lit: number[];
};

/** Everything about a room a raider may know before seeing any of it. */
export type PublicRoom = Omit<Room, "tiles" | "colors" | "carved" | "native"> & {
  native: {
    boss: Room["native"]["boss"];
    /** How many of each native piece the room has (positions stay hidden). */
    counts: { walls: number; hazards: number; moat: number; guards: number; doors: number };
  };
};

const CODE: Record<Tile, string> = { void: " ", wall: "#", floor: ".", water: "~", hazard: "^" };
const TILE: Record<string, Tile> = { " ": "void", "#": "wall", ".": "floor", c: "floor", "~": "water", "^": "hazard", W: "wall", E: "hazard", M: "water" };

export function publicRoom(room: Room): PublicRoom {
  const { tiles: _t, colors: _c, carved: _k, native, ...rest } = room;
  return {
    ...rest,
    native: {
      boss: native.boss,
      counts: {
        walls: native.walls.length,
        hazards: native.hazards.length,
        moat: native.moat.length,
        guards: native.traps.filter((t) => t.type === "guard").length,
        doors: native.traps.filter((t) => t.type === "lockdoor").length,
      },
    },
  };
}

/** What a raider who walked `path` knows of the room. `explored` can be passed if already computed. */
export function fogView(room: Room, path: Point[], explored: boolean[] = exploredCells(room, path)): FogView {
  // The entrance and the glowing exit door are always known.
  const seen = [...explored];
  for (const p of [room.entrance, room.exit]) seen[p.y * room.size + p.x] = true;
  const nWall = new Set(room.native?.walls ?? []);
  const nEmber = new Set(room.native?.hazards ?? []);
  const nMoat = new Set(room.native?.moat ?? []);
  let map = "";
  let colors = "";
  for (let i = 0; i < room.tiles.length; i++) {
    if (!seen[i]) {
      map += "?";
      continue;
    }
    map += nWall.has(i) ? "W" : nEmber.has(i) ? "E" : nMoat.has(i) ? "M" : room.carved[i] && room.tiles[i] === "floor" ? "c" : CODE[room.tiles[i]];
    colors += room.colors[i].slice(1);
  }
  const at = path[path.length - 1] ?? room.entrance;
  return { radius: room.tier.lightRadius, map, colors, lit: litCells(room, at) };
}

/** True for tiles the raider has seen. */
export const seenMask = (fog: FogView): boolean[] => [...fog.map].map((c) => c !== "?");

/**
 * The room as far as the raider knows it. Unseen tiles are assumed walkable floor, for prediction
 * only: a raider who queues moves faster than the server replies may step past the explored edge,
 * and the server's reply corrects it. Renderers must draw unseen tiles (seenMask) as darkness.
 */
export function fogRoom(pub: PublicRoom, fog: FogView): Room {
  const n = pub.size * pub.size;
  const tiles: Tile[] = new Array(n);
  const colors: string[] = new Array(n);
  const carved: boolean[] = new Array(n).fill(false);
  const native: Room["native"] = { traps: [], walls: [], hazards: [], moat: [], boss: pub.native.boss };
  let c = 0;
  for (let i = 0; i < n; i++) {
    const ch = fog.map[i] ?? "?";
    if (ch === "?") {
      tiles[i] = "floor";
      colors[i] = "#000000";
      continue;
    }
    tiles[i] = TILE[ch] ?? "void";
    colors[i] = `#${fog.colors.slice(c * 6, c * 6 + 6)}`;
    c++;
    if (ch === "c") carved[i] = true;
    if (ch === "W") native.walls.push(i);
    if (ch === "E") native.hazards.push(i);
    if (ch === "M") native.moat.push(i);
  }
  const { native: _n, ...rest } = pub;
  return { ...rest, tiles, colors, carved, native };
}

const HIDDEN: Point = { x: -1, y: -1 };

/** The traps a raider who walked `path` (and saw `seen`) knows about, with their index in `traps`. */
export function fogTraps(room: Room, traps: Trap[], path: Point[], seen: boolean[]): { trap: Trap; index: number }[] {
  const at = (p: Point) => p.y * room.size + p.x;
  const stepped = new Set(path.map(at));
  return traps.flatMap((t, index): { trap: Trap; index: number }[] => {
    if (t.type === "spike" || t.type === "teleporter") return stepped.has(at(t)) ? [{ trap: t, index }] : [];
    if (t.type === "guard") return guardRoute(room, t).some((p) => seen[at(p)]) ? [{ trap: t, index }] : [];
    const door = seen[at(t)];
    const key = seen[at(t.key)];
    if (!door && !key) return [];
    return [{ trap: { ...t, ...(door ? {} : HIDDEN), key: key ? t.key : HIDDEN }, index }];
  });
}

/**
 * A raider's full sight after walking `path`, from the whole room: the fog view, the traps they
 * know about, and what's lit now. The server sends this; owner test raids and replays compute it
 * locally from the same function, so a replay shows exactly what the raider saw.
 */
export function raiderSight(room: Room, traps: Trap[], path: Point[]) {
  const explored = exploredCells(room, path);
  const fog = fogView(room, path, explored);
  return { fog, seen: seenMask(fog), lit: fog.lit, visible: fogTraps(room, traps, path, explored) };
}
