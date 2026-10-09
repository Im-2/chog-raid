"use client";

import { useState } from "react";
import { signIn, useSession } from "../wallet/session";
import styles from "./daily.module.css";

export type ChogState =
  | { enabled: false }
  | {
      enabled: true;
      simulated: true;
      token: string | null;
      fee: number;
      pool: { season: number; total: number; entrants: number };
      enteredToday: boolean;
      balance: string | null;
      lastSeason: {
        season: number;
        total: number;
        raider: { label: string; amount: number } | null;
        warden: { label: string; amount: number } | null;
      };
    };

/** The $CHOG prize pool panel. Clearly labeled as simulated: no tokens move. */
export function ChogPool({ state }: { state: Extract<ChogState, { enabled: true }> }) {
  const session = useSession();
  const [entered, setEntered] = useState(state.enteredToday);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/chog", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) setEntered(true);
    else setError(j.error ?? "Couldn't enter.");
  };

  return (
    <div className={styles.pool}>
      <p className={styles.poolHead}>
        <b>$CHOG prize pool</b> <span className="tag">Simulated</span>
      </p>
      <p className="small" style={{ margin: "4px 0" }}>
        Season {state.pool.season + 1} pool: <b className="num">{state.pool.total}</b> $CHOG from {state.pool.entrants} entrant
        {state.pool.entrants === 1 ? "" : "s"}. Paid to the season&apos;s top Raider and top Warden.
      </p>
      {session.address ? (
        entered ? (
          <p className="small" style={{ color: "var(--moss)", margin: "4px 0" }}>
            You&apos;re in today&apos;s pool.
          </p>
        ) : (
          <button className="btn" onClick={enter} disabled={busy}>
            Enter today for {state.fee} $CHOG
          </button>
        )
      ) : (
        <button className="btn" onClick={() => void signIn()}>
          Connect wallet to enter
        </button>
      )}
      {state.balance !== null && (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Your real $CHOG balance: <span className="num">{Number(state.balance).toFixed(2)}</span>
        </p>
      )}
      {error && <p className="small" style={{ color: "var(--blood)", margin: "4px 0 0" }}>{error}</p>}
      {state.lastSeason.total > 0 && (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Season {state.lastSeason.season + 1} payout: {state.lastSeason.raider?.label ?? "nobody"} and{" "}
          {state.lastSeason.warden?.label ?? "nobody"}, {state.lastSeason.total / 2} $CHOG each.
        </p>
      )}
      <p className={styles.disclaimer}>
        Simulated: entry fees and payouts are recorded by the game only. No $CHOG is transferred.
      </p>
    </div>
  );
}
