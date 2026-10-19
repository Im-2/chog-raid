import type { Metadata } from "next";
import Link from "next/link";
import { CHOG } from "@/config/chog";
import { ChogStatus } from "@/components/chog/ChogBits";
import { ChogIcon } from "@/components/chog/ChogIcon";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteNav } from "@/components/ui/SiteNav";
import { env } from "@/lib/env";
import { chogToken, paymentConfig } from "@/server/chog";
import styles from "@/components/chog/chog.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "$CHOG · Chog Raid",
  description: "What $CHOG does in Chog Raid: optional perks for holders and an optional on-chain payment for a bonus attempt. Never required.",
};

export default function ChogPage() {
  const token = chogToken();
  const explorer = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.replace(/\/$/, "");
  const amount = paymentConfig()?.amount ?? CHOG.payment.defaultAmount;
  const paymentOn = !!paymentConfig();

  return (
    <>
      <SiteNav />
      <main className={styles.page}>
        <h1>
          <ChogIcon size={36} /> $CHOG
        </h1>
        <p className={styles.lede}>
          $CHOG is an optional bonus layer. Chog Raid is built on Chog Genesis NFTs and is fully playable without it: no room, raid, trap or ranking
          ever requires $CHOG.
        </p>

        <section className={styles.card} aria-labelledby="your-chog">
          <h2 id="your-chog">Your $CHOG</h2>
          <ChogStatus />
        </section>

        <section className={styles.card} aria-labelledby="does">
          <h2 id="does">What $CHOG does in the game</h2>
          <p>
            <b>Hold it for perks.</b> Your wallet&apos;s $CHOG balance unlocks cosmetic and convenience perks, in tiers:
          </p>
          <ul className="plain">
            {CHOG.perks.map((p) => (
              <li key={p.id}>
                <b>{p.title}</b> ({p.tier}, <span className="num">{p.minBalance.toLocaleString()}</span> $CHOG): {p.blurb}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 8 }}>
            <b>Pay with it for a bonus attempt.</b> Optional: pay <span className="num">{amount}</span> $CHOG for a bonus attempt on the Daily Raid. Free attempts are always the
            default.
          </p>
        </section>

        <section className={styles.card} aria-labelledby="real">
          <h2 id="real">What is real on-chain</h2>
          <div className={styles.cols}>
            <div className={styles.real}>
              <h3>Real</h3>
              <ul>
                <li>
                  <b>Balance reads.</b> Your $CHOG balance is read straight from the token contract on Monad (<code>balanceOf</code>). Perks come from that number.
                </li>
                <li>
                  <b>Payment verification.</b> When you pay, your own wallet sends a normal $CHOG transfer. The server then reads the transaction receipt and checks:
                  the Transfer event came from the real $CHOG contract, the sender is the wallet you signed in with, the recipient and the amount match, and it is
                  confirmed. Each transaction can be used once.
                </li>
              </ul>
            </div>
            <div className={styles.notReal}>
              <h3>Not part of this game</h3>
              <ul>
                <li>No prizes, rewards or payouts, and no prize pool.</li>
                <li>No custom smart contract, no escrow, no staking.</li>
                <li>No private keys and no server-side signing: the server only reads the chain.</li>
                <li>Nothing is required to play, defend or rank.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="rules">
          <h2 id="rules">The rules</h2>
          <ul className="plain">
            <li>
              The Daily Raid counts your first <b className="num">{CHOG.daily.freeAttempts}</b> finished attempts each day toward the daily board. Further attempts are still playable.
            </li>
            <li>
              One payment buys <b className="num">{CHOG.payment.bonusAttempts}</b> bonus attempt, up to <span className="num">{CHOG.payment.maxPerDay}</span> a day. The Believer perk adds one more counted attempt.
            </li>
            <li>The payment option is {paymentOn ? `on: ${amount} $CHOG per bonus attempt, for signed-in wallets` : "not switched on right now"}. It sits beside the free Raid button and never replaces it.</li>
            <li>A payment is accepted after <span className="num">{CHOG.payment.confirmations}</span> confirmations and within <span className="num">{CHOG.payment.maxAgeHours}</span> hours, and a transaction can never be reused.</li>
            <li>If the chain can&apos;t be read when you pay, nothing is granted and nothing is lost: try verifying again.</li>
            <li>Perks never change a room&apos;s difficulty, the points a clear earns, or any other player&apos;s results.</li>
          </ul>
        </section>

        <section className={styles.card} aria-labelledby="contract">
          <h2 id="contract">The token</h2>
          <p>
            $CHOG is an <span className="num">ERC-20</span> on {env.chainName} (chain <span className="num">{env.chainId || 143}</span>).
          </p>
          {token ? (
            <div className={styles.contract}>
              <code className={styles.addr}>{token}</code>
              {explorer && (
                <a href={`${explorer}/token/${token}`} target="_blank" rel="noreferrer">
                  View on the explorer ↗
                </a>
              )}
            </div>
          ) : (
            <p className="small muted">The token address isn&apos;t configured on this server.</p>
          )}
        </section>

        <p>
          <Link href="/" className="btn primary">
            Back to the dungeon
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
