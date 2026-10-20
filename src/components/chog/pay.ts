"use client";

import { encodeFunctionData, parseAbi, toHex } from "viem";
import { getWalletProvider } from "../wallet/session";
import type { ChogPayment } from "./useChog";

const ERC20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

export class PayError extends Error {}

/**
 * Ask the player's own wallet to send an ordinary ERC-20 transfer of $CHOG to the configured
 * recipient. No custom contract, no server-side signing, no keys here: the wallet signs and sends.
 * Returns the transaction hash; the server then verifies it on-chain before anything is granted.
 */
export async function sendChogPayment(p: ChogPayment, from: string): Promise<`0x${string}`> {
  const provider = await getWalletProvider();
  if (!provider) throw new PayError("Your wallet isn't connected. Press Connect, pick your wallet, then try again.");
  const req = (method: string, params?: unknown[]) => provider.request({ method, params });
  try {
    const [account] = (await req("eth_accounts")) as string[];
    if (!account || account.toLowerCase() !== from.toLowerCase()) {
      throw new PayError(`Switch your wallet to ${from.slice(0, 6)}…${from.slice(-4)}, the account you signed in with.`);
    }
    const chainId = Number(await req("eth_chainId"));
    if (chainId !== p.chainId) {
      const hex = toHex(p.chainId);
      try {
        await req("wallet_switchEthereumChain", [{ chainId: hex }]);
      } catch (e) {
        if ((e as { code?: number }).code !== 4902 || !p.rpcUrl) throw e;
        await req("wallet_addEthereumChain", [
          { chainId: hex, chainName: p.chainName, nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: [p.rpcUrl] },
        ]);
      }
    }
    const data = encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [p.recipient as `0x${string}`, BigInt(p.amountWei)] });
    return (await req("eth_sendTransaction", [{ from: account, to: p.token, data, value: "0x0" }])) as `0x${string}`;
  } catch (e) {
    if (e instanceof PayError) throw e;
    const err = e as { code?: number; message?: string };
    if (err.code === 4001) throw new PayError("Payment cancelled. Nothing was sent.");
    throw new PayError(err.message?.split("\n")[0] || "The wallet couldn't send the payment.");
  }
}

export type ApplyResult = { ok: true; allowed: number } | { ok: false; error: string };

/** Ask the server to verify the transaction on-chain and apply it, waiting while it confirms. */
export async function applyPayment(txHash: string, onWaiting?: () => void): Promise<ApplyResult> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    let r: Response;
    try {
      r = await fetch("/api/chog/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash }) });
    } catch {
      return { ok: false, error: "Couldn't reach the server. Your payment is safe on-chain; try again in a moment." };
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, allowed: j.allowed };
    if (j.code === "pending" && Date.now() < deadline) {
      onWaiting?.();
      await new Promise((res) => setTimeout(res, 2500));
      continue;
    }
    if (j.code === "pending") return { ok: false, error: "Still waiting for confirmations. Press Verify again in a minute." };
    return { ok: false, error: j.error ?? "The payment couldn't be verified." };
  }
}
