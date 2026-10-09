import "server-only";
import { generateRoom, type Room } from "@/engine";
import { getNftAdapter, type Chog } from "@/nft";

// Rooms are deterministic, so each one is generated once per server process.
const cache = new Map<number, Promise<{ chog: Chog; room: Room } | null>>();
const MAX_CACHED = 500;

async function build(tokenId: number): Promise<{ chog: Chog; room: Room } | null> {
  const adapter = getNftAdapter();
  const [chog, pixels] = await Promise.all([adapter.getChog(tokenId), adapter.getPixels(tokenId)]);
  if (!chog || !pixels) return null;
  return { chog, room: generateRoom({ tokenId, pixels, traits: chog.traits }) };
}

/** Build a Chog's room from the adapter. Same Chog => same room, on any server. */
export function loadRoom(tokenId: number): Promise<{ chog: Chog; room: Room } | null> {
  if (!Number.isInteger(tokenId) || tokenId < 1) return Promise.resolve(null);
  let p = cache.get(tokenId);
  if (!p) {
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    p = build(tokenId);
    cache.set(tokenId, p);
    p.catch(() => cache.delete(tokenId));
  }
  return p;
}
