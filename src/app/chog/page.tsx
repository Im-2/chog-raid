import type { Metadata } from "next";
import Link from "next/link";
import { CHOG } from "@/config/chog";
import { REWARDS } from "@/config/rewards";
import { ChogStatus } from "@/components/chog/ChogBits";
import { ChogIcon } from "@/components/chog/ChogIcon";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteNav } from "@/components/ui/SiteNav";
import { env } from "@/lib/env";
import { chogToken, paymentConfig } from "@/server/chog";
import { poolState } from "@/server/rewards";
import styles from "@/components/chog/chog.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "$CHOG · Chog Raid",
  description: "What $CHOG does in Chog Raid: optional perks for holders and an optional on-chain payment for a bonus attempt. Never required.",
};

export default async function ChogPage() {
  const token = chogToken();
  const explorer = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.replace(/\/$/, "");
  const amount = paymentConfig()?.amount ?? CHOG.payment.defaultAmount;
  const paymentOn = !!paymentConfig();
  const pool = await poolState();
  const money = (n: string | number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(Number(n));
  const half = Math.round(REWARDS.split.wardens * 100);
  const band = (b: { from: number; to: number }) => (b.from === b.to ? `Rank ${b.from}` : `Ranks ${b.from}–${b.to}`);

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

        <section data-reveal className={styles.card} aria-labelledby="your-chog">
          <h2 id="your-chog">Your $CHOG</h2>
          <ChogStatus />
        </section>

        <section data-reveal className={styles.card} aria-labelledby="does">
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

        <section data-reveal className={styles.card} aria-labelledby="real">
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
                <li>
                  <b>The season reward pool.</b> Its size is the real $CHOG balance of the pool address, read the same way. It is never estimated or padded.
                </li>
              </ul>
            </div>
            <div className={styles.notReal}>
              <h3>What this is not</h3>
              <ul>
                <li>
                  <b>Not automatic or guaranteed.</b> Season Rewards depend on the pool being funded, and today it is {pool.state === "funded" ? "funded, but payouts are still manual and not guaranteed" : "not funded"}. Nothing is claimable.
                </li>
                <li>No custom smart contract, no escrow, no staking.</li>
                <li>No private keys and no server-side signing: the server only reads the chain.</li>
                <li>Nothing is required to play, defend or rank.</li>
              </ul>
            </div>
          </div>
        </section>

        <section data-reveal className={styles.card} id="rules" aria-labelledby="rules-title">
          <h2 id="rules-title">Rules</h2>

          <h3 className={styles.h3}>Season Rewards</h3>
          <p>
            <b>Status today:</b>{" "}
            {pool.state === "funded"
              ? `the pool holds ${money(pool.balance ?? 0)} $CHOG. Shares shown in the game are projections until the season ends.`
              : pool.state === "unavailable"
                ? "the pool balance couldn't be read just now. Rewards activate when the pool is funded."
                : "the pool is not funded yet. Rewards activate when the pool is funded, and until then nothing is claimable."}
          </p>
          <ul className="plain">
            <li>
              <b>How ranking works.</b> Each weekly season has two leaderboards, Wardens (defenders, who score when raiders fail in their room) and Raiders (who score for clears). Points work as they always have.
              Each board&apos;s top <span className="num">{REWARDS.topN}</span> eligible wallets share that board&apos;s half of the pool: the pool is split{" "}
              <span className="num">{half}</span>/<span className="num">{100 - half}</span> between the two boards.
            </li>
            <li>
              <b>The shape of the split</b>, as a percentage of one board&apos;s half:{" "}
              {REWARDS.bands.map((b, k) => (
                <span key={b.from}>
                  {k > 0 && "; "}
                  {band(b)} <span className="num">{b.pct}%</span>
                  {b.to > b.from ? " shared equally" : ""}
                </span>
              ))}
              . Players tied on points split the places they occupy.
            </li>
            <li>
              <b>Where the pool comes from.</b> It is the real $CHOG balance of the pool address{pool.address && explorer ? (
                <>
                  {" "}
                  (<a href={`${explorer}/address/${pool.address}`} target="_blank" rel="noreferrer">
                    view it ↗
                  </a>
                  )
                </>
              ) : null}
              . Optional Daily Raid payments are sent to that address, and anyone can add to it. We may show a planned target, always labeled &quot;Target (not yet funded)&quot; and never added to the balance.
            </li>
            <li>
              <b>Eligibility.</b> Only wallets can be paid, so guests appear on the boards but aren&apos;t ranked for rewards. A wallet counts once per board. Raiders need at least{" "}
              <span className="num">{REWARDS.eligibility.raiderMinRoomsCleared}</span> different rooms cleared in the season. Wardens: points on a Chog count only if the wallet still holds that Chog when the season ends. We re-check ownership on-chain at the final snapshot, so a Chog sold mid-season takes its points with it.
            </li>
            <li>
              <b>Fair play.</b> Raids played at impossible speed (more than <span className="num">{REWARDS.antiAbuse.maxMovesPerSecond}</span> moves a second), the same long move sequence from{" "}
              <span className="num">{REWARDS.antiAbuse.identicalSequence.minWallets}</span> or more wallets on one room, and rooms whose failed raids come from just a couple of wallets over and over are flagged. Flagged raids, wallets and rooms are excluded from rewards pending review by the team. That is a review, not a ban.
            </li>
            <li>
              <b>When and how rewards are paid.</b> When a season ends (Monday 00:00 UTC), a final ranking snapshot is saved: each wallet&apos;s rank, points, share and the pool balance at that moment. If the pool is funded, the team pays out <b>manually</b> after the season ends, after verifying the snapshot, to the wallet that earned the rank, and publishes the results. Nothing is sent automatically, there is nothing to claim, and no amount is guaranteed: it depends on what the pool holds. If the pool is empty, nothing is paid.
            </li>
            <li>
              <b>Never required.</b> You can play, defend and climb the boards without holding or paying any $CHOG.
            </li>
          </ul>

          <h3 className={styles.h3} style={{ marginTop: 14 }}>Daily attempts and payments</h3>
          <ul className="plain">
            <li>
              The Daily Raid counts your first <b className="num">{CHOG.daily.freeAttempts}</b> finished attempts each day toward the daily board. Further attempts are still playable.
            </li>
            <li>
              One payment buys <b className="num">{CHOG.payment.bonusAttempts}</b> bonus attempt, up to <span className="num">{CHOG.payment.maxPerDay}</span> a day. The Believer perk adds one more counted attempt.
            </li>
            <li>The payment option is {paymentOn ? `on: ${amount} $CHOG per bonus attempt, for signed-in wallets` : "not switched on right now"}. It sits beside the free Raid button and never replaces it.</li>
            <li>
              A payment is accepted after <span className="num">{CHOG.payment.confirmations}</span> confirmations and within <span className="num">{CHOG.payment.maxAgeHours}</span> hours, and a transaction can never be reused.
            </li>
            <li>If the chain can&apos;t be read when you pay, nothing is granted and nothing is lost: try verifying again.</li>
            <li>Perks never change a room&apos;s difficulty, the points a clear earns, or any other player&apos;s results.</li>
          </ul>
        </section>

        <section data-reveal className={styles.card} aria-labelledby="contract">
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
