"use client";

import { useEffect, useRef } from "react";

// Pixel embers that trail the mouse while it moves, rising and fading like a torch flame.
// Mouse only (touch screens have no cursor and phones stay fast), off for reduced motion,
// and the animation loop only runs while embers are alive, so an idle page costs nothing.

type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };

const COLORS = ["#fff3c4", "#ffd166", "#ffb347", "#ff7a2f", "#e5484d"];
const MAX_EMBERS = 90;

export function FireCursor() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Turn on at the first real mouse movement: touch never produces one, and media queries
    // misreport touchscreen laptops that also have a trackpad.
    let on = false;
    const embers: Ember[] = [];
    let raf = 0;
    let last = 0;
    let lastX = -1;
    let lastY = -1;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life += dt;
        if (e.life >= e.max) {
          embers.splice(i, 1);
          continue;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy -= 60 * dt; // heat rises
        const k = e.life / e.max;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = COLORS[Math.min(COLORS.length - 1, Math.floor(k * COLORS.length))];
        const s = Math.max(1, Math.round(e.size * (1 - k * 0.6)));
        ctx.fillRect(Math.round(e.x), Math.round(e.y), s, s);
      }
      ctx.globalAlpha = 1;
      raf = embers.length ? requestAnimationFrame(frame) : 0;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return;
      if (!on) {
        on = true;
        document.documentElement.dataset.fireCursor = "";
      }
      const dist = lastX < 0 ? 0 : Math.hypot(ev.clientX - lastX, ev.clientY - lastY);
      lastX = ev.clientX;
      lastY = ev.clientY;
      const n = Math.min(4, 1 + Math.floor(dist / 8));
      for (let i = 0; i < n && embers.length < MAX_EMBERS; i++) {
        embers.push({
          x: ev.clientX - 2 + (Math.random() - 0.5) * 6,
          y: ev.clientY - 4 + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 30,
          vy: -30 - Math.random() * 50,
          life: 0,
          max: 0.35 + Math.random() * 0.35,
          size: 3 + Math.floor(Math.random() * 3),
        });
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      delete document.documentElement.dataset.fireCursor;
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 9999 }}
    />
  );
}
