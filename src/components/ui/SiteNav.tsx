import Link from "next/link";
import { NavChips } from "../progress/NavChips";
import { WalletButton } from "../wallet/WalletButton";
import styles from "./nav.module.css";

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
      <NavChips />
      <WalletButton compact />
    </header>
  );
}
