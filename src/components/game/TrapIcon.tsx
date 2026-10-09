"use client";

import { useEffect, useRef } from "react";
import type { TrapType } from "@/engine";
import { drawGuard, drawTrap, T } from "../board/draw";

/** A trap sprite drawn with the same code as the board, for legends and the editor palette. */
export function TrapIcon({ type, size = 32 }: { type: TrapType; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, T, T);
    if (type === "guard") drawGuard(ctx, 0, 0);
    else if (type === "lockdoor") drawTrap(ctx, { type, x: 0, y: 0, key: { x: 9, y: 9 } }, 0, { keyTaken: true });
    else drawTrap(ctx, { type, x: 0, y: 0 }, 0.3);
  }, [type]);
  return <canvas ref={ref} width={T} height={T} className="pixel" style={{ width: size, height: size }} aria-hidden />;
}
