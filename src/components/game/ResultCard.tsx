"use client";

import Link from "next/link";
import type { RaidResult } from "@/engine";
import { causeOfEnd } from "./describe";
import styles from "./game.module.css";

export function ResultCard({
  result,
  movesUsed,
  tokenId,
  onAgain,
  practice,
}: {
  result: RaidResult;
  movesUsed: number;
  tokenId: number;
  onAgain: () => void;
  practice?: boolean;
}) {
  const won = result.outcome === "breach";
  return (
    <div className={styles.resultWrap}>
      <div className={styles.result} data-won={won || undefined} role="status">
        <p className={styles.resultKicker}>{practice ? "Practice raid" : `Chog #${tokenId}`}</p>
        <h2 className={styles.resultTitle}>{won ? "BREACHED!" : result.outcome === "dead" ? "YOU DIED" : "OUT OF MOVES"}</h2>
        <p className={styles.resultCause}>{causeOfEnd(result)}</p>
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
