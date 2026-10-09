import Link from "next/link";
import { RoomBrowser } from "@/components/home/RoomBrowser";
import { WalletButton } from "@/components/wallet/WalletButton";
import styles from "./home.module.css";

export default function Home() {
  return (
    <>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          CHOG<span>RAID</span>
        </Link>
        <span style={{ marginLeft: "auto" }}>
          <WalletButton />
        </span>
      </header>

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

        <section className="container" id="rooms">
          <RoomBrowser />
        </section>
      </main>
    </>
  );
}
