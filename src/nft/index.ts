import "server-only";
import { env } from "@/lib/env";
import { createMockAdapter } from "./mock";
import { createOnchainAdapter } from "./onchain";
import type { NftAdapter } from "./types";

let adapter: NftAdapter | undefined;

/** The configured NFT data source. Switch with NFT_ADAPTER=mock|onchain. */
export function getNftAdapter(): NftAdapter {
  adapter ??= env.nftAdapter === "onchain" ? createOnchainAdapter() : createMockAdapter();
  return adapter;
}

export type { Chog, NftAdapter, Address } from "./types";
