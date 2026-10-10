"use client";

import { chogName } from "@/lib/names";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badges, Countdown, refreshPlayer, Streak, usePlayer } from "./bits";
import { AlertList, type AlertT } from "./NavChips";
import styles from "./warden.module.css";

/** Owner dashboard: Warden score, days held, raid streak, badges and the raid alert feed. */
export function WardenPanel() {
  const me = usePlayer();
  const [alerts, setAlerts] = useState<AlertT[] | null>(null);

  useEffect(() => {
    fetch("/api/alerts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setAlerts(j.alerts ?? []);
        if ((j.alerts ?? []).some((a: AlertT) => a.unread)) void fetch("/api/alerts", { method: "POST" }).then(() => refreshPlayer());
      })
      .catch(() => setAlerts([]));
  }, []);

  const p = me?.player;
  const breached = alerts?.find((a) => a.unread && a.outcome === "breach");

  return (
    <section className={styles.panel} aria-label="Warden dashboard">
      {breached && (
        <div className={styles.callout} role="alert">
          <p>
            <b>{breached.raider}</b> broke into <b className="num">{chogName(breached.tokenId)}</b>. See exactly where they got
            through and fix the gap.
          </p>
          <Link className="btn primary" href={`/room/${breached.tokenId}/defend?nudge=1`}>
            Defend again
          </Link>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.label}>Warden score</span>
          <b className="num">{p?.warden.points ?? 0}</b>
          <span className="small muted">{p?.warden.rank ? `#${p.warden.rank} this season` : "Season " + ((p?.season.index ?? 0) + 1)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Longest hold</span>
          <Streak days={p?.bestDaysHeld ?? 0} label="days held" hot={(p?.bestDaysHeld ?? 0) > 0} />
          <span className="small muted">Days without a breach</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Raid streak</span>
          <Streak days={p?.streak.current ?? 0} hot={p?.streak.activeToday} />
          <span className="small muted">{p?.streak.activeToday ? "Raided today ✓" : "Raid today to keep it"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Season ends</span>
          <b>{p ? <Countdown to={p.season.endsAt} /> : "…"}</b>
          {p && p.badges.length > 0 ? <Badges badges={p.badges} /> : <span className="small muted">Top 3 earn a badge</span>}
        </div>
      </div>

      <h2 className={styles.h2}>Raid alerts</h2>
      {alerts ? <AlertList alerts={alerts.slice(0, 8)} /> : <p className="small muted">Loading…</p>}
    </section>
  );
}
