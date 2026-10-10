"use client";

import { chogName, chogNumber, tokenIdForNumber } from "@/lib/names";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InlineState } from "@/components/ui/StateScreen";
import { SessionError } from "@/components/wallet/WalletButton";
import { SiteNav } from "@/components/ui/SiteNav";
import { WardenPanel } from "@/components/progress/WardenPanel";
import { shortAddress, signIn, useSession } from "@/components/wallet/session";
import styles from "../home.module.css";
import grid from "@/components/home/home.module.css";

type Mine = { tokenId: number; image: string; tier: string | null; defended: boolean; traps: number; daysHeld: number | null };

export default function DefendStart() {
  const router = useRouter();
  const session = useSession();
  const [id, setId] = useState("");
  const [mine, setMine] = useState<{ status: "idle" | "loading" | "ready" | "error"; chogs: Mine[] }>({ status: "idle", chogs: [] });

  useEffect(() => {
    if (!session.address) return setMine({ status: "idle", chogs: [] });
    let cancelled = false;
    setMine({ status: "loading", chogs: [] });
    fetch("/api/me/chogs", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (!cancelled) setMine({ status: "ready", chogs: j.chogs });
      })
      .catch(() => !cancelled && setMine({ status: "error", chogs: [] }));
    return () => {
      cancelled = true;
    };
  }, [session.address]);

  return (
    <>
      <SiteNav />
      <main className="container">
        <section className={styles.hero} style={{ paddingBottom: 24 }}>
          <h1 className={styles.headline} style={{ fontSize: "clamp(34px, 7vw, 56px)" }}>
            Defend <span>your Chog</span>
          </h1>
          <p className={styles.pitch}>
            Your Chog&apos;s room fights for you while you&apos;re offline. Place traps in its slots, test the room, and
            watch who gets through.
          </p>
          {!session.address && session.status !== "loading" && (
            <>
              <button className="btn primary" onClick={() => void signIn()} disabled={session.status === "signing"} style={{ minWidth: 240 }}>
                {session.status === "signing" ? "Check your wallet…" : "Connect wallet to defend"}
              </button>
              <SessionError />
              <p className="small muted" style={{ marginTop: 14 }}>
                You&apos;ll sign a message to prove you hold the wallet. No gas, no transaction.
              </p>
            </>
          )}
        </section>

        {session.address && <WardenPanel />}

        {session.address && (
          <section>
            <h2 className={grid.h2} style={{ marginBottom: 12 }}>
              Your Chogs <span className="muted small num">{shortAddress(session.address)}</span>
            </h2>
            <div className={grid.grid}>
              {mine.status === "loading" &&
                Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className={`${grid.card} ${grid.cardSkeleton}`} aria-hidden>
                    <div className="skeleton" />
                    <span className="skeleton" />
                  </div>
                ))}
              {mine.status === "error" && (
                <InlineState kind="error" title="Couldn't read your Chogs" body="Monad RPC didn't answer. Try again in a moment." />
              )}
              {mine.status === "ready" && mine.chogs.length === 0 && (
                <InlineState
                  kind="empty"
                  title="No Chogs in this wallet"
                  body="Only Chog holders can defend a room. You can still raid every room, or draft a defense below."
                  action={
                    <Link className="btn primary" href="/raid" prefetch={false}>
                      Raid a random room
                    </Link>
                  }
                />
              )}
              {mine.chogs.map((c) => (
                <Link key={c.tokenId} href={`/room/${c.tokenId}/defend`} className={grid.card}>
                  <div className={grid.art}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${c.image}?s=256`} alt={chogName(c.tokenId)} className="pixel" loading="lazy" />
                    <span className={grid.tier} style={c.defended ? undefined : { color: "var(--torch)" }}>
                      {c.defended ? `Held ${c.daysHeld ?? 0}d · ${c.traps} traps` : "Undefended"}
                    </span>
                  </div>
                  <div className={grid.cardFoot}>
                    <b>{chogNumber(c.tokenId)}</b>
                    <span className="small">{c.defended ? "Edit" : "Defend"} →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section style={{ maxWidth: 420, margin: "40px auto 0", textAlign: "center" }}>
          <p className="small muted">Or open any Chog&apos;s armory to draft and test a defense (only its holder can save it):</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d+$/.test(id)) router.push(`/room/${tokenIdForNumber(id) ?? id}/defend`);
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              type="text"
              inputMode="numeric"
              placeholder="CHOG # (as on OpenSea)"
              aria-label="CHOG number, as shown on OpenSea"
              value={id}
              onChange={(e) => setId(e.target.value.replace(/[^\d]/g, ""))}
              required
            />
            <button className="btn" type="submit">
              Open
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
