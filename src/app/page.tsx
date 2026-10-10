import Link from "next/link";
import { RoomBrowser } from "@/components/home/RoomBrowser";
import { DungeonBackdrop } from "@/components/home/DungeonBackdrop";
import { DailyCard } from "@/components/progress/DailyCard";
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
        <section className={styles.hero}>
          <div className={styles.torches} aria-hidden>
            <span />
            <span />
          </div>
          <h1 className={styles.headline}>
            Defend your Chog.
            <br />
            <span>Raid others.</span>
          </h1>
          <p className={styles.pitch}>
            Every Chog becomes a room in one giant shared dungeon: owners set traps that defend it while they&apos;re
            offline, and everyone else tries to break through.
          </p>
          <div className={styles.ctas}>
            <Link href="/raid" className="btn primary" prefetch={false}>
              Raid a room
            </Link>
            <Link href="/defend" className="btn">
              Defend my Chog
            </Link>
          </div>
        </section>

        <div className="container">
          <DailyCard />
        </div>

        <section className="container" id="rooms">
          <RoomBrowser />
        </section>
      </main>
      </div>
    </>
  );
}
