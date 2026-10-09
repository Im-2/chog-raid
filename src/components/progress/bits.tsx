"use client";

import { useEffect, useState } from "react";
import styles from "./progress.module.css";

export type BadgeT = { season: number; board: "raider" | "warden"; place: number };

/** Live "2d 04:12:09" countdown to an ISO time. */
export function Countdown({ to, prefix }: { to: string; prefix?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="num">--:--:--</span>;
  const s = Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, "0")).join(":");
  return (
    <span className="num" suppressHydrationWarning>
      {prefix}
      {d > 0 ? `${d}d ` : ""}
      {hms}
    </span>
  );
}

const PLACE = ["", "gold", "silver", "bronze"];

/** Season medals: place + board, e.g. "S3 #1 Raider". */
export function Badges({ badges, max = 4 }: { badges: BadgeT[]; max?: number }) {
  if (!badges?.length) return null;
  const shown = [...badges].sort((a, b) => b.season - a.season || a.place - b.place).slice(0, max);
  return (
    <span className={styles.badges}>
      {shown.map((b) => (
        <span
          key={`${b.season}-${b.board}-${b.place}`}
          className={styles.badge}
          data-place={PLACE[b.place]}
          title={`Season ${b.season + 1} · #${b.place} ${b.board === "raider" ? "Raider" : "Warden"}`}
        >
          <i aria-hidden>{b.board === "raider" ? "⚔" : "🛡"}</i>
          <span className="num">S{b.season + 1}</span>
        </span>
      ))}
    </span>
  );
}

/** Pixel flame + day count. */
export function Streak({ days, label = "day streak", hot }: { days: number; label?: string; hot?: boolean }) {
  return (
    <span className={styles.streak} data-hot={hot || days > 0 || undefined} title={`${days} ${label}`}>
      <i className={styles.flame} aria-hidden />
      <b className="num">{days}</b>
      <span className={styles.streakLabel}>{label}</span>
    </span>
  );
}

export type Player = {
  id: string;
  label: string;
  isWallet: boolean;
  season: { index: number; endsAt: string };
  raider: { points: number; rank: number | null; allTime: number };
  warden: { points: number; rank: number | null; allTime: number };
  streak: { current: number; best: number; activeToday: boolean };
  bestDaysHeld: number;
  rooms: { tokenId: number; traps: number; daysHeld: number }[];
  badges: BadgeT[];
};

// Shared player state; refreshed after raids and alert reads.
let cache: { player: Player | null; unread: number } | null = null;
const subs = new Set<(v: typeof cache) => void>();
let inflight: Promise<void> | null = null;

export function refreshPlayer() {
  inflight ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      cache = { player: j.player, unread: j.unread ?? 0 };
      subs.forEach((s) => s(cache));
    })
    .catch(() => {})
    .finally(() => (inflight = null));
  return inflight;
}

export function usePlayer() {
  const [v, setV] = useState(cache);
  useEffect(() => {
    subs.add(setV);
    if (!cache) void refreshPlayer();
    return () => void subs.delete(setV);
  }, []);
  return v;
}
