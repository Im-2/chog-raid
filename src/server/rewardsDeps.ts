import "server-only";
import { getNftAdapter } from "@/nft";
import { poolState, type SnapshotDeps } from "./rewards";
import { getStore } from "./store";

/** Real dependencies for the season snapshot: the store, every finished raid, the chain for ownership, the live pool. */
export async function snapshotDeps(): Promise<SnapshotDeps> {
  const store = getStore();
  const adapter = getNftAdapter();
  return {
    store,
    loadRaids: () => store.listFinishedRaids(50_000),
    supply: await adapter.totalSupply(),
    ownerOf: (tokenId) => adapter.ownerOf(tokenId),
    pool: poolState,
  };
}
