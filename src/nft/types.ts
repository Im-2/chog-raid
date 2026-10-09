import type { Pixel, Trait } from "@/engine";

export type Address = `0x${string}`;

export type Chog = {
  tokenId: number;
  name: string;
  /** Displayable image URL (http(s) or data:). */
  image: string;
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
  ownerOf(tokenId: number): Promise<Address | null>;
}
