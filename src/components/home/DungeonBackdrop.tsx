"use client";

import { useEffect, useRef } from "react";
import styles from "./backdrop.module.css";

// Ambient landing-page scene: a tiny raider walks an endless torch-lit corridor. Spikes pop,
// flames jet, a teleporter swirls, sometimes the raider falls (a skull stays behind) and
// sometimes they reach an exit door. Original pixel shapes only; drawn faintly behind the content.
//
// Cheap by design: a ~120px-tall canvas scaled up with crisp pixels, 30 fps cap, paused when the
// tab is hidden, and a single still frame when the user prefers reduced motion.

const H = 120; // logical canvas height (px)
const TILE = 8;
const FLOOR_TOP = 6 * TILE;
const FLOOR_ROWS = 4;
const SPEED = 14; // px per second (camera pan)
const FPS = 30;

const C = {
  void: "#120d0a",
  wall: "#5a4130",
  wallHi: "#86644a",
  mortar: "#2a1d14",
  floor: "#8a6c50",
  floor2: "#7a5e45",
  torch: "#ffb347",
  ember: "#ff7a2f",
  gold: "#ffd166",
  steel: "#d8d2c6",
  arcane: "#b07cff",
  blood: "#e5484d",
  hood: "#7a4a2a",
  skin: "#f4e7d0",
};

// Deterministic feature per corridor column.
const feature = (i: number) =>
  i % 48 === 47 ? "exit" : i % 9 === 4 ? "spike" : i % 17 === 11 ? "jet" : i % 29 === 20 ? "tele" : null;
const spikeUp = (i: number, t: number) => (t * 1.6 + i * 0.37) % 3 < 1.1;
const jetOn = (i: number, t: number) => (t * 1.2 + i * 0.21) % 2.4 < 0.8;

type Mark = { x: number; until: number; kind: "skull" | "burst" | "swirl" };

