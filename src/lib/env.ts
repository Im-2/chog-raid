// Server-side env access. Nothing chain-specific is hardcoded; see .env.example.

import type { Address } from "@/nft/types";

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export const env = {
  nftAdapter: (optional("NFT_ADAPTER") ?? "mock") as "mock" | "onchain",
  chainId: Number(optional("NEXT_PUBLIC_CHAIN_ID") ?? 0),
  chainName: optional("NEXT_PUBLIC_CHAIN_NAME") ?? "Monad",
  rpcUrl: optional("NEXT_PUBLIC_RPC_URL"),
  chogContract: optional("NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS") as Address | undefined,
  metadataGateway: optional("CHOG_METADATA_GATEWAY"),
  mockSupply: Number(optional("MOCK_SUPPLY") ?? 4444),
  mockOwner: optional("MOCK_OWNER_ADDRESS") as Address | undefined,
};

export function requireEnv(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required env var ${name}. See .env.example.`);
  return v;
}
