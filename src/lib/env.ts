// Server-side env access. Nothing chain-specific is hardcoded; see .env.example.

import type { Address } from "@/nft/types";

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

const chogContract = optional("NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS") as Address | undefined;

export const env = {
  /** Defaults to onchain when a contract is configured, else mock. */
  nftAdapter: (optional("NFT_ADAPTER") ?? (chogContract ? "onchain" : "mock")) as "mock" | "onchain",
  chainId: Number(optional("NEXT_PUBLIC_CHAIN_ID") ?? 0),
  chainName: optional("NEXT_PUBLIC_CHAIN_NAME") ?? "Monad",
  rpcUrl: optional("NEXT_PUBLIC_RPC_URL"),
  chogContract,
  ipfsGateways: (optional("CHOG_IPFS_GATEWAYS") ?? "https://ipfs.filebase.io/ipfs/,https://gateway.pinata.cloud/ipfs/")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean),
  cacheDir: optional("CHOG_CACHE_DIR") ?? ".cache",
  /** Multicall3 (same address on most EVM chains, deployed on Monad). Used to scan holders. */
  multicall3: (optional("MULTICALL3_ADDRESS") ?? "0xcA11bde05977b3631167028862bE2a173976CA11") as Address,
  mockSupply: Number(optional("MOCK_SUPPLY") ?? 1969),
  mockOwner: optional("MOCK_OWNER_ADDRESS") as Address | undefined,
};

export function requireEnv(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required env var ${name}. See .env.example.`);
  return v;
}
