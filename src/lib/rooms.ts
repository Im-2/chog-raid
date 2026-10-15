import "server-only";
import { generateRoom, type Pixel, type Room } from "@/engine";
import { getNftAdapter, type Chog } from "@/nft";
import { getStore } from "@/server/store";

// Rooms are deterministic, so each one is generated once per server process.
const cache = new Map<number, Promise<{ chog: Chog; room: Room } | null>>();
const MAX_CACHED = 500;

/**
 * A room's inputs (metadata + 16x16 pixels) are also kept in the shared store, so a fresh
 * serverless instance can build the room in milliseconds instead of re-reading tokenURI and
 * downloading the artwork from IPFS. Bump the version if the downsampling ever changes.
 */
const INPUTS_VERSION = 1;
type RoomInputs = { chog: Chog; pixels: string };

const encode = (px: Pixel[]) => px.map(([r, g, b]) => ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")).join("");
const decode = (s: string): Pixel[] =>
  Array.from({ length: s.length / 6 }, (_, i) => {
    const n = parseInt(s.slice(i * 6, i * 6 + 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  });

async function build(tokenId: number): Promise<{ chog: Chog; room: Room } | null> {
  const adapter = getNftAdapter();
  const key = `room:v${INPUTS_VERSION}:${adapter.mode}:${tokenId}`;
  const store = getStore();
  const saved = await store.getKv<RoomInputs>(key).catch(() => null);
  if (saved) {
    const pixels = decode(saved.pixels);
    return { chog: saved.chog, room: generateRoom({ tokenId, pixels, traits: saved.chog.traits }) };
  }
  const [chog, pixels] = await Promise.all([adapter.getChog(tokenId), adapter.getPixels(tokenId)]);
  if (!chog || !pixels) return null;
  void store.setKv(key, { chog, pixels: encode(pixels) } satisfies RoomInputs).catch(() => {});
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
