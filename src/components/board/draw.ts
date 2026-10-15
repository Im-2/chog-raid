// Canvas drawing for rooms. Pure functions over a 2D context; no React here.

import { hashString, mulberry32, type Point, type Room, type Trap } from "@/engine";

export const T = 40; // canvas px per tile

export const COLORS = {
  ink: "#120d0a",
  stone: "#2a2018",
  torch: "#ffb347",
  ember: "#ff7a2f",
  blood: "#e5484d",
  moss: "#7fd28c",
  arcane: "#b07cff",
  gold: "#ffd166",
  steel: "#d8d2c6",
};

/** Badge color per tier; native defenses are drawn in their room's tier color. */
export const TIER_COLORS: Record<string, string> = {
  common: "#b39c80",
  uncommon: "#7fd28c",
  rare: "#5fb3ff",
  epic: "#b07cff",
  legendary: "#ffd166",
};

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const STONE = hexToRgb(COLORS.stone);
const INK = hexToRgb(COLORS.ink);

const nativeTiles = (room: Room) =>
  new Set([...(room.native?.walls ?? []), ...(room.native?.hazards ?? []), ...(room.native?.moat ?? [])]);

/**
 * Paint one tile: tinted from its source Chog pixel, pulled toward dungeon stone so the room reads
 * as a dungeon built out of that Chog. Each tile has its own seeded grain, so tiles can be painted
 * one at a time (as fog lifts) and still look exactly the same.
 */
function paintTile(ctx: CanvasRenderingContext2D, room: Room, i: number, nativeTile: Set<number>) {
  const rng = mulberry32(hashString(`tiles:${room.tokenId}:${i}`));
  const P = 5; // stone grain block size
  const x = (i % room.size) * T;
  const y = Math.floor(i / room.size) * T;
  const src = hexToRgb(room.colors[i]);
  const tile = room.tiles[i];

  const grain = (base: RGB, amount: number) => {
    for (let gy = 0; gy < T; gy += P) {
      for (let gx = 0; gx < T; gx += P) {
        const v = (rng() - 0.5) * amount;
        ctx.fillStyle = rgb(mix(base, v > 0 ? [255, 240, 220] : INK, Math.abs(v)));
        ctx.fillRect(x + gx, y + gy, P, P);
      }
    }
  };

  if (tile === "void") {
    grain(mix(src, INK, 0.88), 0.25);
    return;
  }
  // Native pieces can sit on the carved path; they draw as what they are, not as cracked stone.
  if (room.carved[i] && !nativeTile.has(i)) {
    grain(mix(mix(src, [140, 128, 112], 0.6), STONE, 0.3), 0.18);
    ctx.fillStyle = rgb(INK, 0.55);
    for (const [cx, cy, w, h] of [[8, 10, 10, 3], [15, 13, 3, 12], [18, 22, 12, 3], [6, 28, 8, 3]]) ctx.fillRect(x + cx, y + cy, w, h);
  } else {
    switch (tile) {
      case "floor": {
        // Lift dark source colors so floor always reads lighter than walls.
        const lum = (0.2126 * src[0] + 0.7152 * src[1] + 0.0722 * src[2]) / 255;
        grain(mix(mix(src, STONE, 0.3), [150, 130, 110], Math.max(0, 0.35 - lum)), 0.14);
        ctx.fillStyle = rgb(INK, 0.28);
        ctx.fillRect(x, y + T - 2, T, 2);
        ctx.fillRect(x + T - 2, y, 2, T);
        break;
      }
      case "wall": {
        // Raised block: lit top face in the Chog's color, dark brick front.
        const front = mix(src, INK, 0.7);
        grain(front, 0.1);
        ctx.fillStyle = rgb(INK, 0.7);
        for (const by of [14, 27]) ctx.fillRect(x, y + by, T, 2);
        for (const [bx, by] of [[12, 16], [30, 16], [4, 29], [22, 29]]) ctx.fillRect(x + bx, y + by, 2, 11);
        ctx.fillStyle = rgb(mix(mix(src, STONE, 0.3), [255, 225, 190], 0.18));
        ctx.fillRect(x, y, T, 12);
        ctx.fillStyle = rgb(INK, 0.8);
        ctx.fillRect(x, y + 12, T, 2);
        break;
      }
      case "water":
        grain(mix(src, [20, 60, 110], 0.35), 0.1);
        break;
      case "hazard":
        // Embers keep a hot base whatever the Chog's color, so they always read as danger.
        grain(mix(src, [120, 32, 8], nativeTile.has(i) ? 0.75 : 0.5), 0.16);
        break;
    }
  }
  // Native walls and embers carry iron rivets in the tier color, so the built-in layer reads apart
  // from the Chog's own tiles even with the "Native defense" highlight off.
  if ((tile === "wall" || tile === "hazard") && nativeTile.has(i)) {
    ctx.fillStyle = rgb(hexToRgb(TIER_COLORS[room.tier.id] ?? COLORS.steel), 0.75);
    for (const [rx, ry] of [[4, 4], [T - 8, 4], [4, T - 8], [T - 8, T - 8]]) ctx.fillRect(x + rx, y + ry, 4, 4);
  }
  // A wall casts a short shadow onto the walkable tile below it.
  if (i >= room.size && tile !== "wall" && room.tiles[i - room.size] === "wall") {
    ctx.fillStyle = rgb(INK, 0.45);
    ctx.fillRect(x, y, T, 7);
  }
}

