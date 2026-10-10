"use client";

import { chogName } from "@/lib/names";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../wallet/session";
import { refreshPlayer, Streak, usePlayer } from "./bits";
import styles from "./progress.module.css";

export type AlertT = {
  raidId: string;
  tokenId: number;
  raider: string;
  outcome: "breach" | "defeated" | "out_of_moves";
  moves: number;
  at: string;
  unread: boolean;
  points: number;
};

export function AlertList({ alerts, onNavigate }: { alerts: AlertT[]; onNavigate?: () => void }) {
  if (!alerts.length) return <p className={`small ${styles.muted}`}>No raids on your Chogs yet. Defend a room, then send a friend in.</p>;
  return (
    <ul className={styles.alerts}>
      {alerts.map((a) => {
        const breach = a.outcome === "breach";
        return (
          <li key={a.raidId} className={styles.alert} data-outcome={breach ? "breach" : "held"} data-unread={a.unread || undefined}>
            <p>
              <b>{a.raider}</b> {breach ? "broke into" : "failed in"} <b className="num">{chogName(a.tokenId)}</b>{" "}
              <span className={styles.muted}>
                · {a.moves} moves · {new Date(a.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
              </span>
            </p>
            {!breach && a.points > 0 && <p style={{ color: "var(--moss)" }}>+{a.points} Warden points</p>}
            <div className={styles.alertActions}>
              <Link className="btn" href={`/room/${a.tokenId}/defend?replay=${a.raidId}`} onClick={onNavigate}>
                Replay
              </Link>
              {breach && (
                <Link className="btn primary" href={`/room/${a.tokenId}/defend?nudge=1`} onClick={onNavigate}>
                  Defend again
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AlertBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertT[] | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/alerts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setAlerts(j.alerts);
        if (j.alerts.some((a: AlertT) => a.unread)) void fetch("/api/alerts", { method: "POST" }).then(() => refreshPlayer());
      })
      .catch(() => setAlerts([]));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <button className={styles.chip} onClick={() => setOpen((o) => !o)} aria-label={`Raid alerts${unread ? `, ${unread} new` : ""}`} aria-expanded={open}>
        <i className={styles.bell} aria-hidden />
        {unread > 0 && <span className={`${styles.count} num`}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Raid alerts">
          <h3>Raids on your Chogs</h3>
          {alerts ? <AlertList alerts={alerts} onNavigate={() => setOpen(false)} /> : <p className="small">Loading…</p>}
        </div>
      )}
    </span>
  );
}

/** Streak flame (links to your profile) and, for signed-in holders, the alert bell. */
export function NavChips() {
  const session = useSession();
  const me = usePlayer();
  useEffect(() => {
    void refreshPlayer();
  }, [session.address]);
  const p = me?.player;
  return (
    <span className={styles.chips}>
      {p && (
        <Link href={`/u/${encodeURIComponent(p.id)}`} className={styles.chip} title={`${p.streak.current}-day raid streak · your profile`}>
          <Streak days={p.streak.current} hot={p.streak.activeToday} />
        </Link>
      )}
      {session.address && <AlertBell unread={me?.unread ?? 0} />}
    </span>
  );
}
