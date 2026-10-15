"use client";

import { difficultyFor } from "@/lib/difficulty";
import { DifficultyBadge } from "../ui/DifficultyBadge";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { chogName, tokenIdForNumber } from "@/lib/names";
import { Atlas, CELL, COLS, PULSE_MS, TILE, timeAgo, type AtlasData, type Category } from "./model";
import { Badges, type BadgeT } from "../progress/bits";
import styles from "./atlas.module.css";

const POLL_MS = 15000;
const MAX_LOADS = 6;
const ART_MIN_PX = 56;

const CATS: { id: Category; label: string; color: string }[] = [
  { id: "recent", label: "Recently raided", color: "#ffb347" },
  { id: "heavy", label: "Heavily raided", color: "#e5484d" },
  { id: "open", label: "Open (undefended)", color: "#7fd28c" },
  { id: "defended", label: "Defended", color: "#d8d2c6" },
  { id: "cleared", label: "Cleared by me", color: "#ffd166" },
];
const CAT_COLOR = Object.fromEntries(CATS.map((c) => [c.id, c.color])) as Record<Category, string>;

type Cam = { x: number; y: number; s: number };
type Thumb = { img: HTMLImageElement; size: number; ok: boolean };

export function AtlasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const atlas = useRef(new Atlas());
  const cam = useRef<Cam>({ x: 0, y: 0, s: 0.2 });
  const dirty = useRef(true);
  const pulses = useRef(new Map<number, number>()); // tokenId -> pulse start (ms)
  const thumbs = useRef(new Map<string, Thumb>());
  const loading = useRef(0);
  const hoverRef = useRef<number | null>(null);
  const filterRef = useRef<Set<Category>>(new Set());
  const selectedRef = useRef<number | null>(null);

  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<Set<Category>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [find, setFind] = useState("");
  const [badges, setBadges] = useState<BadgeT[]>([]);

  // Defender badges for the selected room.
  useEffect(() => {
    setBadges([]);
    if (!selected) return;
    let cancelled = false;
    fetch(`/api/rooms/${selected}/stats`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && j && setBadges(j.defenderBadges ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected]);

  filterRef.current = filters;
  selectedRef.current = selected;

  // ---- data + live polling ----
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/atlas", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as AtlasData;
      const prev = atlas.current.states;
      const first = prev.size === 0 && atlas.current.supply === 0;
      atlas.current.update(d);
      // Rooms raided since the last poll pulse; on first load, pulse anything from the last 2 minutes.
      for (const [id, , , last] of d.rooms) {
        const before = prev.get(id)?.last ?? 0;
        if ((first && d.now - last < 120_000) || (!first && last > before)) pulses.current.set(id, performance.now());
      }
      setData(d);
      setError(false);
      dirty.current = true;
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => !document.hidden && void load(), POLL_MS);
    const c = setInterval(() => setNow(Date.now()), 30000);
    const onVisible = () => !document.hidden && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      clearInterval(c);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // ---- camera helpers ----
  const fit = useCallback(() => {
    const el = canvasRef.current;
    if (!el || !atlas.current.supply) return;
    const { w, h } = atlas.current.worldSize();
    const s = Math.min(el.clientWidth / w, el.clientHeight / h) * 0.96;
    cam.current = { s, x: (w - el.clientWidth / s) / 2, y: (h - el.clientHeight / s) / 2 };
    dirty.current = true;
  }, []);

  const clampCam = () => {
    const el = canvasRef.current!;
    const { w, h } = atlas.current.worldSize();
    const c = cam.current;
    const vw = el.clientWidth / c.s;
    const vh = el.clientHeight / c.s;
    c.x = vw > w ? (w - vw) / 2 : Math.min(Math.max(c.x, -CELL), w - vw + CELL);
    c.y = vh > h ? (h - vh) / 2 : Math.min(Math.max(c.y, -CELL), h - vh + CELL);
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const el = canvasRef.current!;
    const { w, h } = atlas.current.worldSize();
    const minS = Math.min(el.clientWidth / w, el.clientHeight / h) * 0.6;
    const c = cam.current;
    const ns = Math.min(4, Math.max(minS, c.s * factor));
    const wx = c.x + sx / c.s;
    const wy = c.y + sy / c.s;
    c.s = ns;
    c.x = wx - sx / ns;
    c.y = wy - sy / ns;
    clampCam();
    dirty.current = true;
  };

  const flyTo = useCallback((id: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const p = atlas.current.pos(id);
    const s = Math.max(cam.current.s, 1.6);
    cam.current = { s, x: p.x + TILE / 2 - el.clientWidth / 2 / s, y: p.y + TILE / 2 - el.clientHeight / 2 / s };
    clampCam();
    pulses.current.set(id, performance.now());
    dirty.current = true;
  }, []);

  useEffect(() => {
    if (data && cam.current.s === 0.2) fit();
  }, [data, fit]);

  // ---- render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const mini = miniRef.current;
    const ctx = canvas?.getContext("2d");
    const mctx = mini?.getContext("2d");
    if (!canvas || !ctx || !mini || !mctx) return;
    let raf = 0;

    // Art streams in only when tiles are big enough to read (~150 visible at most), one size per room.
    const thumbFor = (id: number, px: number): Thumb | null => {
      const size = px <= 72 ? 48 : 128;
      const key = `${id}:${size}`;
      const got = thumbs.current.get(key);
      if (got) return got.ok ? got : (thumbs.current.get(`${id}:48`)?.ok ? thumbs.current.get(`${id}:48`)! : null);
      if (loading.current < MAX_LOADS) {
        loading.current++;
        const img = new Image();
        const t: Thumb = { img, size, ok: false };
        thumbs.current.set(key, t);
        img.onload = () => {
          t.ok = true;
          loading.current--;
          dirty.current = true;
        };
        img.onerror = () => {
          loading.current--;
          thumbs.current.delete(key); // retry later
        };
        img.src = `/api/chogs/${id}/image?s=${size}`;
      }
      const small = thumbs.current.get(`${id}:48`);
      return small?.ok ? small : null;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = performance.now();
      const pulsing = [...pulses.current].some(([, s]) => t - s < PULSE_MS);
      if (!dirty.current && !pulsing) return;
      dirty.current = false;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#0b0806";
      ctx.fillRect(0, 0, cw, ch);

      const A = atlas.current;
      if (!A.supply) return;
      const c = cam.current;
      const nowMs = Date.now();
      const f = filterRef.current;
      const tilePx = TILE * c.s;
      const col0 = Math.max(0, Math.floor(c.x / CELL));
      const col1 = Math.min(COLS - 1, Math.floor((c.x + cw / c.s) / CELL));
      const row0 = Math.max(0, Math.floor(c.y / CELL));
      const row1 = Math.min(A.rows - 1, Math.floor((c.y + ch / c.s) / CELL));

      for (let row = row0; row <= row1; row++) {
        for (let col = col0; col <= col1; col++) {
          const id = row * COLS + col + 1;
          if (id > A.supply) continue;
          const p = A.pos(id);
          const x = (p.x - c.x) * c.s;
          const y = (p.y - c.y) * c.s;
          const s = A.state(id);
          const cats = CATS.filter((k) => A.is(id, k.id, nowMs)).map((k) => k.id);
          const match = f.size === 0 || cats.some((k) => f.has(k));

          // Art when it's big enough to read; otherwise a stone tile tinted by state.
          const thumb = match && (tilePx >= ART_MIN_PX || thumbs.current.get(`${id}:48`)?.ok) ? thumbFor(id, tilePx * Math.min(2, dpr)) : null;
          if (thumb) {
            ctx.drawImage(thumb.img, x, y, tilePx, tilePx);
          } else {
            ctx.fillStyle = s.raids ? "#3a2a1e" : "#241a13";
            ctx.fillRect(x, y, tilePx, tilePx);
          }

          const lw = Math.max(1, tilePx / 20);
          if (cats.includes("heavy")) {
            ctx.fillStyle = `rgba(229,72,77,${Math.min(0.45, 0.15 + s.raids / (A.heavyAt * 6))})`;
            ctx.fillRect(x, y, tilePx, tilePx);
          }
          if (cats.includes("defended")) {
            ctx.strokeStyle = CAT_COLOR.defended;
            ctx.lineWidth = lw;
            ctx.strokeRect(x + lw / 2, y + lw / 2, tilePx - lw, tilePx - lw);
          } else if (tilePx >= 16 || f.has("open")) {
            // Open room: a green "gate open" notch in the corner (always shown when filtering for open rooms).
            ctx.fillStyle = CAT_COLOR.open;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + tilePx * 0.28, y);
            ctx.lineTo(x, y + tilePx * 0.28);
            ctx.fill();
          }
          if (cats.includes("recent")) {
            ctx.strokeStyle = CAT_COLOR.recent;
            ctx.lineWidth = lw * 1.6;
            ctx.strokeRect(x - lw, y - lw, tilePx + lw * 2, tilePx + lw * 2);
          }
          if (cats.includes("cleared") && tilePx >= 8) {
            const r = Math.max(3, tilePx * 0.16);
            ctx.fillStyle = CAT_COLOR.cleared;
            ctx.fillRect(x + tilePx - r * 2, y + tilePx - r * 2, r * 2, r * 2);
            if (tilePx >= 30) {
              ctx.strokeStyle = "#2a1505";
              ctx.lineWidth = Math.max(1.5, r / 3);
              ctx.beginPath();
              ctx.moveTo(x + tilePx - r * 1.6, y + tilePx - r);
              ctx.lineTo(x + tilePx - r * 1.1, y + tilePx - r * 0.5);
              ctx.lineTo(x + tilePx - r * 0.4, y + tilePx - r * 1.5);
              ctx.stroke();
            }
          }
          if (!match) {
            ctx.fillStyle = "rgba(11,8,6,0.78)";
            ctx.fillRect(x - 1, y - 1, tilePx + 2, tilePx + 2);
          }

          const ps = pulses.current.get(id);
          if (ps !== undefined) {
            const k = (t - ps) / PULSE_MS;
            if (k < 1) {
              const grow = tilePx * (0.1 + 0.6 * k);
              ctx.strokeStyle = `rgba(255,179,71,${1 - k})`;
              ctx.lineWidth = Math.max(2, tilePx / 12);
              ctx.strokeRect(x - grow, y - grow, tilePx + grow * 2, tilePx + grow * 2);
            } else pulses.current.delete(id);
          }
          if (id === hoverRef.current || id === selectedRef.current) {
            ctx.strokeStyle = id === selectedRef.current ? "#ffb347" : "#f4e7d0";
            ctx.lineWidth = Math.max(2, tilePx / 16);
            ctx.strokeRect(x - 2, y - 2, tilePx + 4, tilePx + 4);
          }
        }
      }

      // Minimap: every room as a dot, plus the viewport.
      const mw = mini.width;
      const mh = mini.height;
      const ms = Math.min(mw / (COLS * CELL), mh / (A.rows * CELL));
      mctx.fillStyle = "#0b0806";
      mctx.fillRect(0, 0, mw, mh);
      for (let id = 1; id <= A.supply; id++) {
        const p = A.pos(id);
        const cats = CATS.filter((k) => k.id !== "open" && A.is(id, k.id, nowMs));
        const match = f.size === 0 || CATS.some((k) => f.has(k.id) && A.is(id, k.id, nowMs));
        mctx.fillStyle = !match ? "#1a130e" : cats.length ? CAT_COLOR[cats[0].id] : "#3a2a1e";
        mctx.fillRect(p.x * ms, p.y * ms, Math.max(1, TILE * ms), Math.max(1, TILE * ms));
      }
      mctx.strokeStyle = "#ffb347";
      mctx.lineWidth = 1.5;
      mctx.strokeRect(c.x * ms, c.y * ms, (cw / c.s) * ms, (ch / c.s) * ms);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => {
      clampCam();
      dirty.current = true;
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    dirty.current = true;
  }, [filters, selected, data]);

  // ---- input: drag to pan, wheel / pinch to zoom, tap to select ----
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch: number | null = null;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const roomAt = (sx: number, sy: number) => atlas.current.at(cam.current.x + sx / cam.current.s, cam.current.y + sy / cam.current.s);

    const down = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      pts.set(e.pointerId, local(e));
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const prev = pts.get(e.pointerId);
      if (!prev) {
        const id = roomAt(p.x, p.y);
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          dirty.current = true;
        }
        setHover(id ? { id, x: p.x, y: p.y } : null);
        return;
      }
      pts.set(e.pointerId, p);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        moved += 10;
        return;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.current.x -= dx / cam.current.s;
      cam.current.y -= dy / cam.current.s;
      clampCam();
      dirty.current = true;
      setHover(null);
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (moved < 6 && pts.size === 0) {
        const id = roomAt(p.x, p.y);
        setSelected(id);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    };
    const leave = () => {
      hoverRef.current = null;
      setHover(null);
      dirty.current = true;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  // Minimap: tap or drag to jump there.
  const jumpMini = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointermove" && e.buttons === 0) return;
    const m = e.currentTarget;
    const r = m.getBoundingClientRect();
    const A = atlas.current;
    const ms = Math.min(m.width / (COLS * CELL), m.height / (A.rows * CELL));
    const wx = ((e.clientX - r.left) * (m.width / r.width)) / ms;
    const wy = ((e.clientY - r.top) * (m.height / r.height)) / ms;
    const el = canvasRef.current!;
    cam.current.x = wx - el.clientWidth / 2 / cam.current.s;
    cam.current.y = wy - el.clientHeight / 2 / cam.current.s;
    clampCam();
    dirty.current = true;
  };

  const toggle = (c: Category) =>
    setFilters((f) => {
      const n = new Set(f);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const counts = data
    ? Object.fromEntries(CATS.map((c) => [c.id, Array.from({ length: data.supply }, (_, i) => i + 1).filter((id) => atlas.current.is(id, c.id, now)).length]))
    : null;
  const sel = selected ? atlas.current.state(selected) : null;

  return (
    <div className={styles.layout}>
      <div className={styles.mapWrap} ref={wrapRef}>
        <canvas ref={canvasRef} className={styles.map} aria-label="Atlas of every Chog room. Drag to pan, scroll or pinch to zoom, tap a room to preview it." role="img" />
        {!data && !error && <div className={styles.state}>Mapping the dungeon…</div>}
        {error && !data && (
          <div className={styles.state}>
            <p>Couldn&apos;t load the Atlas.</p>
            <button className="btn primary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        <div className={styles.zoom}>
          <button className="btn icon" aria-label="Zoom in" onClick={() => zoomAt(canvasRef.current!.clientWidth / 2, canvasRef.current!.clientHeight / 2, 1.5)}>
            +
          </button>
          <button className="btn icon" aria-label="Zoom out" onClick={() => zoomAt(canvasRef.current!.clientWidth / 2, canvasRef.current!.clientHeight / 2, 1 / 1.5)}>
            −
          </button>
          <button className="btn icon" aria-label="Show the whole map" onClick={fit}>
            ⤢
          </button>
        </div>

        <canvas
          ref={miniRef}
          width={180}
          height={176}
          className={styles.minimap}
          aria-label="Minimap: tap to jump"
          onPointerDown={jumpMini}
          onPointerMove={jumpMini}
        />

        {hover && !selected && (
          <div className={styles.tooltip} style={{ left: hover.x + 14, top: hover.y + 14 }}>
            <b className="num">{chogName(hover.id)}</b>
            {atlas.current.state(hover.id).raids > 0 && <span> · {atlas.current.state(hover.id).raids} raids</span>}
          </div>
        )}

        {selected && sel && (
          <div className={styles.preview} role="dialog" aria-label={chogName(selected)}>
            <button className={styles.close} onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/chogs/${selected}/image?s=256`} alt="" width={96} height={96} className="pixel" />
            <div>
              <h2 className="num">{chogName(selected)}</h2>
              <DifficultyBadge d={difficultyFor(selected)} />
              <p className="small" style={{ color: sel.defender ? "var(--steel, #d8d2c6)" : "var(--moss)" }}>
                {sel.defender ? `Defended by ${sel.defender}` : "Open: no defender, practice traps"} <Badges badges={badges} max={3} />
              </p>
              <dl className={styles.stats}>
                <div>
                  <dt>Raids</dt>
                  <dd className="num">{sel.raids}</dd>
                </div>
                <div>
                  <dt>Breach rate</dt>
                  <dd className="num">{sel.raids ? `${Math.round((sel.breaches / sel.raids) * 100)}%` : "—"}</dd>
                </div>
                <div>
                  <dt>Last raid</dt>
                  <dd>{sel.last ? timeAgo(now - sel.last) : "never"}</dd>
                </div>
              </dl>
              {sel.cleared && <p className="small" style={{ color: "var(--gold)" }}>✓ You cleared this room</p>}
              <div className={styles.actions}>
                <Link className="btn primary" href={`/room/${selected}`}>
                  Raid
                </Link>
                <Link className="btn" href={`/room/${selected}/defend`}>
                  Defend
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className={styles.side}>
        <form
          className={styles.find}
          onSubmit={(e) => {
            e.preventDefault();
            const id = tokenIdForNumber(find);
            if (id && id <= (data?.supply ?? 0)) {
              flyTo(id);
              setSelected(id);
            }
          }}
        >
          <input type="search" inputMode="numeric" placeholder="Find CHOG #" aria-label="Find a Chog by its number" value={find} onChange={(e) => setFind(e.target.value.replace(/[^\d]/g, ""))} />
          <button className="btn" type="submit">
            Go
          </button>
        </form>

        <section>
          <h3 className={styles.h3}>Legend · tap to filter</h3>
          <ul className={styles.legend}>
            {CATS.map((c) => (
              <li key={c.id}>
                <button aria-pressed={filters.has(c.id)} onClick={() => toggle(c.id)} className={styles.chip}>
                  <i style={{ background: c.color }} />
                  <span>{c.label}</span>
                  <b className="num">{counts?.[c.id] ?? "…"}</b>
                </button>
              </li>
            ))}
          </ul>
          {filters.size > 0 && (
            <button className={styles.clear} onClick={() => setFilters(new Set())}>
              Show all rooms
            </button>
          )}
        </section>

        <section>
          <h3 className={styles.h3}>
            Live activity <i className={styles.live} aria-hidden />
          </h3>
          {data && data.recent.length === 0 && <p className="small muted">No raids yet. The map lights up as rooms get raided.</p>}
          <ul className={styles.feed} aria-live="polite">
            {data?.recent.map((r, i) => (
              <li key={`${r.tokenId}-${r.at}-${i}`}>
                <button
                  onClick={() => {
                    flyTo(r.tokenId);
                    setSelected(r.tokenId);
                  }}
                >
                  <i data-status={r.status} aria-hidden />
                  <span>
                    <b className="num">{chogName(r.tokenId)}</b>{" "}
                    {r.status === "breach" ? "was breached" : r.status === "defeated" ? "held: raider defeated" : "held: raider ran out of moves"}
                    <small> · {timeAgo(now - Date.parse(r.at))}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
