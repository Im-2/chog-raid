"use client";

import { useEffect, useRef } from "react";
import type { Point, Room, Trap } from "@/engine";

const T = 32; // canvas px per tile

export type RoomCanvasProps = {
  room: Room;
  /** Traps to draw (callers decide what is visible). */
  traps: Trap[];
  raider?: Point | null;
  guards?: Point[];
  trail?: Point[];
  marker?: { at: Point; kind: "dead" | "breach" } | null;
  /** Keys already collected (lockdoor trap indices into `traps`), drawn as taken. */
  keysHeld?: number[];
};

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount));
  return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("");
}

function drawTiles(ctx: CanvasRenderingContext2D, room: Room) {
  for (let i = 0; i < room.tiles.length; i++) {
    const x = (i % room.size) * T;
    const y = Math.floor(i / room.size) * T;
    const color = room.colors[i];
    const tile = room.tiles[i];
    const checker = ((i % room.size) + Math.floor(i / room.size)) % 2 === 0;

    if (tile === "void") {
      ctx.fillStyle = mix(color, 10, 0.85);
      ctx.fillRect(x, y, T, T);
      continue;
    }
    if (room.carved[i]) {
      ctx.fillStyle = mix(mix(color, 128, 0.55), 0, checker ? 0.05 : 0.12);
      ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 8);
      ctx.lineTo(x + 14, y + 16);
      ctx.lineTo(x + 11, y + 25);
      ctx.moveTo(x + 14, y + 16);
      ctx.lineTo(x + 25, y + 19);
      ctx.stroke();
      continue;
    }
    switch (tile) {
      case "floor":
        ctx.fillStyle = mix(color, checker ? 255 : 0, 0.06);
        ctx.fillRect(x, y, T, T);
        break;
      case "wall":
        ctx.fillStyle = mix(color, 0, 0.35);
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(x, y, T, 4);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x, y + T - 4, T, 4);
        break;
      case "water":
        ctx.fillStyle = mix(color, 0, 0.1);
        ctx.fillRect(x, y, T, T);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 2;
        for (const oy of [10, 22]) {
          ctx.beginPath();
          ctx.moveTo(x + 4, y + oy);
          ctx.quadraticCurveTo(x + 10, y + oy - 4, x + 16, y + oy);
          ctx.quadraticCurveTo(x + 22, y + oy + 4, x + 28, y + oy);
          ctx.stroke();
        }
        break;
      case "hazard":
        ctx.fillStyle = mix(color, 0, 0.1);
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "rgba(255,220,80,0.8)";
        for (const [dx, dy] of [[8, 9], [21, 13], [12, 22], [24, 25]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
  }
}

function drawEndpoint(ctx: CanvasRenderingContext2D, p: Point, color: string, label: string) {
  const x = p.x * T;
  const y = p.y * T;
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
  ctx.fillStyle = "#0e0b1a";
  ctx.font = "bold 16px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + T / 2, y + T / 2 + 1);
}

function drawTrap(ctx: CanvasRenderingContext2D, trap: Trap, keyTaken: boolean) {
  const x = trap.x * T;
  const y = trap.y * T;
  switch (trap.type) {
    case "spike":
      ctx.fillStyle = "#d4d4d8";
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1.5;
      for (const ox of [4, 12, 20]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + 26);
        ctx.lineTo(x + ox + 4, y + 8);
        ctx.lineTo(x + ox + 8, y + 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    case "teleporter":
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      for (const r of [11, 6]) {
        ctx.beginPath();
        ctx.arc(x + T / 2, y + T / 2, r, 0, Math.PI * 1.6);
        ctx.stroke();
      }
      break;
    case "lockdoor":
      ctx.fillStyle = "#92400e";
      ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x + T / 2, y + 14, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + T / 2 - 1.5, y + 14, 3, 8);
      if (!keyTaken) {
        const kx = trap.key.x * T;
        const ky = trap.key.y * T;
        ctx.strokeStyle = "#fbbf24";
        ctx.fillStyle = "#fbbf24";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(kx + 11, ky + T / 2, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(kx + 15, ky + T / 2 - 1.5, 12, 3);
        ctx.fillRect(kx + 23, ky + T / 2, 3, 6);
      }
      break;
    case "guard":
      break; // drawn at its live position
  }
}

function drawGuard(ctx: CanvasRenderingContext2D, p: Point) {
  const cx = p.x * T + T / 2;
  const cy = p.y * T + T / 2;
  ctx.fillStyle = "#ef4444";
  ctx.strokeStyle = "#450a0a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(cx - 6, cy - 4, 4, 4);
  ctx.fillRect(cx + 2, cy - 4, 4, 4);
}

function drawRaider(ctx: CanvasRenderingContext2D, p: Point) {
  const cx = p.x * T + T / 2;
  const cy = p.y * T + T / 2;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#0e0b1a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0e0b1a";
  ctx.fillRect(cx - 5, cy - 3, 3, 4);
  ctx.fillRect(cx + 2, cy - 3, 3, 4);
}

export function RoomCanvas({ room, traps, raider, guards = [], trail = [], marker, keysHeld = [] }: RoomCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, room.size * T, room.size * T);
    drawTiles(ctx, room);
    drawEndpoint(ctx, room.entrance, "#4ade80", "IN");
    drawEndpoint(ctx, room.exit, "#fbbf24", "OUT");

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (const p of trail) ctx.fillRect(p.x * T + T / 2 - 3, p.y * T + T / 2 - 3, 6, 6);

    traps.forEach((t, i) => drawTrap(ctx, t, keysHeld.includes(i)));
    guards.forEach((g) => drawGuard(ctx, g));
    if (raider) drawRaider(ctx, raider);

    if (marker) {
      const x = marker.at.x * T;
      const y = marker.at.y * T;
      ctx.strokeStyle = marker.kind === "dead" ? "#f87171" : "#4ade80";
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
    }
  }, [room, traps, raider, guards, trail, marker, keysHeld]);

  return (
    <canvas
      ref={ref}
      width={room.size * T}
      height={room.size * T}
      className="pixel"
      style={{ width: "100%", maxWidth: room.size * T, aspectRatio: "1", borderRadius: 10, display: "block" }}
      aria-label={`Room of Chog #${room.tokenId}`}
    />
  );
}