/** Static tile layer for a whole room (editor, replays without fog). */
export function renderTileLayer(room: Room): HTMLCanvasElement {
  const layer = createTileLayer(room.size);
  paintTiles(layer, room);
  return layer.canvas;
}

/** An offscreen tile layer that fills in as the raider explores. */
export type TileLayer = { canvas: HTMLCanvasElement; painted: Uint8Array; tokenId: number };

export function createTileLayer(size: number): TileLayer {
  const canvas = document.createElement("canvas");
  canvas.width = size * T;
  canvas.height = size * T;
  return { canvas, painted: new Uint8Array(size * size), tokenId: -1 };
}

/**
 * Paint every tile in `seen` (all tiles when omitted) that isn't painted yet. Starts over when the
 * room changes or the explored area shrinks (a new raid). Tiles never seen are never painted.
 */
export function paintTiles(layer: TileLayer, room: Room, seen?: boolean[]) {
  const ctx = layer.canvas.getContext("2d")!;
  const n = room.size * room.size;
  let reset = layer.tokenId !== room.tokenId;
  if (!reset && seen) for (let i = 0; i < n; i++) if (layer.painted[i] && !seen[i]) reset = true;
  if (reset) {
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.painted.fill(0);
    layer.tokenId = room.tokenId;
  }
  const nativeTile = nativeTiles(room);
  for (let i = 0; i < n; i++) {
    if (layer.painted[i] || (seen && !seen[i])) continue;
    paintTile(ctx, room, i, nativeTile);
    layer.painted[i] = 1;
    // A wall just found may shade the tile under it, painted earlier.
    const below = i + room.size;
    if (room.tiles[i] === "wall" && below < n && layer.painted[below]) paintTile(ctx, room, below, nativeTile);
  }
}

/**
 * Fog of war as a tiny 1px-per-tile mask (unseen: black, explored: dimmed, lit: clear). Drawn
 * scaled up with smoothing, so the fog gets soft edges for free.
 */
