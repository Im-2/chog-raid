import type { NftAdapter } from "./types";

/**
 * Real reads from the Chog collection on Monad (tokenURI, metadata JSON, ownerOf).
 * Implemented once the NFT contract address is known.
 */
export function createOnchainAdapter(): NftAdapter {
  throw new Error(
    "NFT_ADAPTER=onchain is not implemented yet. Set NFT_ADAPTER=mock until the Chog contract address is configured.",
  );
}
