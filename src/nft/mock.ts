import { hashString } from "@/engine";
import { env } from "@/lib/env";
import { mockPixels, mockTraits } from "./mockArt";
import type { Address, Chog, NftAdapter } from "./types";

/** Tokens 1..MOCK_OWNED_COUNT belong to MOCK_OWNER_ADDRESS, so you can test defending. */
export const MOCK_OWNED_COUNT = 10;

export function createMockAdapter(): NftAdapter {
  const exists = (id: number) => Number.isInteger(id) && id >= 1 && id <= env.mockSupply;
  return {
    mode: "mock",
    async totalSupply() {
      return env.mockSupply;
    },
    async getChog(tokenId): Promise<Chog | null> {
      if (!exists(tokenId)) return null;
      return {
        tokenId,
        name: `Chog #${tokenId}`,
        image: `/api/chogs/${tokenId}/image`,
        traits: mockTraits(tokenId),
      };
    },
    async getPixels(tokenId) {
      return exists(tokenId) ? mockPixels(tokenId) : null;
    },
    async ownerOf(tokenId): Promise<Address | null> {
      if (!exists(tokenId)) return null;
      if (env.mockOwner && tokenId <= MOCK_OWNED_COUNT) return env.mockOwner;
      const h = hashString(`mock-owner:${tokenId}`).toString(16).padStart(8, "0");
      return `0x${h.repeat(5)}`;
    },
    async ownedBy(address) {
      const mine = env.mockOwner && env.mockOwner.toLowerCase() === address.toLowerCase();
      return mine ? Array.from({ length: Math.min(MOCK_OWNED_COUNT, env.mockSupply) }, (_, i) => i + 1) : [];
    },
  };
}
