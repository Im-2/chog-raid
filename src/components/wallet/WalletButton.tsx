"use client";

import { useState } from "react";
import { ChogIcon } from "../chog/ChogIcon";
import { fmtChogFull, useChog } from "../chog/useChog";
import { demoSignIn, shortAddress, signIn, signOut, useSession } from "./session";
import styles from "./wallet.module.css";

/** Connect / signed-in wallet chip. `compact` hides the label on small top bars. */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const { chog } = useChog();

  if (s.status === "loading") return <span className={`btn ${styles.placeholder}`} aria-hidden />;

  if (!s.address) {
    return (
      <span className={styles.wrap}>
        <button className="btn" onClick={() => void signIn()} disabled={s.status === "signing"}>
          {s.status === "signing" ? "Check wallet…" : compact ? "Connect" : "Connect wallet"}
        </button>
        {s.demo && (
          <button className="btn" onClick={() => void demoSignIn()} title="Mock mode: sign in as the demo owner of Chogs 1-10">
            Demo owner
          </button>
        )}
      </span>
    );
  }

  return (
    <span className={styles.wrap}>
      <button className={`btn ${styles.chip}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <i className={styles.dot} aria-hidden />
        <span className="num">{shortAddress(s.address)}</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {chog?.enabled && (
            <a role="menuitem" href="/chog" className={styles.chogRow}>
              <ChogIcon size={20} />
              <span>
                <span>
                  <b className="num">{chog.balanceUnavailable ? "unavailable" : fmtChogFull(chog.balance)}</b> $CHOG
                </span>
                <small>
                  {chog.balanceUnavailable
                    ? "Couldn't read your balance"
                    : chog.tier
                      ? `${chog.tier} · ${chog.perks.filter((p) => p.unlocked).length} of ${chog.perks.length} perks`
                      : `No perks yet · from ${chog.perks[0]?.minBalance.toLocaleString()} $CHOG`}
                </small>
              </span>
            </a>
          )}
          <a role="menuitem" href="/defend">
            My Chogs
          </a>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </span>
  );
}

/** Inline error from the last sign-in attempt. */
export function SessionError() {
  const s = useSession();
  return s.error ? (
    <p className={styles.error} role="alert">
      {s.error}
    </p>
  ) : null;
}
