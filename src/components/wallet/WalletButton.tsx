"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChogIcon } from "../chog/ChogIcon";
import { fmtChogFull, useChog } from "../chog/useChog";
import { MenuAlerts } from "../progress/NavChips";
import { usePlayer } from "../progress/bits";
import { CHAIN_ID, CHAIN_NAME, WALLETCONNECT_PROJECT_ID } from "./chain";
import {
  closeFallback,
  connectFallback,
  demoSignIn,
  loadWallet,
  shortAddress,
  signIn,
  signOut,
  switchAccount,
  switchToGameChain,
  useSession,
} from "./session";
import styles from "./wallet.module.css";

/** Connect / signed-in wallet chip. `compact` hides the label on small top bars. */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [owned, setOwned] = useState<number | null>(null);
  const { chog } = useChog();
  const me = usePlayer();
  const unread = me?.unread ?? 0;
  const streak = me?.player?.streak.current ?? 0;

  // Owned Chogs for the menu: a read-only list from the server (ownership is checked there).
  useEffect(() => {
    if (!open || !s.address) return;
    let live = true;
    fetch("/api/me/chogs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setOwned(j?.chogs?.length ?? null))
      .catch(() => live && setOwned(null));
    return () => {
      live = false;
    };
  }, [open, s.address]);

  if (s.status === "loading") return <span className={`btn ${styles.placeholder}`} aria-hidden />;

  if (!s.address) {
    return (
      <span className={styles.wrap}>
        <button className="btn" onClick={() => void signIn()} disabled={s.status === "signing"}>
          {s.status === "signing" ? "Check wallet…" : compact ? "Connect" : "Connect wallet"}
        </button>
        {s.demo && (
          <button className="btn" onClick={() => void demoSignIn()} title="Dev flag (mock mode only): sign in as the demo owner of Chogs 1-10">
            Demo owner
          </button>
        )}
        <FallbackModal />
      </span>
    );
  }

  return (
    <span className={styles.wrap}>
      <button className={`btn ${styles.chip}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <i className={styles.dot} aria-hidden />
        <span className={`num ${styles.addrFull}`}>{shortAddress(s.address)}</span>
        <span className={`num ${styles.addrShort}`}>{s.address.slice(-4)}</span>
        {unread > 0 && <span className={styles.unread} aria-label={`${unread} new raid alerts`} />}
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.account}>
            <span className={`num ${styles.accountAddr}`} title={s.address}>
              {shortAddress(s.address)}
            </span>
            <small>
              {owned === null ? "Checking your Chogs…" : `${owned} Chog${owned === 1 ? "" : "s"} owned`}
              {s.wallet.connected && s.wallet.chainId !== null && s.wallet.chainId !== CHAIN_ID ? ` · wrong network` : ""}
            </small>
          </div>
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
          {me?.player && (
            <a role="menuitem" href={`/u/${encodeURIComponent(me.player.id)}`}>
              Profile · {streak}-day streak
            </a>
          )}
          <a role="menuitem" href="/defend">
            My Chogs
          </a>
          <MenuAlerts unread={unread} />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void switchAccount();
            }}
          >
            Switch account
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </span>
  );
}

/** Banner shown when the connected wallet is on the wrong network. */
export function ChainGuard() {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  if (!s.wallet.connected || s.wallet.chainId === null || s.wallet.chainId === CHAIN_ID) return null;
  return (
    <div className={styles.chainBar} role="alert">
      <span>
        Your wallet is on the wrong network. Chog Raid runs on <b>{CHAIN_NAME}</b>.
      </span>
      <button
        className="btn primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void switchToGameChain().finally(() => setBusy(false));
        }}
      >
        Switch to {CHAIN_NAME}
      </button>
    </div>
  );
}

/**
 * Used only when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is missing: lists the browser wallets the
 * page can see (EIP-6963). With a project ID, Reown AppKit shows its own full modal instead.
 */
function FallbackModal() {
  const s = useSession();
  const [names, setNames] = useState<{ i: number; name: string; icon?: string }[]>([]);

  useEffect(() => {
    if (!s.fallbackOpen) return;
    let off = () => {};
    void loadWallet().then((w) => {
      const read = () => setNames(w.connectors().map((c, i) => ({ i, name: c.name, icon: c.icon })));
      read();
      off = w.onConnectors(read);
    });
    return () => off();
  }, [s.fallbackOpen]);

  if (!s.fallbackOpen || typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.fbBackdrop} onClick={closeFallback}>
      <div className={styles.fbModal} role="dialog" aria-modal="true" aria-label="Connect a wallet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Connect a wallet</h2>
          <button className="btn icon" onClick={closeFallback} aria-label="Close">
            ✕
          </button>
        </header>
        {!WALLETCONNECT_PROJECT_ID && (
          <p className="small muted">Showing browser wallets detected on this device. Mobile wallets and QR need a WalletConnect project ID.</p>
        )}
        {names.length ? (
          <ul>
            {names.map((n) => (
              <li key={n.i}>
                <button className="btn" onClick={() => void connectFallback(n.i)}>
                  {n.icon ? <img src={n.icon} alt="" width={24} height={24} /> : null} {n.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No browser wallet found. Install MetaMask or Rabby, or open this site inside your wallet&apos;s browser.</p>
        )}
        {s.error && <p role="alert" style={{ color: "var(--blood)" }}>{s.error}</p>}
      </div>
    </div>,
    document.body,
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
