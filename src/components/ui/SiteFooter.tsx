import Link from "next/link";
import { SITE } from "@/config/site";
import { chogToken } from "@/server/chog";
import styles from "./footer.module.css";

type Item = { label: string; href: string; external?: boolean };

/** Site footer for every page except the game screens. Links with no configured value are left out. */
export function SiteFooter() {
  const token = chogToken();
  const columns: { title: string; items: (Item | null)[] }[] = [
    {
      title: "Play",
      items: [
        { label: "Raid a room", href: "/raid" },
        { label: "Atlas", href: "/atlas" },
        { label: "Leaderboards", href: "/leaderboards" },
        { label: "Defend", href: "/defend" },
      ],
    },
    {
      title: "Chog",
      items: [
        { label: "chog.xyz", href: SITE.chog.site, external: true },
        { label: "Chog on X (@ChogNFT)", href: SITE.chog.x, external: true },
        SITE.chog.discord() ? { label: "Chog Discord", href: SITE.chog.discord()!, external: true } : null,
        SITE.chog.opensea() ? { label: "Chog Genesis on OpenSea", href: SITE.chog.opensea()!, external: true } : null,
      ],
    },
    {
      title: "$CHOG",
      items: [
        { label: "About $CHOG", href: "/chog" },
        { label: "Season Rewards rules", href: "/chog#rules" },
        token ? { label: "Token contract", href: `${SITE.explorer()}/token/${token}`, external: true } : null,
      ],
    },
    {
      title: "Builder",
      items: [
        { label: "GitHub repo", href: SITE.github, external: true },
        { label: "GitHub profile", href: SITE.githubProfile, external: true },
        { label: "Builder on X", href: SITE.x(), external: true },
        SITE.discord() ? { label: "Builder on Discord", href: SITE.discord()!, external: true } : null,
      ],
    },
  ];

  return (
    <footer className={styles.footer} data-reveal>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <Link href="/" className={styles.brand}>
            CHOG<span>RAID</span>
          </Link>
          <p className={styles.tagline}>Defend your Chog. Raid others.</p>
          <p className={styles.built}>Built for Chogathon 2026</p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} className={styles.col} aria-label={c.title}>
            <h2 className={styles.colTitle}>{c.title}</h2>
            <ul>
              {c.items
                .filter((i): i is Item => !!i)
                .map((i) => (
                  <li key={i.label}>
                    {i.external ? (
                      <a href={i.href} target="_blank" rel="noopener noreferrer">
                        {i.label} <span aria-hidden>↗</span>
                      </a>
                    ) : (
                      <Link href={i.href} prefetch={i.href === "/raid" ? false : undefined}>
                        {i.label}
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={styles.bottom}>
        <p>Community-built for Chogathon 2026. Not an official Chog product unless stated otherwise.</p>
        <p>
          $CHOG Season Rewards depend on the pool being funded and are paid manually by the team. Nothing is automatic or guaranteed.{" "}
          <Link href="/chog#rules">Read the rules</Link>.
        </p>
      </div>
    </footer>
  );
}
