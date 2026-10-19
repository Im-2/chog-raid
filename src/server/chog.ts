import "server-only";
// $CHOG, optional and real. See src/config/chog.ts for what exists and every number.
//
//   - balance + holder badge: an on-chain ERC-20 read.
//   - optional payment for a bonus daily attempt: the browser sends a normal ERC-20 transfer from
//     the player's wallet; this server verifies it on-chain (it never trusts the client), applies it
//     exactly once, and records the attempt.
//
// Free attempts are the default and the main path. (Season Rewards are in rewards.ts: the pool is the real balance of the pool address.)

import { cookies } from "next/headers";
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseAbi, parseUnits } from "viem";
import { CHOG, perkEffects } from "@/config/chog";
import { env } from "@/lib/env";
import { dayKey } from "./retention";
import { getStore } from "./store";
import type { Store } from "./store/types";

const lc = (s: string) => s.toLowerCase();

// ---------------------------------------------------------------- config (env)

/** Balance + perks: on unless explicitly turned off. */
export const chogEnabled = () => process.env.NEXT_PUBLIC_FEATURE_CHOG_TOKEN !== "false";
const asAddress = (v: string | undefined) => (v && isAddress(v.trim(), { strict: false }) ? (getAddress(v.trim()) as `0x${string}`) : null);
export const chogToken = () => asAddress(process.env.NEXT_PUBLIC_CHOG_TOKEN_ADDRESS);

/** The pool / payment address (CHOG_PRIZE_POOL_ADDRESS), or null when it isn't set. */
export const prizePoolAddress = () => asAddress(process.env.CHOG_PRIZE_POOL_ADDRESS);

export type PaymentConfig = { token: `0x${string}`; recipient: `0x${string}`; amount: number };

/**
 * The optional payment, or null when it should not be offered: it's switched off, the recipient
 * env var (CHOG_PRIZE_POOL_ADDRESS) isn't set or isn't an address, or there's no token address.
 * Callers hide the option on null instead of failing.
 */
export function paymentConfig(): PaymentConfig | null {
  if (process.env.CHOG_PAYMENTS_ENABLED === "false") return null;
  const recipient = asAddress(process.env.CHOG_PRIZE_POOL_ADDRESS);
  const token = chogToken();
  if (!recipient || !token) return null;
  const raw = process.env.CHOG_PAYMENT_AMOUNT?.trim();
  const amount = raw ? Number(raw) : CHOG.payment.defaultAmount;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { token, recipient, amount };
}

// ---------------------------------------------------------------- balance and holder badge

const balanceCache = new Map<string, { at: number; value: string | null }>();

/** Real $CHOG balance (whole tokens, as a string), or null when it can't be read. Cached for a minute. */
export async function chogBalance(wallet: string): Promise<string | null> {
  // Mock mode (never used in production) can fake a balance so the UI can be demoed offline:
  // a `mock_chog_balance` cookie, else the MOCK_CHOG_BALANCE env var.
  if (env.nftAdapter === "mock") {
    try {
      const c = (await cookies()).get("mock_chog_balance")?.value;
      if (c !== undefined && /^\d+(\.\d+)?$/.test(c)) return c;
    } catch {}
    if (process.env.MOCK_CHOG_BALANCE) return process.env.MOCK_CHOG_BALANCE;
  }
  const token = chogToken();
  if (!token || !env.rpcUrl) return null;
  const hit = balanceCache.get(lc(wallet));
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let value: string | null = null;
  try {
    const client = createPublicClient({ transport: http(env.rpcUrl) });
    const raw = await client.readContract({
      address: token,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [wallet as `0x${string}`],
    });
    value = formatUnits(raw, CHOG.decimals);
  } catch {
    value = null;
  }
  balanceCache.set(lc(wallet), { at: Date.now(), value });
  return value;
}

export const isHolder = (balance: string | null) => perkEffects(balance).badge;

// ---------------------------------------------------------------- bonus attempts

const payKey = (hash: string) => `chog:pay:${lc(hash)}`;
const slotKey = (day: string, wallet: string, n: number) => `chog:bonus:${day}:${lc(wallet)}:${n}`;

/** Paid bonus attempts this wallet has for `day` (each payment fills one slot). */
export async function bonusPayments(store: Store, wallet: string, day: string): Promise<number> {
  let n = 0;
  for (let i = 1; i <= CHOG.payment.maxPerDay; i++) {
    if (!(await store.getKv(slotKey(day, wallet, i)))) break;
    n++;
  }
  return n;
}

/**
 * Counted daily attempts a raider gets today: the free ones, plus an extra one for a perk
 * (`balance`) and one per paid bonus attempt (wallets only).
 */
export const allowedAttempts = (paid: number, balance: string | null = null) =>
  CHOG.daily.freeAttempts + paid * CHOG.payment.bonusAttempts + perkEffects(balance).extraAttempts;

// ---------------------------------------------------------------- on-chain verification

/** The few chain reads verification needs, so tests can supply a fake chain. */
export type ChainReader = {
  receipt(hash: `0x${string}`): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: { address: string; topics: readonly string[]; data: string }[];
  } | null>;
  latestBlock(): Promise<bigint>;
  blockTimestamp(blockNumber: bigint): Promise<number>;
  decimals(token: `0x${string}`): Promise<number>;
};

