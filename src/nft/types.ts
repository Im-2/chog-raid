import type { Pixel, Trait } from "@/engine";

export type Address = `0x${string}`;

export type Chog = {
  tokenId: number;
  name: string;
  /** Displayable image URL served by this app (/api/chogs/:id/image). */
  image: string;
  /** The metadata's own image field (e.g. ipfs://...), when onchain. */
  imageSource?: string;
  traits: Trait[];
};

/**
 * Everything the app needs from the NFT collection. Two implementations:
 * `mock` (generated Chogs, no chain) and `onchain` (real reads on Monad).
 * Selected by the NFT_ADAPTER env var.
 */
export interface NftAdapter {
  readonly mode: "mock" | "onchain";
  totalSupply(): Promise<number>;
  /** null if the token does not exist. */
  getChog(tokenId: number): Promise<Chog | null>;
  /** The Chog image downsampled to ROOM_SIZE x ROOM_SIZE, row-major. */
  getPixels(tokenId: number): Promise<Pixel[] | null>;
  /** Original artwork bytes (onchain only). */
  getImage?(tokenId: number): Promise<Buffer | null>;
  ownerOf(tokenId: number): Promise<Address | null>;
  /** Token ids held by an address (scans the collection; cached briefly). */
  ownedBy(address: string): Promise<number[]>;
}
