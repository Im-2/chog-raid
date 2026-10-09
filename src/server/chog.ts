import "server-only";
// $CHOG prize pool for the daily raid. Behind NEXT_PUBLIC_FEATURE_CHOG_TOKEN (off by default).
//
// REAL:      the player's $CHOG balance is read from the ERC-20 contract on Monad (read-only).
// SIMULATED: entry fees and payouts are entries in this app's own ledger. No tokens are
//            transferred, escrowed or paid. A real version needs an audited escrow contract.

import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { RETENTION } from "@/config/retention";
import { env } from "@/lib/env";
import { getStore } from "./store";

export const chogEnabled = () => process.env.NEXT_PUBLIC_FEATURE_CHOG_TOKEN === "true";
export const chogToken = () => (process.env.NEXT_PUBLIC_CHOG_TOKEN_ADDRESS?.trim() || null) as `0x${string}` | null;

type Entry = { wallet: string; day: string; amount: number; at: string };
type Ledger = { entries: Entry[] };
const key = (season: number) => `chog:pool:${season}`;

export async function poolFor(season: number) {
  const ledger = (await getStore().getKv<Ledger>(key(season))) ?? { entries: [] };
  return { season, total: ledger.entries.reduce((s, e) => s + e.amount, 0), entries: ledger.entries };
}

/** Real $CHOG balance (whole tokens, as a string), or null when it can't be read. */
export async function chogBalance(wallet: string): Promise<string | null> {
  const token = chogToken();
  if (!token || !env.rpcUrl) return null;
  try {
    const client = createPublicClient({ transport: http(env.rpcUrl) });
    const raw = await client.readContract({
      address: token,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [wallet as `0x${string}`],
    });
    return formatUnits(raw, RETENTION.chog.decimals);
  } catch {
    return null;
  }
}

/** Record a (simulated) daily-raid entry fee. One per wallet per day. */
export async function enterDaily(wallet: string, day: string, season: number): Promise<{ ok: boolean; error?: string }> {
  const ledger = (await getStore().getKv<Ledger>(key(season))) ?? { entries: [] };
  if (ledger.entries.some((e) => e.day === day && e.wallet.toLowerCase() === wallet.toLowerCase())) return { ok: true };
  if (env.nftAdapter === "onchain") {
    const bal = await chogBalance(wallet);
    if (bal !== null && Number(bal) < RETENTION.chog.dailyEntryFee) {
      return { ok: false, error: `You need ${RETENTION.chog.dailyEntryFee} $CHOG to enter (you have ${Number(bal).toFixed(2)}).` };
    }
  }
  ledger.entries.push({ wallet, day, amount: RETENTION.chog.dailyEntryFee, at: new Date().toISOString() });
  await getStore().setKv(key(season), ledger);
  return { ok: true };
}