export function renderFogMask(size: number, seen: boolean[], lit: number[], explored = 0.5): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const litSet = new Set(lit);
  for (let i = 0; i < size * size; i++) {
    const a = !seen[i] ? 255 : litSet.has(i) ? 0 : Math.round(255 * explored);
    img.data.set([6, 4, 3, a], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const lightMasks = new Map<string, HTMLCanvasElement>();

/**
 * Pre-rendered torchlight: a radial darkness mask, clear at the raider and dark past the torch
 * radius. Built once per radius at low resolution and drawn scaled; never rebuilt per frame.
 */
export function lightMask(radiusTiles: number, roomSize: number): HTMLCanvasElement {
  const key = `${radiusTiles}:${roomSize}`;
  let c = lightMasks.get(key);
  if (c) return c;
  const span = roomSize * 2; // tiles covered, so the mask covers the room from any position
  const res = 8; // px per tile
  c = document.createElement("canvas");
  c.width = span * res;
  c.height = span * res;
  const ctx = c.getContext("2d")!;
  const mid = (span * res) / 2;
  const g = ctx.createRadialGradient(mid, mid, radiusTiles * res * 0.35, mid, mid, radiusTiles * res * 1.15);
  g.addColorStop(0, "rgba(6,4,3,0)");
  g.addColorStop(0.7, "rgba(6,4,3,0.35)");
  g.addColorStop(1, "rgba(6,4,3,0.7)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  lightMasks.set(key, c);
  return c;
}

let warmGlow: HTMLCanvasElement | null = null;
/** Warm additive torch glow, pre-rendered once. */
export function torchGlow(): HTMLCanvasElement {
  if (warmGlow) return warmGlow;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,150,60,0.28)");
  g.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  warmGlow = c;
  return c;
}

let emberGlow: HTMLCanvasElement | null = null;
/** Soft orange glow sprite for ember tiles (pre-rendered once). */
export function emberSprite(): HTMLCanvasElement {
  if (emberGlow) return emberGlow;
  const c = document.createElement("canvas");
  c.width = T * 2;
  c.height = T * 2;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(T, T, 2, T, T, T);
  g.addColorStop(0, "rgba(255,120,30,0.55)");
  g.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, T * 2, T * 2);
  emberGlow = c;
  return c;
}

/**
 * Animated overlays for water and ember tiles. `t` is seconds. Only tiles in `seen` are drawn.
 * Reduced effects: a single static frame (no shimmer, no flicker).
 */
export function drawLiveTiles(ctx: CanvasRenderingContext2D, room: Room, t: number, seen?: boolean[], reduced = false) {
  const tt = reduced ? 0 : t;
  const glow = emberSprite();
  for (let i = 0; i < room.tiles.length; i++) {
    const tile = room.tiles[i];
    if (tile !== "water" && tile !== "hazard") continue;
    if (seen && !seen[i]) continue;
    if (room.carved[i] && !room.native?.hazards.includes(i) && !room.native?.moat.includes(i)) continue;
    const x = (i % room.size) * T;
    const y = Math.floor(i / room.size) * T;
    if (tile === "water") {
      // Two drifting ripple rows plus a slow caustic glint.
      ctx.fillStyle = "rgba(200,235,255,0.45)";
      for (const row of [10, 24]) {
        const off = Math.floor((tt * 12 + i * 7 + row) % 30);
        ctx.fillRect(x + ((off + 4) % 30) + 2, y + row, 8, 3);
        ctx.fillRect(x + ((off + 19) % 30) + 2, y + row + 4, 6, 3);
      }
      const glint = 0.5 + 0.5 * Math.sin(tt * 2 + i * 1.7);
      ctx.fillStyle = `rgba(235,250,255,${0.25 * glint})`;
      ctx.fillRect(x + 6 + ((i * 13) % 22), y + 4 + ((i * 7) % 26), 4, 4);
    } else {
      // Embers: a soft additive glow that breathes, with bright flecks on top.
      const k = 0.55 + 0.3 * Math.sin(tt * 3 + i) + 0.15 * Math.sin(tt * 11 + i * 3);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.max(0.2, Math.min(1, k));
      ctx.drawImage(glow, x - T / 2, y - T / 2);
      ctx.restore();
      ctx.fillStyle = `rgba(255,140,40,${0.35 + 0.3 * k})`;
      for (const [dx, dy] of [[8, 10], [24, 14], [14, 26], [28, 28]]) ctx.fillRect(x + dx, y + dy, 5, 5);
      ctx.fillStyle = `rgba(255,230,120,${0.35 + 0.35 * k})`;
      for (const [dx, dy] of [[9, 11], [25, 15], [15, 27], [29, 29]]) ctx.fillRect(x + dx, y + dy, 2, 2);
    }
  }
}

export function drawEndpoint(ctx: CanvasRenderingContext2D, p: Point, kind: "in" | "out", t: number) {
  const x = p.x * T;
  const y = p.y * T;
  if (kind === "in") {
    ctx.fillStyle = "#3d2a1a";
    ctx.fillRect(x + 4, y + 4, T - 8, T - 6);
    ctx.fillStyle = COLORS.moss;
    ctx.fillRect(x + 4, y + 4, T - 8, 4);
    ctx.fillRect(x + 4, y + 4, 4, T - 6);
    ctx.fillRect(x + T - 8, y + 4, 4, T - 6);
    ctx.fillStyle = "rgba(127,210,140,0.25)";
    ctx.fillRect(x + 8, y + 8, T - 16, T - 10);
  } else {
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,209,102,${0.25 * pulse})`;
    ctx.fillRect(x - 4, y - 4, T + 8, T + 8);
    ctx.fillStyle = "#5a3a12";
    ctx.fillRect(x + 4, y + 2, T - 8, T - 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(x + 4, y + 2, T - 8, 4);
    ctx.fillRect(x + 4, y + 2, 4, T - 2);
    ctx.fillRect(x + T - 8, y + 2, 4, T - 2);
    ctx.fillStyle = `rgba(255,236,170,${0.5 + 0.3 * pulse})`;
    ctx.fillRect(x + 10, y + 8, T - 20, T - 10);
  }
}

/** Pixel sprites as strings: each char is a 4px block. */
function sprite(ctx: CanvasRenderingContext2D, rows: string[], palette: Record<string, string>, x: number, y: number, s = 4) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const col = palette[rows[r][c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c * s, y + r * s, s, s);
    }
  }
}

const SPIKE = ["..........", "..s..s..s.", "..s..s..s.", ".sSssSssS.", ".sSssSssS.", "dddddddddd"];
const KEY = ["..gg......", ".g..g.....", ".g..gggggg", ".g..g..g.g", "..gg......"];
const DOOR = [".bbbbbbbb.", "bBBBBBBBBb", "bBkBBBBkBb", "bBBBggBBBb", "bBBBggBBBb", "bBBBBgBBBb", "bBkBBBBkBb", "bBBBBBBBBb", "bbbbbbbbbb"];
const GUARD = ["..rrrrrr..", ".rRRRRRRr.", "rRwwRRwwRr", "rRwkRRwkRr", "rRRRRRRRRr", "rRRmmmmRRr", ".rRRRRRRr.", "..r....r.."];
const SKULL = ["..wwwwww..", ".wwwwwwww.", "wwkkwwkkww", "wwkkwwkkww", "wwwwkkwwww", ".wwwwwwww.", "..w.ww.w.."];

export function drawTrap(ctx: CanvasRenderingContext2D, trap: Trap, t: number, opts: { keyTaken?: boolean } = {}) {
  const x = trap.x * T;
  const y = trap.y * T;
  switch (trap.type) {
    case "spike":
      sprite(ctx, SPIKE, { s: COLORS.steel, S: "#ffffff", d: "#4b3a2c" }, x, y + 10);
      break;
    case "teleporter": {
      const spin = t * 3;
      for (let k = 0; k < 8; k++) {
        const a = spin + (k * Math.PI) / 4;
        const r = 9 + 4 * Math.sin(t * 2 + k);
        ctx.fillStyle = k % 2 ? COLORS.arcane : "#e2ccff";
        ctx.fillRect(x + T / 2 + Math.cos(a) * r - 2, y + T / 2 + Math.sin(a) * r - 2, 4, 4);
      }
      ctx.fillStyle = "rgba(176,124,255,0.35)";
      ctx.fillRect(x + 12, y + 12, 16, 16);
      break;
    }
    case "lockdoor":
      // A door or key the raider hasn't seen yet arrives as -1,-1: nothing to draw.
      if (trap.x >= 0) {
        if (opts.keyTaken) drawOpenDoor(ctx, x, y);
        else sprite(ctx, DOOR, { b: "#3b2410", B: "#8a5523", k: "#c9a36a", g: COLORS.gold }, x, y + 2);
      }
      if (!opts.keyTaken && trap.key.x >= 0) {
        const bob = Math.round(Math.sin(t * 3) * 2);
        sprite(ctx, KEY, { g: COLORS.gold }, trap.key.x * T, trap.key.y * T + 10 + bob);
      }
      break;
    case "guard":
      break; // drawn at its live position
  }
}

const GUARD_STEP = ["..r....r..", "...r..r..."];

/** A patrolling guard; `t` animates its bob and marching feet (pass 0 for a still frame). */
export function drawGuard(ctx: CanvasRenderingContext2D, px: number, py: number, t = 0) {
  const bob = Math.round(Math.sin(t * 8) * 1.5);
  const rows = [...GUARD.slice(0, 7), GUARD_STEP[Math.floor(t * 4) % 2]];
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(px + 8, py + T - 6, T - 16, 4);
  sprite(ctx, rows, { r: "#5b0f12", R: COLORS.blood, w: "#ffffff", k: COLORS.ink, m: "#2a0507" }, px, py + 4 + bob);
  // Eyes glint as it looks around.
  if (Math.sin(t * 2.3) > 0.85) {
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(px + 12, py + 16 + bob, 2, 2);
    ctx.fillRect(px + 28, py + 16 + bob, 2, 2);
  }
}

/** An unlocked door: the frame stays, the doorway is open. */
export function drawOpenDoor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#3b2410";
  ctx.fillRect(x + 4, y + 2, T - 8, 4);
  ctx.fillRect(x + 4, y + 2, 4, T - 4);
  ctx.fillRect(x + T - 8, y + 2, 4, T - 4);
  ctx.fillStyle = "rgba(10,7,5,0.55)";
  ctx.fillRect(x + 8, y + 6, T - 16, T - 8);
}

/** Door unlock animation, k from 0 to 1: the door slides up into its frame with a gold flash. */
export function drawDoorUnlock(ctx: CanvasRenderingContext2D, p: Point, k: number) {
  const x = p.x * T;
  const y = p.y * T;
  drawOpenDoor(ctx, x, y);
  const lift = Math.round((T - 4) * k);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, T, T);
  ctx.clip();
  sprite(ctx, DOOR, { b: "#3b2410", B: "#8a5523", k: "#c9a36a", g: COLORS.gold }, x, y + 2 - lift);
  ctx.restore();
  ctx.fillStyle = `rgba(255,209,102,${0.5 * (1 - k)})`;
  ctx.fillRect(x - 4, y - 4, T + 8, T + 8);
}

/** Telegraph: a pulsing warning on a tile that is about to hurt (a guard's next step, a known spike). */
export function drawTelegraph(ctx: CanvasRenderingContext2D, p: Point, t: number, color = COLORS.blood) {
  const k = 0.5 + 0.5 * Math.sin(t * 10);
  const x = p.x * T;
  const y = p.y * T;
  ctx.globalAlpha = 0.25 + 0.35 * k;
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const inset = 2 + 3 * k;
  ctx.strokeRect(x + inset, y + inset, T - inset * 2, T - inset * 2);
  ctx.globalAlpha = 1;
}

export function drawSkull(ctx: CanvasRenderingContext2D, p: Point) {
  sprite(ctx, SKULL, { w: "#f4e7d0", k: COLORS.ink }, p.x * T, p.y * T + 6);
}

/** The raider: a little hooded figure carrying a torch. px/py are canvas px (top-left of tile). */
export function drawRaider(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, dead = false) {
  const body = dead ? "#6b6258" : "#f4e7d0";
  const hood = dead ? "#3a332c" : "#7a4a2a";
  const bob = dead ? 0 : Math.round(Math.sin(t * 6) * 1);
  const rows = ["...hhhh...", "..hhhhhh..", ".hhbbbbhh.", ".hbkbbkbh.", ".hbbbbbbh.", "..hhhhhh..", ".hhhhhhhh.", ".hh....hh."];
  sprite(ctx, rows, { h: hood, b: body, k: COLORS.ink }, px, py + 4 + bob);
  if (!dead) {
    const f = 0.7 + 0.3 * Math.sin(t * 17);
    ctx.fillStyle = "#6b4426";
    ctx.fillRect(px + 34, py + 16 + bob, 3, 14);
    ctx.fillStyle = `rgba(255,${150 + 60 * f},60,1)`;
    ctx.fillRect(px + 32, py + 9 + bob, 7, 7);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(px + 34, py + 11 + bob, 3, 3);
  }
}

export function drawGuardRoute(ctx: CanvasRenderingContext2D, route: Point[]) {
  ctx.fillStyle = "rgba(229,72,77,0.22)";
  for (const p of route) ctx.fillRect(p.x * T + 3, p.y * T + 3, T - 6, T - 6);
  ctx.fillStyle = "rgba(229,72,77,0.7)";
  for (const p of route) ctx.fillRect(p.x * T + T / 2 - 2, p.y * T + T / 2 - 2, 4, 4);
}

/** Positions (row-major) of every native piece, for the "Native defense" layer. */
export function nativeCells(room: Room): number[] {
  const n = room.native;
  if (!n) return [];
  const traps = n.traps.flatMap((t) => (t.type === "guard" ? [] : t.type === "lockdoor" ? [t.y * room.size + t.x, t.key.y * room.size + t.key.x] : [t.y * room.size + t.x]));
  return [...new Set([...n.walls, ...n.hazards, ...n.moat, ...traps])];
}

/** The "Native defense" layer: pulsing tier-colored brackets around every built-in piece. */
export function drawNativeLayer(ctx: CanvasRenderingContext2D, room: Room, cells: number[], t: number) {
  const color = TIER_COLORS[room.tier.id] ?? COLORS.steel;
  ctx.globalAlpha = 0.65 + 0.3 * Math.sin(t * 3);
  ctx.fillStyle = color;
  const L = 10;
  for (const i of cells) {
    const x = (i % room.size) * T;
    const y = Math.floor(i / room.size) * T;
    for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [T, 0, -1, 1], [0, T, 1, -1], [T, T, -1, -1]]) {
      ctx.fillRect(dx > 0 ? x + cx + 1 : x + cx - L - 1, dy > 0 ? y + cy + 1 : y + cy - 4, L, 3);
      ctx.fillRect(dx > 0 ? x + cx + 1 : x + cx - 4, dy > 0 ? y + cy + 1 : y + cy - L - 1, 3, L);
    }
  }
  ctx.globalAlpha = 1;
}

/** Marks a built-in guard (tier-colored gem over its head). */
export function drawNativeMark(ctx: CanvasRenderingContext2D, room: Room, px: number, py: number) {
  // A small diamond gem in the tier color, outlined in ink, floating over the guard's head.
  const cx = px + T / 2;
  const cy = py + 1;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(cx - 2, cy - 6, 4, 12);
  ctx.fillRect(cx - 6, cy - 2, 12, 4);
  ctx.fillRect(cx - 4, cy - 4, 8, 8);
  ctx.fillStyle = TIER_COLORS[room.tier.id] ?? COLORS.steel;
  ctx.fillRect(cx - 1, cy - 4, 2, 8);
  ctx.fillRect(cx - 4, cy - 1, 8, 2);
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
}
