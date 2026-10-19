import Link from "next/link";
import { RoomBrowser } from "@/components/home/RoomBrowser";
import { DungeonBackdrop } from "@/components/home/DungeonBackdrop";
import { ChogPanel } from "@/components/chog/ChogBits";
import { SeasonRewards } from "@/components/rewards/SeasonRewards";
import { DailyCard } from "@/components/progress/DailyCard";
import { SeasonRecap } from "@/components/progress/SeasonRecap";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteNav } from "@/components/ui/SiteNav";
import styles from "./home.module.css";
import backdrop from "@/components/home/backdrop.module.css";

export default function Home() {
  return (
    <>
      <DungeonBackdrop />
      <div className={backdrop.above}>
        <SiteNav />

        <main>
          {/* Asymmetric split: the pitch on the left, today's raid pinned up like a wanted poster on the right. */}
          <section className={styles.hero}>
            <span className={`${styles.torch} ${styles.torchLeft}`} aria-hidden />
            <span className={`${styles.torch} ${styles.torchRight}`} aria-hidden />

            <div className={styles.copy}>
              <p className={styles.kicker}>
                <span className="num">1,969</span> Chogs · one shared dungeon · Monad
              </p>
              <h1 className={styles.headline}>
                <span className={styles.line1}>Defend your Chog.</span>
                <span className={styles.line2}>Raid others.</span>
              </h1>
              <p className={styles.pitch}>
                Every Chog is a room built from its art. Set traps that fight while you&apos;re offline, then break into
                everyone else&apos;s.
              </p>
              <div className={styles.ctas}>
                <Link href="/raid" className="btn primary" prefetch={false}>
                  Raid a room
                </Link>
                <Link href="/defend" className="btn">
                  Defend my Chog
                </Link>
              </div>
            </div>

            <div className={styles.posterCol}>
              <DailyCard />
            </div>
          </section>

          <ChogPanel />
          <SeasonRewards />

          <div className="container">
            <SeasonRecap />
          </div>

          <section className="container" id="rooms">
            <RoomBrowser />
          </section>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
