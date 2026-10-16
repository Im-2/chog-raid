"use client";

import { useEffect, useRef } from "react";
import type { Point, Room, Trap } from "@/engine";

const PX = 6; // minimap px per tile
const TILE_COLOR: Record<string, string> = {
  floor: "#8a7560",
  water: "#3f86c0",
  hazard: "#d0561f",
  wall: "#2c2018",
  void: "#120d0a",
};

/**
 * The explored map at a glance: seen tiles only, the raider, the exit and known doors/keys.
 * Redrawn only when its inputs change (a few hundred fillRects), never per animation frame.
 */
export function Minimap({
  room,
  seen,
  at,
  traps,
  keysHeld,
  guards,
  className,
}: {
  room: Room;
  seen: boolean[];
  at: Point;
  traps: Trap[];
  keysHeld: number[];
  guards: Point[];
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const S = room.size * PX;
    ctx.fillStyle = "#060403";
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < room.tiles.length; i++) {
      if (!seen[i]) continue;
      ctx.fillStyle = TILE_COLOR[room.tiles[i]] ?? "#000";
      ctx.fillRect((i % room.size) * PX, Math.floor(i / room.size) * PX, PX, PX);
    }
    const dot = (p: Point, color: string, inset = 1) => {
      if (p.x < 0) return;
      ctx.fillStyle = color;
      ctx.fillRect(p.x * PX + inset, p.y * PX + inset, PX - inset * 2, PX - inset * 2);
    };
    dot(room.entrance, "#7fd28c", 0);
    dot(room.exit, "#ffd166", 0);
    traps.forEach((t, i) => {
      if (t.type !== "lockdoor") return;
      if (!keysHeld.includes(i)) {
        dot(t, "#8a5523", 0);
        dot(t.key, "#ffd166", 2);
      }
    });
    for (const g of guards) dot(g, "#e5484d");
    ctx.strokeStyle = "#fff3c4";
    ctx.lineWidth = 2;
    ctx.strokeRect(at.x * PX, at.y * PX, PX, PX);
  }, [room, seen, at, traps, keysHeld, guards]);

  return (
    <canvas
      ref={ref}
      width={room.size * PX}
      height={room.size * PX}
      className={className}
      role="img"
      aria-label="Map of the explored room"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
