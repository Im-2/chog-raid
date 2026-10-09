import type { Metadata } from "next";
import Link from "next/link";
import { Tabs } from "@/components/leaderboards/Tabs";
import { SiteNav } from "@/components/ui/SiteNav";
import { currentRaider, raiderLabel } from "@/server/identity";
import { getStats, rankDefenders, rankFastest, rankRaiders } from "@/server/stats";
import { getStore } from "@/server/store";
import styles from "@/components/leaderboards/leaderboards.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboards · Chog Raid" };

export default async function Leaderboards() {
  const [stats, me] = await Promise.all([getStats(getStore()), currentRaider()]);
  const isMe = (id: string) => !!me && id.toLowerCase() === me.toLowerCase();
  const raiders = rankRaiders(stats);
  const defenders = rankDefenders(stats);
  const fastest = rankFastest(stats);

  const empty = (text: string) => (
    <div className={styles.empty}>
      <p>{text}</p>
      <Link className="btn primary" href="/raid" prefetch={false}>
        Raid a random room
      </Link>
    </div>
  );

  return (
    <>
      <SiteNav />
      <main className="container">
        <h1 className={styles.title}>Leaderboards</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          <span className="num">{stats.totalRaids}</span> raids recorded so far.
        </p>

        <Tabs
          tabs={[
            {
              id: "raiders",
              label: "Raiders",
              content:
                raiders.length === 0 ? (
                  empty("No one has breached a room yet.")
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Raider</th>
                        <th>Rooms cleared</th>
                        <th>Clears</th>
                        <th>Fastest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {raiders.map((r, i) => (
                        <tr key={r.raider} data-me={isMe(r.raider) || undefined}>
                          <td className="num">{i + 1}</td>
                          <td>
                            {raiderLabel(r.raider)} {isMe(r.raider) && <span className="tag">You</span>}
                          </td>
                          <td className="num">{r.roomsCleared}</td>
                          <td className="num">
                            {r.clears}/{r.raids}
                          </td>
                          <td className="num">{r.fastestClear ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
            },
            {
              id: "wardens",
              label: "Wardens",
              content:
                defenders.length === 0 ? (
                  empty("No defended room has been raided yet. Holders: set your traps, then send a friend in.")
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Warden</th>
                        <th>Raids held</th>
                        <th>Faced</th>
                        <th>Hold rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defenders.map((d, i) => (
                        <tr key={d.defender} data-me={isMe(d.defender) || undefined}>
                          <td className="num">{i + 1}</td>
                          <td>
                            {raiderLabel(d.defender)} {isMe(d.defender) && <span className="tag">You</span>}
                          </td>
                          <td className="num">{d.held}</td>
                          <td className="num">{d.raidsFaced}</td>
                          <td className="num">{Math.round(d.defenseRate * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
            },
            {
              id: "fastest",
              label: "Fastest clears",
              content:
                fastest.length === 0 ? (
                  empty("No clears yet. Set the first record.")
                ) : (
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
                      {fastest.map((r) => (
                        <tr key={r.tokenId} data-me={isMe(r.fastestClear!.raider) || undefined}>
                          <td>
                            <Link href={`/room/${r.tokenId}`} className={styles.room}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/api/chogs/${r.tokenId}/image?s=128`} alt="" width={28} height={28} className="pixel" />
                              <span className="num">#{r.tokenId}</span>
                            </Link>
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
                ),
            },
          ]}
        />
      </main>
    </>
  );
}
