"use client";

import Link from "next/link";
import { signIn, useSession } from "../wallet/session";
import { perksFor, type PerkStatus } from "@/config/chog";
import { ChogIcon } from "./ChogIcon";
import { fmtChog, fmtChogFull, useChog, type ChogState } from "./useChog";
import styles from "./chog.module.css";

/** Small $CHOG balance badge for the top navigation: coin icon plus the wallet's live balance. */
export function ChogBadge() {
  const { chog, failed } = useChog();
  if (failed || (chog && !chog.enabled)) return null;
  const signed = !!chog?.signedIn;
  const text = !chog || !signed ? "$CHOG" : chog.balanceUnavailable ? "—" : fmtChog(chog.balance);
  const title = !signed
    ? "$CHOG: optional perks for holders. Connect a wallet to see your balance."
    : chog?.balanceUnavailable
      ? "Your $CHOG balance couldn't be read right now."
      : `Your $CHOG balance: ${fmtChogFull(chog?.balance)}${chog?.tier ? ` · ${chog.tier}` : ""}`;
  return (
    <Link href="/chog" className={styles.navBadge} title={title} aria-label={title} data-signed={signed || undefined}>
      <ChogIcon size={16} />
      <span className={`num ${styles.navNum}`}>{text}</span>
      {signed && <small className={styles.navUnit}>$CHOG</small>}
    </Link>
  );
}

/** The perks, unlocked ones lit and locked ones greyed with the balance needed. */
export function PerkList({ perks, signedIn }: { perks: PerkStatus[]; signedIn: boolean }) {
  return (
    <ul className={styles.perks}>
      {perks.map((p) => (
        <li key={p.id} data-locked={!p.unlocked || undefined}>
          <ChogIcon size={18} dim={!p.unlocked} />
          <div>
            <p className={styles.perkTitle}>
              <b>{p.title}</b> <span className={styles.perkTier}>{p.tier}</span>
            </p>
            <p className={styles.perkBlurb}>{p.blurb}</p>
            <p className={styles.perkNeed}>
              {p.unlocked ? (
                <span style={{ color: "var(--moss)" }}>✓ Unlocked</span>
              ) : signedIn ? (
                <>
                  Locked · hold <b className="num">{p.minBalance.toLocaleString()}</b> $CHOG ({p.needed.toLocaleString()} more)
                </>
              ) : (
                <>
                  Locked · hold <b className="num">{p.minBalance.toLocaleString()}</b> $CHOG
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The signed-in player's own balance and perk status, or a clear message when there's nothing to show. */
export function MyChog({ chog, compact = false, hideHead = false }: { chog: ChogState | null; compact?: boolean; hideHead?: boolean }) {
  const session = useSession();
  if (!chog || session.status === "loading") {
    return <p className="small muted">Checking your wallet…</p>;
  }
  if (!chog.signedIn) {
    return (
      <div className={styles.mine}>
        {!hideHead && <p className={styles.mineHead}>Your $CHOG</p>}
        <p className="small muted" style={{ margin: "0 0 8px" }}>
          Connect a wallet to see your balance and which perks you&apos;ve unlocked. The game works the same without one.
        </p>
        <button className="btn" onClick={() => void signIn()} disabled={session.status === "signing"}>
          {session.status === "signing" ? "Check wallet…" : "Connect wallet"}
        </button>
      </div>
    );
  }
  const unlocked = chog.perks.filter((p) => p.unlocked).length;
  return (
    <div className={styles.mine}>
      {!hideHead && <p className={styles.mineHead}>Your $CHOG</p>}
      {chog.balanceUnavailable ? (
        <p className="small" style={{ margin: 0 }}>
          Balance unavailable right now. Nothing is wrong with your wallet: try again in a moment.
        </p>
      ) : (
        <>
          <p className={styles.balance}>
            <ChogIcon size={22} /> <b className="num">{fmtChogFull(chog.balance)}</b> <span className="muted">$CHOG</span>
          </p>
          <p className="small" style={{ margin: "4px 0 0" }}>
            {unlocked > 0 ? (
              <>
                <b style={{ color: "var(--gold)" }}>{chog.tier}</b> · {unlocked} of {chog.perks.length} perks unlocked
              </>
            ) : (
              <>No perks yet. They start at {chog.perks[0]?.minBalance.toLocaleString()} $CHOG, and you don&apos;t need any to play.</>
            )}
          </p>
          {!compact && chog.effects.extraAttempts > 0 && (
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              +{chog.effects.extraAttempts} daily raid from your perks.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Landing page panel: one clear line, the perks, and the player's own status. */
export function ChogPanel() {
  const { chog, failed } = useChog();
  if (failed || (chog && !chog.enabled)) return null;
  return (
    <section className={styles.panel} aria-labelledby="chog-panel-title">
      <div className={styles.intro}>
        <h2 id="chog-panel-title" className={styles.title}>
          <ChogIcon size={26} /> $CHOG
        </h2>
        <p className={styles.line}>Hold $CHOG for perks. Pay with $CHOG for a bonus attempt.</p>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Entirely optional. Every room, raid and ranking works exactly the same without it.
        </p>
        <Link href="/chog" className="btn">
          How $CHOG works
        </Link>
      </div>
      <PerkList perks={chog?.perks ?? placeholderPerks} signedIn={!!chog?.signedIn} />
      <MyChog chog={chog} />
    </section>
  );
}

// Shown until the first response arrives, so the panel doesn't jump. Same numbers as the config.
const placeholderPerks = perksFor(0);

/** Live status for the /chog page: your balance, and every perk lit or greyed. */
export function ChogStatus() {
  const { chog, failed } = useChog();
  if (failed) return <p className="small muted">Live balance isn&apos;t available right now.</p>;
  return (
    <div className={styles.cols}>
      <MyChog chog={chog} hideHead />
      <PerkList perks={chog?.perks ?? placeholderPerks} signedIn={!!chog?.signedIn} />
    </div>
  );
}
