"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { chogName, chogTitle } from "@/lib/names";
import { Countdown } from "./bits";
import { ChogIcon } from "../chog/ChogIcon";
import { PayWithChog } from "../chog/PayWithChog";
import { useChog } from "../chog/useChog";
import chogStyles from "../chog/chog.module.css";
import styles from "./daily.module.css";

type Daily = {
  day: string;
  tokenId: number;
  endsAt: string;
  bonus: number;
  board: { place: number; label: string; moves: number; me: boolean }[];
};
type Season = { season: number; endsAt: string; daily: Daily };

/** Today's featured room, pinned to the dungeon notice board like a wanted poster. */
export function DailyCard() {
  const [data, setData] = useState<Season | null | "error">(null);
  const { chog } = useChog();

  useEffect(() => {
    fetch("/api/season", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData("error"));
  }, []);

  if (data === "error") return null;
  if (!data)
    return (
      <div className={styles.board} aria-hidden>
        <div className={`${styles.poster} ${styles.posterLoading}`}>
          <div className="skeleton" style={{ aspectRatio: "1", width: "100%" }} />
        </div>
      </div>
    );
  const d = data.daily;
  const name = chogName(d.tokenId);
  const title = chogTitle(d.tokenId);

  return (
    <div className={styles.board}>
      <i className={styles.nail} data-pos="tl" aria-hidden />
      <i className={styles.nail} data-pos="tr" aria-hidden />
      <section className={styles.poster} aria-labelledby="daily-title">
        <p className={styles.stamp}>Daily raid</p>
        <Link href={`/room/${d.tokenId}`} className={styles.art} aria-label={`Raid ${name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/chogs/${d.tokenId}/image?s=256`} alt={name} className="pixel" width={256} height={256} />
        </Link>
        <h2 id="daily-title" className={styles.name}>
          <span className="num">{name.replace(/\s*—.*$/, "")}</span>
          {title && <small>{title}</small>}
        </h2>
        <dl className={styles.terms}>
          <div>
            <dt>Reward</dt>
            <dd className="num">+{d.bonus} pts</dd>
          </div>
          <div>
            <dt>Ends in</dt>
            <dd>
              <Countdown to={d.endsAt} />
            </dd>
          </div>
        </dl>
        <div className={chogStyles.raidRow}>
          <Link href={`/room/${d.tokenId}`} className={`btn primary ${styles.raid}`}>
            Raid today&apos;s room
          </Link>
          {chog?.payment && <PayWithChog chog={chog} />}
        </div>
        {chog?.payment && (
          <p className={chogStyles.optional}>
            Optional: pay {chog.payment.amount} $CHOG for a bonus attempt.
          </p>
        )}
        {chog && (
          <p className={chogStyles.attempts}>
            Counted attempts today: <b className="num">{Math.min(chog.attempts.used, chog.attempts.allowed)}</b> of{" "}
            <b className="num">{chog.attempts.allowed}</b>
            {chog.effects.badge && (
              <span className={chogStyles.holderTag}>
                <ChogIcon size={11} /> $CHOG holder
              </span>
            )}
          </p>
        )}
        {d.board.length > 0 ? (
          <ol className={styles.top}>
            {d.board.slice(0, 3).map((e) => (
              <li key={e.place} data-me={e.me || undefined}>
                <span className="num">{e.place}.</span> {e.label} <b className="num">{e.moves}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.first}>No one has cleared it today. Take first place.</p>
        )}
        <Link href="/leaderboards" className={styles.season}>
          Season {data.season + 1} ends in <Countdown to={data.endsAt} /> →
        </Link>
      </section>
    </div>
  );
}
