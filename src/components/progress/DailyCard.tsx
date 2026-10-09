"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Countdown } from "./bits";
import { ChogPool, type ChogState } from "./ChogPool";
import styles from "./daily.module.css";

type Daily = {
  day: string;
  tokenId: number;
  endsAt: string;
  bonus: number;
  board: { place: number; label: string; moves: number; me: boolean }[];
};
type Season = { season: number; endsAt: string; daily: Daily };

/** Today's featured room, its board, the season countdown and (if enabled) the $CHOG pool. */
export function DailyCard() {
  const [data, setData] = useState<Season | null | "error">(null);
  const [chog, setChog] = useState<ChogState | null>(null);

  useEffect(() => {
    fetch("/api/season", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData("error"));
    fetch("/api/chog", { cache: "no-store" })
      .then((r) => r.json())
      .then(setChog)
      .catch(() => {});
  }, []);

  if (data === "error") return null;
  if (!data) return <div className={`${styles.card} skeleton`} style={{ minHeight: 180 }} aria-hidden />;
  const d = data.daily;

  return (
    <section className={styles.card} aria-labelledby="daily-title">
      <Link href={`/room/${d.tokenId}`} className={styles.art}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/chogs/${d.tokenId}/image?s=256`} alt={`Chog #${d.tokenId}`} className="pixel" />
      </Link>
      <div className={styles.body}>
        <p className={styles.kicker}>
          Daily raid · ends in <Countdown to={d.endsAt} />
        </p>
        <h2 id="daily-title" className={styles.title}>
          Chog <span className="num">#{d.tokenId}</span>
        </h2>
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          Same room for everyone today. Clear it for <b style={{ color: "var(--gold)" }}>+{d.bonus}</b> bonus points.
        </p>
        {d.board.length > 0 ? (
          <ol className={styles.board}>
            {d.board.slice(0, 3).map((e) => (
              <li key={e.place} data-me={e.me || undefined}>
                <span className="num">{e.place}</span> {e.label} <b className="num">{e.moves}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small" style={{ margin: "0 0 10px", color: "var(--torch)" }}>
            No clears yet today. Take first place.
          </p>
        )}
        <div className={styles.actions}>
          <Link href={`/room/${d.tokenId}`} className="btn primary">
            Raid today&apos;s room
          </Link>
          <Link href="/leaderboards" className="btn">
            Season {data.season + 1} · <Countdown to={data.endsAt} />
          </Link>
        </div>
        {chog?.enabled && <ChogPool state={chog} />}
      </div>
    </section>
  );
}
