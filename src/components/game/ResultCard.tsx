"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RaidResult } from "@/engine";
import { refreshPlayer, Streak } from "../progress/bits";
import { causeOfEnd } from "./describe";
import styles from "./game.module.css";

type Reward = {
  award: { points: number; parts: { label: string; points: number }[] } | null;
  streak: { current: number; best: number; activeToday: boolean };
  seasonPoints: number;
  rank: number | null;
};

export function ResultCard({
  result,
  movesUsed,
  tokenId,
  onAgain,
  practice,
  raidId,
}: {
  result: RaidResult;
  movesUsed: number;
  tokenId: number;
  onAgain: () => void;
  practice?: boolean;
  /** Server raid id: when set, points and streak are fetched for it. */
  raidId?: string | null;
}) {
  const won = result.outcome === "breach";
  const [reward, setReward] = useState<Reward | null>(null);

  useEffect(() => {
    if (!raidId) return;
    let cancelled = false;
    fetch(`/api/raids/${raidId}/reward`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setReward(j);
        void refreshPlayer();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [raidId]);

  return (
    <div className={styles.resultWrap}>
      <div className={styles.result} data-won={won || undefined} role="status">
        <p className={styles.resultKicker}>{practice ? "Practice room" : `Chog #${tokenId}`}</p>
        <h2 className={styles.resultTitle}>{won ? "BREACHED!" : result.outcome === "dead" ? "YOU DIED" : "OUT OF MOVES"}</h2>
        <p className={styles.resultCause}>{causeOfEnd(result)}</p>

        {reward && (
          <div className={styles.reward}>
            {reward.award ? (
              <>
                <p className={styles.rewardTotal}>
                  <b className="num">+{reward.award.points}</b> pts
                </p>
                <ul>
                  {reward.award.parts.map((p) => (
                    <li key={p.label}>
                      <span>{p.label}</span>
                      {p.points > 0 && <b className="num">+{p.points}</b>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                No points this time. Clears score; failed raids score for the room&apos;s Warden.
              </p>
            )}
            <div className={styles.rewardFoot}>
              <Streak days={reward.streak.current} hot={reward.streak.activeToday} />
              <span className="small muted">
                Season <b className="num">{reward.seasonPoints}</b>
                {reward.rank ? (
                  <>
                    {" "}
                    · <b className="num">#{reward.rank}</b>
                  </>
                ) : null}
              </span>
            </div>
          </div>
        )}

        <dl className={styles.resultStats}>
          <div>
            <dt>Moves used</dt>
            <dd>{movesUsed}</dd>
          </div>
          <div>
            <dt>HP left</dt>
            <dd>{result.hp}</dd>
          </div>
          <div>
            <dt>Keys</dt>
            <dd>{result.keys.length}</dd>
          </div>
        </dl>
        <div className={styles.resultActions}>
          <button className="btn primary" onClick={onAgain} autoFocus>
            Raid again
          </button>
          <Link className="btn" href={`/room/${tokenId}/defend`}>
            Defend this Chog
          </Link>
        </div>
      </div>
    </div>
  );
}
