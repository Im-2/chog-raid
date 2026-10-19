"use client";

import { chogName } from "@/lib/names";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../wallet/session";
import { refreshPlayer, usePlayer } from "./bits";
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

/** Raid alerts inside the wallet menu: a row with the unread count that expands into the list. */
export function MenuAlerts({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertT[] | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/alerts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setAlerts(j.alerts);
        if (j.alerts.some((a: AlertT) => a.unread)) void fetch("/api/alerts", { method: "POST" }).then(() => refreshPlayer());
      })
      .catch(() => setAlerts([]));
  }, [open]);

  return (
    <>
      <button role="menuitem" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Raid alerts {unread > 0 && <span className={`${styles.menuCount} num`}>{unread > 9 ? "9+" : unread}</span>}
        </span>
      </button>
      {open && <div className={styles.menuAlerts}>{alerts ? <AlertList alerts={alerts} /> : <p className="small">Loading…</p>}</div>}
    </>
  );
}

/**
 * Keeps the player's progress fresh (polls for raids on your Chogs) and shows the "new raid" toast.
 * The streak and alerts themselves live in the wallet menu.
 */
export function NavChips() {
  const session = useSession();
  const me = usePlayer();
  const [toast, setToast] = useState<string | null>(null);
  const lastUnread = useRef<number | null>(null);

  // Live alerts: poll while the tab is visible; toast when a new raid hits one of your Chogs.
  useEffect(() => {
    void refreshPlayer();
    if (!session.address) return;
    const t = setInterval(() => !document.hidden && void refreshPlayer(), 30000);
    return () => clearInterval(t);
  }, [session.address]);
  useEffect(() => {
    const u = me?.unread ?? 0;
    if (lastUnread.current !== null && u > lastUnread.current) {
      setToast(u - lastUnread.current === 1 ? "Someone just raided your Chog!" : `${u - lastUnread.current} new raids on your Chogs!`);
      const t = setTimeout(() => setToast(null), 6000);
      lastUnread.current = u;
      return () => clearTimeout(t);
    }
    lastUnread.current = u;
  }, [me?.unread]);
  return toast ? (
    <span className={styles.chips}>
      <span className={styles.toast} role="status">
        {toast} <Link href="/defend">See it</Link>
      </span>
    </span>
  ) : null;
}