export function DungeonBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Reduced motion, small screens and low-power devices get one still frame instead of a loop.
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.innerWidth < 720 ||
      (nav.hardwareConcurrency ?? 8) <= 4 ||
      (nav.deviceMemory ?? 8) <= 4 ||
      !!nav.connection?.saveData;
    let W = 0;
    const resize = () => {
      W = Math.ceil((H * window.innerWidth) / Math.max(1, window.innerHeight));
      canvas.width = W;
      canvas.height = H;
    };
    resize();

    const marks: Mark[] = [];
    let respawnAt = 0; // raider hidden until this time after a fall
    let lastCol = -1;

    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };

    const draw = (t: number) => {
      const cam = t * SPEED;
      const first = Math.floor(cam / TILE) - 1;
      const cols = Math.ceil(W / TILE) + 2;
      px(0, 0, W, H, C.void);

      for (let k = 0; k < cols; k++) {
        const i = first + k;
        const x = i * TILE - cam;
        // Walls above and below the corridor, with brick courses.
        for (let row = 0; row < H / TILE; row++) {
          const y = row * TILE;
          const inFloor = y >= FLOOR_TOP && y < FLOOR_TOP + FLOOR_ROWS * TILE;
          if (inFloor) px(x, y, TILE, TILE, (i + row) % 2 ? C.floor : C.floor2);
          else if (row === 5 || row === 10) {
            px(x, y, TILE, TILE, C.wall);
            px(x, y, TILE, 2, C.wallHi);
          } else if (row > 3 && row < 12) {
            px(x, y, TILE, TILE, C.wall);
            px(x + ((row % 2) * 4), y, 1, TILE, C.mortar);
          }
        }
        // Torch sconces on the upper wall.
        if (i % 12 === 3) {
          const f = 0.6 + 0.4 * Math.sin(t * 13 + i);
          px(x + 3, 4 * TILE + 2, 2, 5, "#6b4426");
          px(x + 2, 4 * TILE - 2, 4, 4, f > 0.7 ? C.gold : C.torch);
          px(x + 3, 4 * TILE - 4, 2, 2, C.ember);
          ctx.globalAlpha = 0.18 * f;
          px(x - 10, 3 * TILE - 4, 28, 26, C.torch);
          ctx.globalAlpha = 1;
        }
        const feat = feature(i);
        const fy = FLOOR_TOP + 2 * TILE;
        if (feat === "spike" && spikeUp(i, t)) {
          for (const sx of [1, 4]) {
            px(x + sx, fy + 2, 2, 5, C.steel);
            px(x + sx, fy + 1, 2, 1, "#ffffff");
          }
        } else if (feat === "spike") {
          px(x + 1, fy + 6, 6, 1, "#5a4a3c");
        } else if (feat === "jet") {
          px(x + 1, fy + 6, 6, 2, "#4b3a2c");
          if (jetOn(i, t)) {
            const h = 8 + Math.round(3 * Math.sin(t * 20 + i));
            px(x + 2, fy + 6 - h, 4, h, C.ember);
            px(x + 3, fy + 6 - h + 2, 2, h - 2, C.gold);
          }
        } else if (feat === "tele") {
          for (let s = 0; s < 6; s++) {
            const a = t * 3 + s;
            px(x + 3 + Math.cos(a) * 3, fy + 3 + Math.sin(a) * 2, 1, 1, s % 2 ? C.arcane : "#e2ccff");
          }
        } else if (feat === "exit") {
          px(x, FLOOR_TOP - TILE, TILE, FLOOR_ROWS * TILE + TILE, "#5a3a12");
          px(x + 1, FLOOR_TOP - TILE + 1, TILE - 2, FLOOR_ROWS * TILE + TILE - 2, C.gold);
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4);
          px(x - 6, FLOOR_TOP - 2 * TILE, TILE + 12, FLOOR_ROWS * TILE + 3 * TILE, C.gold);
          ctx.globalAlpha = 1;
        }
      }

      // The raider walks at a fixed screen position while the corridor scrolls past.
      const rx = Math.round(W * 0.32);
      const col = Math.floor((cam + rx + 4) / TILE);
      if (col !== lastCol && !reduced) {
        lastCol = col;
        const feat = feature(col);
        if (t >= respawnAt) {
          if ((feat === "spike" && spikeUp(col, t) && col % 3 === 1) || (feat === "jet" && jetOn(col, t) && col % 2 === 0)) {
            marks.push({ x: col * TILE, until: t + 6, kind: "skull" });
            respawnAt = t + 1.4;
          } else if (feat === "tele") {
            marks.push({ x: col * TILE, until: t + 0.8, kind: "swirl" });
          } else if (feat === "exit") {
            marks.push({ x: col * TILE, until: t + 1.2, kind: "burst" });
          }
        }
      }
      const ry = FLOOR_TOP + 2 * TILE - 2;
      if (t >= respawnAt || reduced) {
        const bob = Math.round(Math.sin(t * 12));
        const step = Math.floor(t * 8) % 2;
        px(rx + 1, ry - 7 + bob, 6, 3, C.hood);
        px(rx + 2, ry - 4 + bob, 4, 3, C.skin);
        px(rx + 2, ry - 3 + bob, 1, 1, C.void);
        px(rx + 5, ry - 3 + bob, 1, 1, C.void);
        px(rx + 1, ry - 1 + bob, 6, 4, C.hood);
        px(rx + 1 + step, ry + 3, 2, 2, C.hood);
        px(rx + 5 - step, ry + 3, 2, 2, C.hood);
        px(rx + 7, ry - 6 + bob, 1, 5, "#6b4426");
        px(rx + 7, ry - 8 + bob, 2, 2, Math.sin(t * 17) > 0 ? C.gold : C.torch);
      } else if (t < respawnAt - 1.0) {
        ctx.globalAlpha = 0.35;
        px(0, 0, W, H, C.blood);
        ctx.globalAlpha = 1;
      }

      for (let m = marks.length - 1; m >= 0; m--) {
        const mk = marks[m];
        if (t > mk.until) {
          marks.splice(m, 1);
          continue;
        }
        const x = mk.x - cam;
        if (mk.kind === "skull") {
          px(x + 1, ry - 2, 6, 4, C.skin);
          px(x + 2, ry - 1, 1, 1, C.void);
          px(x + 5, ry - 1, 1, 1, C.void);
          px(x + 2, ry + 2, 4, 1, C.skin);
        } else if (mk.kind === "burst") {
          const age = 1.2 - (mk.until - t);
          for (let s = 0; s < 10; s++) {
            const a = (s / 10) * Math.PI * 2;
            px(x + 4 + Math.cos(a) * age * 18, ry + Math.sin(a) * age * 14, 2, 2, C.gold);
          }
        } else {
          const age = 0.8 - (mk.until - t);
          px(x + 4 - age * 8, ry - age * 6, 2, 2, C.arcane);
          px(x + 4 + age * 8, ry - age * 4, 2, 2, "#e2ccff");
        }
      }
    };

    if (reduced) {
      draw(9.3); // one representative still frame
      const onResize = () => (resize(), draw(9.3));
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let raf = 0;
    let last = 0;
    let clock = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = now - last;
      if (dt < 1000 / FPS - 1) return;
      clock += Math.min(dt, 100) / 1000; // don't jump after a pause
      last = now;
      draw(clock);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    start();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className={`${styles.backdrop} pixel`} aria-hidden="true" />;
}
