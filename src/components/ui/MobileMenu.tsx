"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./nav.module.css";

const LINKS = [
  { href: "/atlas", label: "Atlas" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/defend", label: "Defend" },
];

/** Phones: the three page links collapse into one simple menu button. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={ref} className={styles.mobile}>
      <button className={`btn icon ${styles.burger}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu">
        <i aria-hidden />
      </button>
      {open && (
        <nav id="mobile-nav" className={styles.drop} aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </span>
  );
}
