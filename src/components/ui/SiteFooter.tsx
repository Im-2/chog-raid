import Link from "next/link";
import styles from "../chog/chog.module.css";

/** Site footer: the main pages, plus the $CHOG explainer. */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <nav aria-label="Footer">
        <Link href="/atlas">Atlas</Link>
        <Link href="/leaderboards">Leaderboards</Link>
        <Link href="/defend">Defend</Link>
        <Link href="/chog">$CHOG</Link>
      </nav>
      <span className={styles.spacer}>Chog Raid · built for Chogathon 2026 on Monad</span>
    </footer>
  );
}
