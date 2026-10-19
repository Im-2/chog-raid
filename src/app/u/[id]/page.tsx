import { chogName } from "@/lib/names";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badges, Countdown, Streak } from "@/components/progress/bits";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteNav } from "@/components/ui/SiteNav";
import { PerkList } from "@/components/chog/ChogBits";
import { ChogIcon } from "@/components/chog/ChogIcon";
import { fmtChogFull } from "@/components/chog/useChog";
import { perkEffects, perksFor } from "@/config/chog";
import { chogBalance, chogEnabled } from "@/server/chog";
import chogStyles from "@/components/chog/chog.module.css";
import { currentRaider, raiderLabel } from "@/server/identity";
import { playerSummary, snapshot } from "@/server/progress";
import styles from "@/components/progress/profile.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const validId = (id: string) => /^guest:[0-9a-f]{16}$/.test(id) || /^0x[0-9a-fA-F]{40}$/.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  return { title: `${validId(id) ? raiderLabel(id) : "Player"} · Chog Raid` };
}

export default async function Profile({ params }: Props) {
  const id = decodeURIComponent((await params).id);
  if (!validId(id)) notFound();
  const [snap, me] = await Promise.all([snapshot(), currentRaider()]);
  const p = playerSummary(snap, id);
  const mine = !!me && me.toLowerCase() === id.toLowerCase();
  // $CHOG: a real, read-only on-chain balance for wallet profiles (null = couldn't be read).
  const showChog = chogEnabled() && p.isWallet;
  const balance = showChog ? await chogBalance(id) : null;
  const perks = perksFor(balance);
  const effects = perkEffects(balance);

  return (
    <>
      <SiteNav />
      <main className="container">
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>{p.isWallet ? "Wallet" : "Guest raider"}</p>
            <h1 className={`${styles.name} num`}>
              {p.label} {mine && <span className="tag">You</span>}
            </h1>
            <Badges badges={p.badges} max={12} />
            {!p.badges.length && <p className="small muted">No season badges yet. Finish a season in the top 3 to earn one.</p>}
            {effects.badge && (
              <p className="small" style={{ margin: "6px 0 0" }}>
                <span className={chogStyles.holderTag} style={{ marginLeft: 0 }}>
                  <ChogIcon size={11} /> $CHOG holder
                </span>
              </p>
            )}
          </div>
          <div className={styles.streaks}>
            <Streak days={p.streak.current} hot={p.streak.activeToday} label="day raid streak" />
            {p.isWallet && <Streak days={p.bestDaysHeld} hot={p.bestDaysHeld > 0} label="days held" />}
            <span className="small muted">
              Best raid streak <b className="num">{p.streak.best}</b>
            </span>
          </div>
        </header>

        <section className={styles.grid}>
          <div className={styles.stat}>
            <p className={styles.statLabel}>Raider points · Season {p.season.index + 1}</p>
            <p className={`${styles.statValue} num`}>{p.raider.points}</p>
            <p className="small muted">
              {p.raider.rank ? `#${p.raider.rank} this season · ` : ""}
              {p.raider.allTime} all time
            </p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>Warden score · Season {p.season.index + 1}</p>
            <p className={`${styles.statValue} num`}>{p.warden.points}</p>
            <p className="small muted">
              {p.warden.rank ? `#${p.warden.rank} this season · ` : ""}
              {p.warden.allTime} all time
            </p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>Season ends in</p>
            <p className={styles.statValue}>
              <Countdown to={p.season.endsAt} />
            </p>
            <p className="small muted">
              <Link href="/leaderboards">See the boards →</Link>
            </p>
          </div>
        </section>

        {showChog && (
          <section data-reveal className={chogStyles.card} aria-labelledby="profile-chog">
            <h2 id="profile-chog" className={styles.h2} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ChogIcon size={22} /> $CHOG
            </h2>
            {balance === null ? (
              <p className="small muted">This wallet&apos;s $CHOG balance couldn&apos;t be read right now.</p>
            ) : (
              <p style={{ margin: "0 0 10px" }}>
                <b className="num" style={{ fontSize: 22, color: "var(--gold)" }}>
                  {fmtChogFull(balance)}
                </b>{" "}
                $CHOG <span className="small muted">(live, from the token contract on Monad)</span>
              </p>
            )}
            <PerkList perks={perks} signedIn={balance !== null} />
            <p className="small muted" style={{ margin: "10px 0 0" }}>
              Perks are cosmetic or convenience only, and optional. <Link href="/chog">How $CHOG works →</Link>
            </p>
          </section>
        )}

        {p.rooms.length > 0 && (
          <section>
            <h2 className={styles.h2}>Defended rooms</h2>
            <ul className={styles.rooms}>
              {p.rooms.map((r) => (
                <li key={r.tokenId}>
                  <Link href={`/room/${r.tokenId}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/chogs/${r.tokenId}/image?s=128`} alt="" width={56} height={56} className="pixel" />
                  </Link>
                  <div>
                    <b className="num">{chogName(r.tokenId)}</b>
                    <p className="small muted" style={{ margin: 0 }}>
                      {r.traps} traps · held <b className="num">{r.daysHeld}</b> day{r.daysHeld === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link href={`/room/${r.tokenId}`} className="btn">
                    Raid it
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
