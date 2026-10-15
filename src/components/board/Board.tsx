"use client";

import { chogName } from "@/lib/names";
import { useEffect, useRef } from "react";
import type { Move, Point, RaidEvent, RaidOutcome, Room, Trap } from "@/engine";
import { playSfx, type Sfx } from "@/lib/sound";
import { markFrame } from "../game/latency";
import {
  COLORS,
  T,
  drawEndpoint,
  drawGuard,
  drawGuardRoute,
  drawLiveTiles,
  drawRaider,
  drawSkull,
  drawTorchlight,
  drawTrap,
  renderTileLayer,
} from "./draw";

export type BoardProps = {
  room: Room;
  /** Traps to draw (the caller decides what is visible). */
  traps: Trap[];
  /** Raider positions so far, starting at the entrance. Empty = no raider (editor). */
  path?: Point[];
  guards?: Point[];
  events?: RaidEvent[];
  outcome?: RaidOutcome;
  /** Indices into `traps` of lockdoors whose key has been collected. */
  keysHeld?: number[];
  guardRoutes?: Point[][];
  /** Per-tile counts (row-major) drawn as a heatmap, e.g. where raiders got through. */
  heat?: number[];
  /** Where failed raids ended. */
  deaths?: Point[];
  ghostPath?: Point[];
  highlight?: Point | null;
  sound?: boolean;
  /** Skip tweens and effects (replay scrubbing). */
  instant?: boolean;
  onTileTap?: (p: Point) => void;
  onTrapDrag?: (from: Point, to: Point) => void;
  onSwipe?: (m: Move) => void;
  label?: string;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Floater = { x: number; y: number; text: string; color: string; born: number };

const STEP_MS = 110;
const adjacent = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;

export function Board(props: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const layerRef = useRef<{ room: Room; canvas: HTMLCanvasElement } | null>(null);
  const dragRef = useRef<{ start: Point; startPx: { x: number; y: number }; over: Point; trap: boolean; swiped?: boolean } | null>(null);

  const anim = useRef({
    shown: -1,
    seg: null as null | { from: Point; to: Point; start: number; dur: number },
    raider: { x: 0, y: 0 },
    guardsFrom: [] as Point[],
    guardsTo: [] as Point[],
    guardsStart: 0,
    guardsRef: undefined as Point[] | undefined,
    eventsSeen: 0,
    shakeUntil: 0,
    shakeMag: 0,
    flashUntil: 0,
    victoryAt: 0,
    deadAt: 0,
    stalledAt: 0,
    lastDraw: 0,
    lastProps: null as BoardProps | null,
    pathRef: null as Point[] | null,
    particles: [] as Particle[],
    floaters: [] as Floater[],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const a = anim.current;

    const sfx = (s: Sfx) => propsRef.current.sound && playSfx(s);
    const burst = (p: Point, color: string, n: number, speed = 160) => {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        a.particles.push({
          x: p.x * T + T / 2,
          y: p.y * T + T / 2,
          vx: Math.cos(ang) * v,
          vy: Math.sin(ang) * v - 60,
          life: 0,
          max: 0.5 + Math.random() * 0.5,
          color,
          size: 3 + Math.floor(Math.random() * 3),
        });
      }
    };

    const fire = (e: RaidEvent, now: number) => {
      switch (e.kind) {
        case "damage":
          a.shakeUntil = now + 280;
          a.shakeMag = 7;
          a.flashUntil = now + 220;
          a.floaters.push({ x: e.at.x * T + T / 2, y: e.at.y * T, text: `-${e.amount}`, color: COLORS.blood, born: now });
          burst(e.at, COLORS.blood, 10, 120);
          sfx("hurt");
          break;
        case "key":
          burst(e.at, COLORS.gold, 28, 200);
          a.floaters.push({ x: e.at.x * T + T / 2, y: e.at.y * T, text: "KEY!", color: COLORS.gold, born: now });
          sfx("key");
          break;
        case "teleport":
          burst(e.at, COLORS.arcane, 30, 180);
          sfx("teleport");
          break;
        case "door":
          a.shakeUntil = now + 120;
          a.shakeMag = 2;
          a.floaters.push({ x: e.at.x * T + T / 2, y: e.at.y * T, text: "LOCKED", color: COLORS.torch, born: now });
          sfx("door");
          break;
        case "bump":
          a.shakeUntil = now + 90;
          a.shakeMag = 2;
          sfx("bump");
          break;
        case "breach":
          a.victoryAt = now;
          burst(e.at, COLORS.gold, 60, 260);
          sfx("win");
          break;
        case "out_of_moves":
          a.stalledAt = now;
          a.shakeUntil = now + 250;
          a.shakeMag = 4;
          a.floaters.push({ x: e.at.x * T + T / 2, y: e.at.y * T, text: "OUT OF MOVES", color: COLORS.steel, born: now });
          sfx("lose");
          break;
        case "defeated":
          a.deadAt = now;
          a.shakeUntil = now + 450;
          a.shakeMag = 10;
          sfx("lose");
          break;
      }
    };

    // Phones and tablets redraw idle ambience (water, torch flicker) at 15 fps; anything moving
    // (raider, guards, effects) always gets every frame.
    const idleMs = window.matchMedia("(pointer: coarse)").matches ? 66 : 33;

    const frame = (now: number) => {
      const p = propsRef.current;
      const { room } = p;
      const t = now / 1000;
      const path = p.path ?? [];
      const events = p.events ?? [];

      const active =
        p !== a.lastProps ||
        !!a.seg ||
        a.shown < path.length - 1 ||
        a.particles.length > 0 ||
        a.floaters.length > 0 ||
        now < a.shakeUntil ||
        now < a.flashUntil ||
        now - a.guardsStart < STEP_MS ||
        (a.victoryAt > 0 && now - a.victoryAt < 4000) ||
        dragRef.current !== null;
      if (!active && now - a.lastDraw < idleMs) {
        raf = requestAnimationFrame(frame);
        return;
      }
      a.lastProps = p;
      a.lastDraw = now;

      if (layerRef.current?.room !== room) layerRef.current = { room, canvas: renderTileLayer(room) };

      // The server corrected a predicted path (e.g. a hidden trap): rewind to where they differ.
      if (a.pathRef && a.pathRef !== path && a.shown > 0) {
        const upto = Math.min(a.shown, path.length - 1, a.pathRef.length - 1);
        for (let i = 0; i <= upto; i++) {
          if (a.pathRef[i].x !== path[i].x || a.pathRef[i].y !== path[i].y) {
            a.shown = Math.max(0, i - 1);
            a.seg = null;
            a.raider = { x: path[a.shown].x * T, y: path[a.shown].y * T };
            break;
          }
        }
      }
      a.pathRef = path;

      // Reset (new raid / restart): snap everything.
      if (path.length - 1 < a.shown || events.length < a.eventsSeen) {
        a.shown = path.length - 1;
        a.seg = null;
        a.eventsSeen = events.length;
        a.particles = [];
        a.floaters = [];
        a.victoryAt = 0;
        a.deadAt = 0;
        a.stalledAt = 0;
        if (path.length) a.raider = { x: path[path.length - 1].x * T, y: path[path.length - 1].y * T };
      }
      if (a.shown < 0 && path.length) {
        a.shown = 0;
        a.raider = { x: path[0].x * T, y: path[0].y * T };
      }
      if (p.instant && path.length) {
        a.shown = path.length - 1;
        a.seg = null;
        a.raider = { x: path[a.shown].x * T, y: path[a.shown].y * T };
        a.eventsSeen = events.length;
      }

      // Advance along the path.
      if (!a.seg && a.shown < path.length - 1) {
        const from = path[a.shown];
        const to = path[a.shown + 1];
        markFrame(now);
        if (adjacent(from, to)) {
          const behind = path.length - 1 - a.shown;
          a.seg = { from, to, start: now, dur: behind > 3 ? STEP_MS / 2 : STEP_MS };
          if (from.x !== to.x || from.y !== to.y) sfx("step");
        } else {
          a.shown++;
          a.raider = { x: to.x * T, y: to.y * T };
        }
      }
      if (a.seg) {
        const k = Math.min(1, (now - a.seg.start) / a.seg.dur);
        const e = 1 - (1 - k) * (1 - k);
        a.raider = {
          x: (a.seg.from.x + (a.seg.to.x - a.seg.from.x) * e) * T,
          y: (a.seg.from.y + (a.seg.to.y - a.seg.from.y) * e) * T,
        };
        if (k >= 1) {
          a.shown++;
          a.seg = null;
        }
      }
      if (!a.seg && a.shown === path.length - 1 && events.length > a.eventsSeen) {
        for (const e of events.slice(a.eventsSeen)) fire(e, now);
        a.eventsSeen = events.length;
      }

      // Guards tween between their previous and current positions.
      const guards = p.guards ?? [];
      if (a.guardsRef !== p.guards) {
        const kPrev = Math.min(1, (now - a.guardsStart) / STEP_MS);
        a.guardsFrom = a.guardsTo.length === guards.length && !p.instant
          ? a.guardsTo.map((g, i) => ({ x: a.guardsFrom[i].x + (g.x - a.guardsFrom[i].x) * kPrev, y: a.guardsFrom[i].y + (g.y - a.guardsFrom[i].y) * kPrev }))
          : guards;
        a.guardsTo = guards;
        a.guardsStart = now;
        a.guardsRef = p.guards;
      }
      const gk = Math.min(1, (now - a.guardsStart) / STEP_MS);

      // ---- draw ----
      const W = room.size * T;
      ctx.save();
      ctx.clearRect(0, 0, W, W);
      if (now < a.shakeUntil) {
        const m = a.shakeMag * ((a.shakeUntil - now) / 300);
        ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      }
      ctx.drawImage(layerRef.current.canvas, 0, 0);
      drawLiveTiles(ctx, room, t);
      drawEndpoint(ctx, room.entrance, "in", t);
      drawEndpoint(ctx, room.exit, "out", t);

      for (const r of p.guardRoutes ?? []) drawGuardRoute(ctx, r);

      if (p.heat?.length) {
        const max = Math.max(1, ...p.heat);
        p.heat.forEach((h, i) => {
          if (!h) return;
          const k = h / max;
          ctx.fillStyle = `rgba(255,${Math.round(180 - 140 * k)},40,${0.25 + 0.45 * k})`;
          ctx.fillRect((i % room.size) * T + 2, Math.floor(i / room.size) * T + 2, T - 4, T - 4);
        });
      }
      for (const d of p.deaths ?? []) {
        ctx.strokeStyle = "rgba(244,231,208,0.85)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(d.x * T + 10, d.y * T + 10);
        ctx.lineTo(d.x * T + T - 10, d.y * T + T - 10);
        ctx.moveTo(d.x * T + T - 10, d.y * T + 10);
        ctx.lineTo(d.x * T + 10, d.y * T + T - 10);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(244,231,208,0.22)";
      for (const q of path.slice(0, Math.max(0, a.shown))) ctx.fillRect(q.x * T + T / 2 - 3, q.y * T + T / 2 - 3, 6, 6);

      if (p.ghostPath?.length) {
        ctx.fillStyle = "rgba(127,210,140,0.55)";
        for (const q of p.ghostPath) ctx.fillRect(q.x * T + T / 2 - 4, q.y * T + T / 2 - 4, 8, 8);
      }

      p.traps.forEach((trap, i) => drawTrap(ctx, trap, t, { keyTaken: p.keysHeld?.includes(i) }));
      a.guardsTo.forEach((g, i) => {
        const f = a.guardsFrom[i] ?? g;
        drawGuard(ctx, (f.x + (g.x - f.x) * gk) * T, (f.y + (g.y - f.y) * gk) * T);
      });

      const settled = a.shown === path.length - 1 && !a.seg;
      const dead = p.outcome === "defeated" && settled;
      const stalled = p.outcome === "out_of_moves" && settled;
      if (path.length) {
        if (dead) {
          drawRaider(ctx, a.raider.x, a.raider.y, t, true);
          drawSkull(ctx, path[path.length - 1]);
        } else if (stalled) {
          drawRaider(ctx, a.raider.x, a.raider.y, t, true);
          const end = path[path.length - 1];
          const r = T * (0.55 + 0.1 * Math.sin(t * 4));
          ctx.strokeStyle = COLORS.steel;
          ctx.lineWidth = 3;
          ctx.strokeRect(end.x * T + T / 2 - r, end.y * T + T / 2 - r, r * 2, r * 2);
        } else {
          drawRaider(ctx, a.raider.x, a.raider.y, t);
        }
        drawTorchlight(ctx, room.size, a.raider.x + T / 2, a.raider.y + T / 2, t, dead ? 0.6 : 1);
      }

      if (p.highlight) {
        ctx.strokeStyle = COLORS.torch;
        ctx.lineWidth = 3;
        ctx.strokeRect(p.highlight.x * T + 2, p.highlight.y * T + 2, T - 4, T - 4);
      }
      const drag = dragRef.current;
      if (drag?.trap && (drag.over.x !== drag.start.x || drag.over.y !== drag.start.y)) {
        ctx.strokeStyle = COLORS.gold;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 3;
        ctx.strokeRect(drag.over.x * T + 2, drag.over.y * T + 2, T - 4, T - 4);
        ctx.setLineDash([]);
      }

      // Victory: golden rays from the exit, renewed sparks.
      if (a.victoryAt) {
        const age = (now - a.victoryAt) / 1000;
        const ex = room.exit.x * T + T / 2;
        const ey = room.exit.y * T + T / 2;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2 + age * 0.6;
          ctx.strokeStyle = `rgba(255,209,102,${0.18 * Math.min(1, age * 2)})`;
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + Math.cos(ang) * W, ey + Math.sin(ang) * W);
          ctx.stroke();
        }
        ctx.restore();
        if (Math.random() < 0.3) burst(room.exit, COLORS.gold, 3, 140);
      }

      // Particles and floating text.
      const dt = 1 / 60;
      a.particles = a.particles.filter((q) => (q.life += dt) < q.max);
      for (const q of a.particles) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += 380 * dt;
        ctx.globalAlpha = 1 - q.life / q.max;
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x | 0, q.y | 0, q.size, q.size);
      }
      ctx.globalAlpha = 1;
      a.floaters = a.floaters.filter((f) => now - f.born < 900);
      ctx.font = "bold 18px 'Pixelify Sans', monospace";
      ctx.textAlign = "center";
      for (const f of a.floaters) {
        const age = (now - f.born) / 900;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = COLORS.ink;
        ctx.fillText(f.text, f.x + 2, f.y - age * 30 + 2);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - age * 30);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (a.stalledAt) {
        ctx.fillStyle = `rgba(20,16,12,${0.45 * Math.min(1, (now - a.stalledAt) / 500)})`;
        ctx.fillRect(0, 0, W, W);
        if (path.length) {
          const end = path[path.length - 1];
          ctx.strokeStyle = COLORS.steel;
          ctx.lineWidth = 3;
          ctx.strokeRect(end.x * T + 2, end.y * T + 2, T - 4, T - 4);
        }
      }
      if (a.deadAt) {
        const v = ctx.createRadialGradient(W / 2, W / 2, W * 0.25, W / 2, W / 2, W * 0.75);
        v.addColorStop(0, "rgba(120,0,0,0)");
        v.addColorStop(1, `rgba(120,0,0,${0.45 * Math.min(1, (now - a.deadAt) / 400)})`);
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, W);
      }
      if (now < a.flashUntil) {
        ctx.fillStyle = `rgba(229,72,77,${0.35 * ((a.flashUntil - now) / 220)})`;
        ctx.fillRect(0, 0, W, W);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toTile = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    const size = props.room.size;
    return {
      x: Math.max(0, Math.min(size - 1, Math.floor(((e.clientX - r.left) / r.width) * size))),
      y: Math.max(0, Math.min(size - 1, Math.floor(((e.clientY - r.top) / r.height) * size))),
    };
  };
  const trapAt = (p: Point) =>
    props.traps.some((t) => (t.x === p.x && t.y === p.y) || (t.type === "lockdoor" && t.key.x === p.x && t.key.y === p.y));

  return (
    <canvas
      ref={canvasRef}
      width={props.room.size * T}
      height={props.room.size * T}
      className="pixel"
      role="img"
      aria-label={props.label ?? `Room of ${chogName(props.room.tokenId)}`}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      onPointerDown={(e) => {
        const p = toTile(e);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        dragRef.current = { start: p, over: p, startPx: { x: e.clientX, y: e.clientY }, trap: !!props.onTrapDrag && trapAt(p) };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        d.over = toTile(e);
        // Swipe fires as soon as the finger has travelled far enough, not on release.
        if (props.onSwipe && !d.trap && !d.swiped) {
          const dx = e.clientX - d.startPx.x;
          const dy = e.clientY - d.startPx.y;
          if (Math.hypot(dx, dy) > 24) {
            d.swiped = true;
            props.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
          }
        }
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        const p = toTile(e);
        const dx = e.clientX - d.startPx.x;
        const dy = e.clientY - d.startPx.y;
        if (d.swiped) return;
        if (props.onSwipe && Math.hypot(dx, dy) > 24) {
          props.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
          return;
        }
        if (d.trap && (p.x !== d.start.x || p.y !== d.start.y)) props.onTrapDrag?.(d.start, p);
        else props.onTileTap?.(p);
      }}
      onPointerCancel={() => (dragRef.current = null)}
    />
  );
}
