"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../home.module.css";

export default function DefendStart() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          CHOG<span>RAID</span>
        </Link>
      </header>
      <main className={styles.hero}>
        <h1 className={styles.headline} style={{ fontSize: "clamp(34px, 7vw, 56px)" }}>
          Defend <span>your Chog</span>
        </h1>
        <p className={styles.pitch}>
          Your Chog&apos;s room fights for you while you&apos;re offline. Place traps in its slots, test the room yourself,
          and watch the raid log.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d+$/.test(id)) router.push(`/room/${id}/defend`);
          }}
          style={{ display: "flex", gap: 8, maxWidth: 380, margin: "0 auto" }}
        >
          <input
            type="text"
            inputMode="numeric"
            placeholder="Your Chog #"
            aria-label="Your Chog token ID"
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^\d]/g, ""))}
            required
          />
          <button className="btn primary" type="submit">
            Open
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 20 }}>
          Wallet sign-in and the ownership check arrive in the next build step. Until then you can draft and test a
          defense for any Chog on this device.
        </p>
      </main>
    </>
  );
}
