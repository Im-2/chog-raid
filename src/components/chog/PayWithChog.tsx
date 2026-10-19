"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "../ui/Sheet";
import { ChogIcon } from "./ChogIcon";
import { applyPayment, PayError, sendChogPayment } from "./pay";
import { explorerUrl, refreshChog, type ChogState } from "./useChog";
import styles from "./chog.module.css";

type Step =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "confirming"; tx: string }
  | { kind: "done"; tx: string; allowed: number }
  | { kind: "error"; message: string; tx?: string };

/**
 * The optional "Pay with $CHOG" button, shown only to signed-in wallets when the payment is
 * configured. It's a quiet secondary action beside the free raid: free attempts stay the default.
 */
export function PayWithChog({ chog }: { chog: ChogState }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const p = chog.payment;
  if (!p || !chog.wallet) return null;
  const limitReached = p.boughtToday >= p.maxPerDay;
  const busy = step.kind === "sending" || step.kind === "confirming";

  const close = () => {
    if (busy) return;
    setOpen(false);
    setStep({ kind: "idle" });
  };

  const apply = async (tx: string) => {
    setStep({ kind: "confirming", tx });
    const r = await applyPayment(tx);
    if (r.ok) {
      setStep({ kind: "done", tx, allowed: r.allowed });
      void refreshChog();
    } else setStep({ kind: "error", message: r.error, tx });
  };

  const pay = async () => {
    setStep({ kind: "sending" });
    try {
      const tx = await sendChogPayment(p, chog.wallet!);
      await apply(tx);
    } catch (e) {
      setStep({ kind: "error", message: e instanceof PayError ? e.message : "The payment couldn't be sent." });
    }
  };

  const txUrl = (tx: string) => explorerUrl(chog.explorer, "tx", tx);

  return (
    <>
      <button className={`btn ${styles.payBtn}`} onClick={() => setOpen(true)} disabled={limitReached} title={limitReached ? "Bonus attempt limit reached for today" : undefined}>
        <ChogIcon size={14} /> Pay with $CHOG
      </button>
      {open &&
        createPortal(
      <Sheet open={open} onClose={close} title="Optional: bonus attempt">
        <div className={styles.paySheet}>
          {step.kind === "done" ? (
            <>
              <p className={styles.payOk}>✓ Bonus attempt unlocked</p>
              <p className="small">
                Your payment was verified on-chain. You now have <b className="num">{step.allowed}</b> counted attempts on today&apos;s Daily Raid.
              </p>
              {txUrl(step.tx) && (
                <p className="small">
                  <a href={txUrl(step.tx)!} target="_blank" rel="noreferrer">
                    View the transaction on the Monad explorer ↗
                  </a>
                </p>
              )}
              <button className="btn primary" onClick={() => (setOpen(false), setStep({ kind: "idle" }))}>
                Done
              </button>
            </>
          ) : (
            <>
              <p>
                Optional: pay <b className="num">{p.amount}</b> $CHOG for a bonus attempt.
              </p>
              <p className="small muted">
                This is a normal $CHOG transfer from your wallet, checked on-chain by the server. Free attempts are always available and don&apos;t need it. Up to {p.maxPerDay} a day.
              </p>
              {step.kind === "error" && (
                <p className="small" role="alert" style={{ color: "var(--blood)" }}>
                  {step.message}
                </p>
              )}
              {step.kind === "confirming" && (
                <p className="small" role="status">
                  Payment sent. Waiting for it to confirm on Monad…{" "}
                  {txUrl(step.tx) && (
                    <a href={txUrl(step.tx)!} target="_blank" rel="noreferrer">
                      View ↗
                    </a>
                  )}
                </p>
              )}
              <div className={styles.payActions}>
                {step.kind === "error" && step.tx ? (
                  <button className="btn primary" onClick={() => void apply(step.tx!)}>
                    Verify again
                  </button>
                ) : (
                  <button className="btn primary" onClick={() => void pay()} disabled={busy}>
                    {step.kind === "sending" ? "Confirm in your wallet…" : step.kind === "confirming" ? "Verifying…" : `Pay ${p.amount} $CHOG`}
                  </button>
                )}
                <button className="btn" onClick={close} disabled={busy}>
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </Sheet>,
          document.body,
        )}
    </>
  );
}
