// The chain the game runs on, from env (NEXT_PUBLIC_*, inlined at build time). Nothing is hardcoded
// apart from Monad mainnet's id as a last-resort default.

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 143;
export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME || "Monad";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || "https://monadscan.com").replace(/\/$/, "");
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

/**
 * Asks the configured RPC which chain it serves and compares it with NEXT_PUBLIC_CHAIN_ID, so a
 * wrong URL or id is caught early with a clear console message instead of as a confusing wallet error.
 */
export async function verifyRpcChain(): Promise<boolean> {
  if (!RPC_URL) {
    console.error("[wallet] NEXT_PUBLIC_RPC_URL is not set: the wallet can't add or read the game chain.");
    return false;
  }
  try {
    const r = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const served = Number.parseInt((await r.json()).result, 16);
    if (served !== CHAIN_ID) {
      console.error(`[wallet] RPC chain mismatch: ${RPC_URL} serves chain ${served}, but NEXT_PUBLIC_CHAIN_ID is ${CHAIN_ID}.`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[wallet] Couldn't reach NEXT_PUBLIC_RPC_URL to verify the chain.", e);
    return false;
  }
}
