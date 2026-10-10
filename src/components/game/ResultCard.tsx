"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Point, RaidResult } from "@/engine";
import { chogName } from "@/lib/names";
import { refreshPlayer, Streak } from "../progress/bits";
import { causeOfEnd } from "./describe";
import styles from "./game.module.css";

type Reward = {
  award: { points: number; parts: { label: string; points: number }[] } | null;
  streak: { current: number; best: number; activeToday: boolean };
  seasonPoints: number;
  rank: number | null;
  room: { attempts: number; cleared: boolean; bestMoves: number | null };
  cleared: number;
  total: number;
  next: { tokenId: number; name: string; reason: string };
};

const TITLE = { breach: "BREACHED!", defeated: "DEFEATED", out_of_moves: "OUT OF MOVES" } as const;

/** Shown after every finished raid, win or lose. Movement is disabled while it's up. */
export function ResultCard({
  result,
  movesUsed,
  tokenId,
  exit,
  onAgain,
  practice,
  raidId,
}: {
  result: RaidResult;
  movesUsed: number;
  tokenId: number;
  exit: Point;
  onAgain: () => void;
  practice?: boolean;
  /** Server raid id: when set, points, bests and the next room are fetched for it. */
  raidId?: string | null;
}) {
  const won = result.outcome === "breach";
  const [reward, setReward] = useState<Reward | null>(null);
  const [shared, setShared] = useState(false);

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

  const name = chogName(tokenId);
  const end = result.endAt;
  const fromExit = Math.abs(exit.x - end.x) + Math.abs(exit.y - end.y);
  const shareText = won
    ? `I breached ${name} in ${movesUsed} moves on Chog Raid.`
    : `${name} stopped me ${fromExit} tiles from the exit on Chog Raid. Can you get through?`;

  const share = async () => {
    const url = `${window.location.origin}/room/${tokenId}`;
    try {
      if (navigator.share) await navigator.share({ text: shareText, url });
      else await navigator.clipboard.writeText(`${shareText} ${url}`);
      setShared(true);
    } catch {}
  };

  const outcome = result.outcome === "incomplete" ? "out_of_moves" : result.outcome;
  const next = reward?.next;

  return (
    <div className={styles.resultWrap}>
      <div className={styles.result} data-won={won || undefined} data-outcome={outcome} role="dialog" aria-label={TITLE[outcome]}>
        <p className={styles.resultKicker}>
          <span className="num">{name}</span>
          {practice ? " · practice traps" : ""}
        </p>
        <h2 className={styles.resultTitle}>{TITLE[outcome]}</h2>
        <p className={styles.resultCause}>{causeOfEnd(result)}</p>
        {!won && (
          <p className="small muted" style={{ margin: "-4px 0 10px" }}>
            You stopped at tile ({end.x}, {end.y}), <b>{fromExit}</b> tile{fromExit === 1 ? "" : "s"} from the exit.
          </p>
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
            <dt>Your best here</dt>
            <dd>{reward ? (reward.room.cleared ? reward.room.bestMoves : "—") : "…"}</dd>
          </div>
        </dl>

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
                {reward.room.cleared
                  ? `You've cleared this room before (best ${reward.room.bestMoves} moves). Attempts: ${reward.room.attempts}.`
                  : `Not cleared yet · attempt ${reward.room.attempts}. Clears score points; failed raids score for the room's Warden.`}
              </p>
            )}
            <div className={styles.rewardFoot}>
              <Streak days={reward.streak.current} hot={reward.streak.activeToday} />
              <span className="small muted">
                Cleared <b className="num">{reward.cleared}</b> / <span className="num">{reward.total.toLocaleString()}</span>
              </span>
            </div>
          </div>
        )}

        <div className={styles.resultActions}>
          {won && next ? (
            <Link className="btn primary" href={`/room/${next.tokenId}`} autoFocus>
              Next room
            </Link>
          ) : (
            <button className="btn primary" onClick={onAgain} autoFocus>
              {won ? "Beat your time" : "Try again"}
            </button>
          )}
          {won && next ? (
            <button className="btn" onClick={onAgain}>
              Beat your time
            </button>
          ) : (
            next && (
              <Link className="btn" href={`/room/${next.tokenId}`}>
                Next room
              </Link>
            )
          )}
          <Link className="btn" href="/raid" prefetch={false}>
            Raid random
          </Link>
          <Link className="btn" href={`/room/${tokenId}/defend`}>
            Defend this Chog
          </Link>
        </div>
        {next && (
          <p className={styles.nextHint}>
            Next: <span className="num">{next.name}</span> · {next.reason}
          </p>
        )}
        <button className={styles.share} onClick={share}>
          {shared ? "Copied!" : "Share result"}
        </button>
      </div>
    </div>
  );
}