export function viemChain(rpcUrl: string): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    async receipt(hash) {
      try {
        const r = await client.getTransactionReceipt({ hash });
        return { status: r.status, blockNumber: r.blockNumber, logs: r.logs.map((l) => ({ address: l.address, topics: l.topics as string[], data: l.data })) };
      } catch (e) {
        if ((e as Error).name === "TransactionReceiptNotFoundError") return null;
        throw e;
      }
    },
    latestBlock: () => client.getBlockNumber(),
    blockTimestamp: async (n) => Number((await client.getBlock({ blockNumber: n })).timestamp),
    async decimals(token) {
      try {
        return Number(await client.readContract({ address: token, abi: parseAbi(["function decimals() view returns (uint8)"]), functionName: "decimals" }));
      } catch {
        return CHOG.decimals;
      }
    },
  };
}

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topicAddress = (t: string | undefined) => (t && /^0x0{24}[0-9a-fA-F]{40}$/.test(t) ? lc(`0x${t.slice(26)}`) : null);

export type PayResult =
  | { ok: true; paid: number; allowed: number }
  | { ok: false; status: number; code: "bad_hash" | "not_available" | "pending" | "mismatch" | "reused" | "limit"; error: string };

const fail = (status: number, code: Extract<PayResult, { ok: false }>["code"], error: string): PayResult => ({ ok: false, status, code, error });

/**
 * Verify a payment on-chain and, if it checks out, grant one bonus daily attempt. Every check is
 * made here against the chain, never against what the browser says:
 *
 *   - the transaction exists, succeeded, and is buried under CHOG.payment.confirmations blocks;
 *   - it is recent (CHOG.payment.maxAgeHours);
 *   - it contains a Transfer event emitted by the real $CHOG token, FROM the signed-in wallet,
 *     TO the configured recipient, for at least the configured amount;
 *   - it has never been used before: the transaction hash is claimed with an atomic insert, so a
 *     replay (same hash again, from any wallet, even racing requests) is refused;
 *   - the wallet is under its daily limit.
 */
export async function verifyPayment(
  input: { txHash: unknown; wallet: string },
  deps: { chain: ChainReader; store?: Store; config?: PaymentConfig | null; now?: Date },
): Promise<PayResult> {
  const store = deps.store ?? getStore();
  const cfg = deps.config === undefined ? paymentConfig() : deps.config;
  const now = deps.now ?? new Date();
  if (!cfg) return fail(404, "not_available", "Payments aren't available.");
  const hash = typeof input.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(input.txHash) ? (lc(input.txHash) as `0x${string}`) : null;
  if (!hash) return fail(400, "bad_hash", "That doesn't look like a transaction hash.");

  const day = dayKey(now);
  const paid = await bonusPayments(store, input.wallet, day);
  if (paid >= CHOG.payment.maxPerDay) return fail(429, "limit", `You've used the ${CHOG.payment.maxPerDay} bonus attempts available today.`);
  // Cheap early exit; the atomic insert below is what actually guarantees single use.
  if (await store.getKv(payKey(hash))) return fail(409, "reused", "This payment was already used.");

  const receipt = await deps.chain.receipt(hash);
  if (!receipt) return fail(409, "pending", "Waiting for the transaction to be confirmed.");
  if (receipt.status !== "success") return fail(402, "mismatch", "That transaction failed on-chain.");
  const latest = await deps.chain.latestBlock();
  if (latest - receipt.blockNumber + 1n < BigInt(CHOG.payment.confirmations)) return fail(409, "pending", "Waiting for more confirmations.");
  const ageMs = now.getTime() - (await deps.chain.blockTimestamp(receipt.blockNumber)) * 1000;
  if (ageMs > CHOG.payment.maxAgeHours * 3_600_000) return fail(402, "mismatch", "That payment is too old to use.");

  const need = parseUnits(String(cfg.amount), await deps.chain.decimals(cfg.token));
  const ok = receipt.logs.some((l) => {
    if (lc(l.address) !== lc(cfg.token) || lc(l.topics[0] ?? "") !== TRANSFER_TOPIC || l.topics.length !== 3) return false;
    if (topicAddress(l.topics[1]) !== lc(input.wallet) || topicAddress(l.topics[2]) !== lc(cfg.recipient)) return false;
    return /^0x[0-9a-fA-F]{64}$/.test(l.data) && BigInt(l.data) >= need;
  });
  if (!ok) return fail(402, "mismatch", `No transfer of at least ${cfg.amount} $CHOG from your wallet to the recipient in that transaction.`);

  // Claim the hash. Of any racing requests with this hash, exactly one gets true.
  if (!(await store.insertKv(payKey(hash), { wallet: lc(input.wallet), day, amount: cfg.amount, block: String(receipt.blockNumber), at: now.toISOString() }))) {
    return fail(409, "reused", "This payment was already used.");
  }
  // Fill the first free bonus slot for today (also atomic).
  for (let n = 1; n <= CHOG.payment.maxPerDay; n++) {
    if (await store.insertKv(slotKey(day, input.wallet, n), { tx: hash, at: now.toISOString() })) {
      return { ok: true, paid: n, allowed: allowedAttempts(n) };
    }
  }
  return fail(429, "limit", `You've used the ${CHOG.payment.maxPerDay} bonus attempts available today.`);
}
