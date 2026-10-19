import Link from "next/link";
import { ChogBadge } from "../chog/ChogBits";
import { NavChips } from "../progress/NavChips";
import { WalletButton } from "../wallet/WalletButton";
import { MobileMenu } from "./MobileMenu";
import styles from "./nav.module.css";

/** Logo, three links, one $CHOG balance chip and one wallet button. Streak and alerts live in the wallet menu. */
export function SiteNav() {
  return (
    <header className={styles.nav}>
      <Link href="/" className={styles.brand}>
        CHOG<span>RAID</span>
      </Link>
      <nav className={styles.links} aria-label="Main">
        <Link href="/atlas">Atlas</Link>
        <Link href="/leaderboards">Leaderboards</Link>
        <Link href="/defend">Defend</Link>
      </nav>
      <div className={styles.actions}>
        <ChogBadge />
        <WalletButton compact />
        <MobileMenu />
      </div>
      <NavChips />
    </header>
  );
}
