"use client";

import Link from "next/link";
import { signIn, useSession } from "../wallet/session";
import { ChogIcon } from "../chog/ChogIcon";
import { fmtChogFull } from "../chog/useChog";
import { Countdown } from "../progress/bits";
import { bandLabel, POOL_PILL, useRewards, type RewardsState, type Standing } from "./useRewards";
import styles from "./rewards.module.css";

const boardName = { wardens: "Wardens", raiders: "Raiders" } as const;

/** One line about where this player stands on one board. Never says "you won". */
function standingLine(board: "wardens" | "raiders", s: Standing | null, d: RewardsState) {
  const name = boardName[board];
  if (!s) {
    return board === "raiders"
      ? `${name}: not ranked yet. Clear ${d.eligibility.raiderMinRoomsCleared} different rooms this season to be eligible.`
      : `${name}: not ranked yet. You earn Warden points when raiders fail in a Chog you hold.`;
  }
  const funded = d.pool.state === "funded";
  if (s.inZone) {
    return funded
      ? `${name}: #${s.rank}, inside the top ${d.topN}. Projected share ${fmtChogFull(s.amount)} $CHOG (${s.sharePct}% of the ${name} half). Changes until the season ends.`
      : `${name}: #${s.rank}, inside the top ${d.topN}. Rewards activate when the pool is funded.`;
  }
  return `${name}: #${s.rank}${s.toCutoff ? `, ${s.toCutoff} point${s.toCutoff === 1 ? "" : "s"} to reach the top ${d.topN}` : ""}.`;
}

/** Season Rewards panel: countdown, the real pool balance and status, how it's shared. Honest when the pool is empty. */
export function SeasonRewards({ compact = false }: { compact?: boolean }) {
  const { data: d, failed } = useRewards();
  const session = useSession();
  if (failed) return null;
  if (!d) {
    return (
      <section className={styles.panel} aria-busy>
        <div className="skeleton" style={{ height: 150 }} />
      </section>
    );
  }
  const pill = POOL_PILL[d.pool.state];
  const funded = d.pool.state === "funded";
  const explorer = d.pool.explorer && d.pool.address ? `${d.pool.explorer}/address/${d.pool.address}` : null;
  const half = Math.round(d.split.wardens * 100);

  return (
    <section className={styles.panel} aria-labelledby="season-rewards-title">
      <header className={styles.head}>
        <h2 id="season-rewards-title" className={styles.title}>
          <ChogIcon size={22} /> Season Rewards
        </h2>
        <span className={styles.pill} data-tone={pill.tone}>
          {pill.label}
        </span>
      </header>

      <div className={styles.grid}>
        <div className={styles.stat}>
          <p className={styles.label}>Season {d.season.index + 1} ends in</p>
          <p className={styles.big}>
            <Countdown to={d.season.endsAt} />
          </p>
        </div>
        <div className={styles.stat}>
          <p className={styles.label}>Reward pool (real on-chain $CHOG)</p>
          <p className={styles.big}>
            {d.pool.balance === null ? (
              "—"
            ) : (
              <>
                <b className="num">{fmtChogFull(d.pool.balance)}</b> $CHOG
              </>
            )}
          </p>
          {explorer && (
            <a className="small" href={explorer} target="_blank" rel="noreferrer">
              View the pool address ↗
            </a>
          )}
        </div>
        {d.pool.target !== null && (
          <div className={styles.stat}>
            <p className={styles.label}>{d.pool.targetLabel}</p>
            <p className={styles.big}>
              <b className="num">{fmtChogFull(d.pool.target)}</b> $CHOG
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              A plan, not a balance.
            </p>
          </div>
        )}
      </div>

      <p className={styles.honest}>
        {funded
          ? "The pool has a balance. Shares below are projections that change until the season ends. Rewards are paid manually by the team after the season ends, to the wallet that earned the rank. Not guaranteed."
          : d.pool.state === "unavailable"
            ? "The pool balance couldn't be read right now. Rewards activate when the pool is funded."
            : "Rewards activate when the pool is funded. Nothing is claimable and nothing is promised until then."}
      </p>

      <div className={styles.how}>
        <p className={styles.howHead}>How the pool is shared</p>
        <p className="small" style={{ margin: "0 0 8px" }}>
          Split <b className="num">{half}</b>/<b className="num">{100 - half}</b> between Wardens (defenders) and Raiders. The top <b className="num">{d.topN}</b> of each board share its half:
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Share of the board&apos;s half</th>
            </tr>
          </thead>
          <tbody>
            {d.payout.map((b) => (
              <tr key={b.from}>
                <td>{bandLabel(b)}</td>
                <td className="num">
                  {b.pct}%{b.to > b.from ? " shared equally" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.me && !compact && (
        <ul className={styles.mine}>
          {!d.me.isWallet ? (
            <li>Connect a wallet to be eligible: guests appear on the boards but can&apos;t receive rewards.</li>
          ) : (
            <>
              <li>{standingLine("wardens", d.me.wardens, d)}</li>
              <li>{standingLine("raiders", d.me.raiders, d)}</li>
            </>
          )}
        </ul>
      )}
      {!d.me && !compact && !session.address && session.status !== "loading" && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          <button className={styles.link} onClick={() => void signIn()}>
            Connect a wallet
          </button>{" "}
          to see where you stand.
        </p>
      )}

      <p className={styles.foot}>
        <Link href="/chog#rules">Rules: ranking, eligibility and how rewards are paid →</Link>
        {d.lastSnapshot && (
          <span className="small muted">
            {" "}
            · Season {d.lastSnapshot.season + 1} final ranking saved {new Date(d.lastSnapshot.takenAt).toLocaleDateString()}
          </span>
        )}
        {d.admin && (
          <>
            {" · "}
            <a href={`/api/admin/rewards?season=${d.season.index - 1}&format=csv&create=1`}>Admin: download last season&apos;s CSV</a>
          </>
        )}
      </p>
    </section>
  );
}
