import { chogName } from "@/lib/names";
import type { Metadata } from "next";
import Link from "next/link";
import { RETENTION } from "@/config/retention";
import { Tabs } from "@/components/leaderboards/Tabs";
import { Badges, Countdown } from "@/components/progress/bits";
import { DifficultyBadge } from "@/components/ui/DifficultyBadge";
import { SeasonRewards } from "@/components/rewards/SeasonRewards";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteNav } from "@/components/ui/SiteNav";
import { difficultyFor } from "@/lib/difficulty";
import { REWARDS } from "@/config/rewards";
import { currentRaider, raiderLabel } from "@/server/identity";
import { liveRanking, poolState, standingOf } from "@/server/rewards";
import { daily, seasonBoards, snapshot } from "@/server/progress";
import { computeStats, rankDefenders, rankFastest, rankRaiders } from "@/server/stats";
import styles from "@/components/leaderboards/leaderboards.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboards · Chog Raid" };

const profile = (id: string) => `/u/${encodeURIComponent(id)}`;

export default async function Leaderboards() {
  const [snap, me, pool] = await Promise.all([snapshot(), currentRaider(), poolState()]);
  const ranking = await liveRanking(snap.raids, snap.supply);
  // Show the whole reward zone (top N) plus a few rows past it, so the cutoff is visible.
  const boards = seasonBoards(snap, me, REWARDS.topN + 8);
  const money = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n);
  const funded = pool.state === "funded";

  /** Where the viewer stands on one board, in plain words. Never "you won". */
  const mineLine = (board: "wardens" | "raiders") => {
    if (!me) return null;
    if (me.startsWith("guest:")) return "Connect a wallet to be eligible for rewards: guests appear on the board but can't receive them.";
    const st = standingOf(ranking[board], me, board, pool);
    if (!st) {
      return board === "raiders"
        ? `You're not ranked for rewards yet: clear ${REWARDS.eligibility.raiderMinRoomsCleared} different rooms this season.`
        : "You're not ranked for rewards yet: earn Warden points when raiders fail in a Chog you hold.";
    }
    if (st.inZone) return `You're #${st.rank}, inside the reward zone (top ${REWARDS.topN}).${funded ? ` Projected share: ${money(st.amount)} $CHOG, which changes until the season ends.` : " Rewards activate when the pool is funded."}`;
    return `You're #${st.rank}${st.toCutoff ? `: ${st.toCutoff} point${st.toCutoff === 1 ? "" : "s"} to reach the top ${REWARDS.topN}` : ""}.`;
  };
  const today = daily(snap, me);
  const stats = computeStats(snap.raids);
  const isMe = (id: string) => !!me && id.toLowerCase() === me.toLowerCase();

  const empty = (text: string, href = "/raid", cta = "Raid a random room") => (
    <div className={styles.empty}>
      <p>{text}</p>
      <Link className="btn primary" href={href} prefetch={false}>
        {cta}
      </Link>
    </div>
  );

  const pointsTable = (rows: typeof boards.raiders, unit: string, board: "wardens" | "raiders") => (
    <>
    <p className={styles.zoneNote}>
      {mineLine(board) ?? `Rows with a gold edge are inside the reward zone: the top ${REWARDS.topN} eligible wallets.`}
      {!funded && " Rewards activate when the pool is funded."}
    </p>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Points</th>
          <th>{unit}</th>
          <th title="Projected from the real pool balance; 0 until the pool is funded. Not guaranteed.">Est. share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const st = standingOf(ranking[board], r.id, board, pool);
          return (
          <tr key={r.id} data-me={r.me || undefined} data-zone={st?.inZone || undefined}>
            <td className="num">{r.place}</td>
            <td>
              <Link href={profile(r.id)} className={styles.player}>
                {r.label}
              </Link>{" "}
              {r.me && <span className="tag">You</span>} <Badges badges={r.badges} max={3} />
            </td>
            <td className="num">{r.points}</td>
            <td className="num">{r.count}</td>
            <td className={styles.share}>
              {r.id.startsWith("guest:") ? (
                <span className="muted small">Wallet needed</span>
              ) : st?.inZone ? (
                <>
                  <span className="num">{money(st.amount)}</span> $CHOG
                  <small>{st.sharePct}% of the half</small>
                </>
              ) : (
                <span className="muted" title="Not ranked for rewards yet (see the rules)">
                  —
                </span>
              )}
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );

  return (
    <>
      <SiteNav />
      <main className="container">
        <h1 className={styles.title}>Leaderboards</h1>
        <div className={styles.season} data-reveal>
          <div>
            <p className={styles.seasonName}>Season {boards.season + 1}</p>
            <p className="small muted" style={{ margin: 0 }}>
              Boards reset weekly. Top {RETENTION.season.badgePlaces} Raiders and Wardens earn a season badge.
            </p>
          </div>
          <div className={styles.seasonClock}>
            <span className="small muted">Ends in</span>
            <b>
              <Countdown to={boards.endsAt} />
            </b>
          </div>
        </div>

        {/* The panel carries its own side margin on phones; cancel it inside the page container. */}
        <div className={styles.rewardsWrap}>
          <SeasonRewards />
        </div>

        <Tabs
          tabs={[
            {
              id: "raiders",
              label: "Raiders",
              content: boards.raiders.length ? pointsTable(boards.raiders, "Clears", "raiders") : empty("No clears this season yet. Points go to the first raider through."),
            },
            {
              id: "wardens",
              label: "Wardens",
              content: boards.wardens.length
                ? pointsTable(boards.wardens, "Holds", "wardens")
                : empty("No Warden points this season yet. Defend your Chog: every raider who fails in your room scores for you.", "/defend", "Defend my Chog"),
            },
            {
              id: "daily",
              label: "Daily",
              content: (
                <>
                  <p className="small" style={{ marginTop: 0 }}>
                    Today&apos;s room: <Link href={`/room/${today.tokenId}`}>{chogName(today.tokenId)}</Link>{" "}
                    <DifficultyBadge d={difficultyFor(today.tokenId)} size="sm" /> · fewest moves wins · ends in{" "}
                    <Countdown to={today.endsAt} />
                  </p>
                  {today.board.length ? (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Raider</th>
                          <th>Moves</th>
                        </tr>
                      </thead>
                      <tbody>
                        {today.board.map((e) => (
                          <tr key={e.place} data-me={e.me || undefined}>
                            <td className="num">{e.place}</td>
                            <td>
                              {e.label} {e.me && <span className="tag">You</span>}
                            </td>
                            <td className="num">{e.moves}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    empty("Nobody has cleared today's room yet.", `/room/${today.tokenId}`, "Raid today's room")
                  )}
                </>
              ),
            },
            {
              id: "fastest",
              label: "Fastest clears",
              content: rankFastest(stats).length ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Moves</th>
                      <th>By</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rankFastest(stats).map((r) => (
                      <tr key={r.tokenId} data-me={isMe(r.fastestClear!.raider) || undefined}>
                        <td>
                          <Link href={`/room/${r.tokenId}`} className={styles.room}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/chogs/${r.tokenId}/image?s=128`} alt="" width={28} height={28} className="pixel" />
                            <span className="num">{chogName(r.tokenId)}</span>
                          </Link>{" "}
                          <DifficultyBadge d={difficultyFor(r.tokenId)} size="sm" />
                        </td>
                        <td className="num">{r.fastestClear!.moves}</td>
                        <td>{raiderLabel(r.fastestClear!.raider)}</td>
                        <td>
                          <Link href={`/room/${r.tokenId}`} className="btn">
                            Beat it
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                empty("No clears yet. Set the first record.")
              ),
            },
            {
              id: "alltime",
              label: "All time",
              content: (
                <div className={styles.split}>
                  <div>
                    <h3 className={styles.h3}>Raiders: rooms cleared</h3>
                    {rankRaiders(stats, 10).length ? (
                      <table className={styles.table}>
                        <tbody>
                          {rankRaiders(stats, 10).map((r, i) => (
                            <tr key={r.raider} data-me={isMe(r.raider) || undefined}>
                              <td className="num">{i + 1}</td>
                              <td>
                                <Link href={profile(r.raider)} className={styles.player}>
                                  {raiderLabel(r.raider)}
                                </Link>
                              </td>
                              <td className="num">{r.roomsCleared}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="small muted">None yet.</p>
                    )}
                  </div>
                  <div>
                    <h3 className={styles.h3}>Wardens: raids held</h3>
                    {rankDefenders(stats, 10).length ? (
                      <table className={styles.table}>
                        <tbody>
                          {rankDefenders(stats, 10).map((d, i) => (
                            <tr key={d.defender} data-me={isMe(d.defender) || undefined}>
                              <td className="num">{i + 1}</td>
                              <td>
                                <Link href={profile(d.defender)} className={styles.player}>
                                  {raiderLabel(d.defender)}
                                </Link>
                              </td>
                              <td className="num">
                                {d.held} · {Math.round(d.defenseRate * 100)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="small muted">None yet.</p>
                    )}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
