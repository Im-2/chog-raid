import "server-only";
import { generateRoom, type Room } from "@/engine";
import { getNftAdapter, type Chog } from "@/nft";

/** Build a Chog's room from the adapter. Same Chog => same room, on any server. */
export async function loadRoom(tokenId: number): Promise<{ chog: Chog; room: Room } | null> {
  if (!Number.isInteger(tokenId) || tokenId < 1) return null;
  const adapter = getNftAdapter();
  const [chog, pixels] = await Promise.all([adapter.getChog(tokenId), adapter.getPixels(tokenId)]);
  if (!chog || !pixels) return null;
  return { chog, room: generateRoom({ tokenId, pixels, traits: chog.traits }) };
}
