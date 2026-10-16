import "server-only";
import { generateRoom, type Pixel, type Room } from "@/engine";
import { getNftAdapter, type Chog } from "@/nft";
import { getStore } from "@/server/store";
import bundled from "@/data/room-inputs.json";
import { env } from "@/lib/env";

type Bundled = { contract: string; rooms: Record<string, [name: string, image: string, traits: [string, string][], pixels: string]> };
const BUNDLE = bundled as unknown as Bundled;

/**
 * Every Chog Genesis room's inputs ship with the server (src/data/room-inputs.json, built by
 * scripts/build-room-inputs.mts), so on the real collection a room is built with no network calls.
 * Used only when the app points at the contract the bundle was built from.
 */
function fromBundle(tokenId: number): { chog: Chog; pixels: Pixel[] } | null {
  if (getNftAdapter().mode !== "onchain" || env.chogContract?.toLowerCase() !== BUNDLE.contract) return null;
  const row = BUNDLE.rooms[tokenId];
  if (!row) return null;
  const [name, image, traits, b64] = row;
  const raw = Buffer.from(b64, "base64");
  const pixels: Pixel[] = Array.from({ length: raw.length / 3 }, (_, i) => [raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]] as const);
  return {
    chog: { tokenId, name, image: `/api/chogs/${tokenId}/image`, imageSource: image, traits: traits.map(([trait_type, value]) => ({ trait_type, value })) },
    pixels,
  };
}

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
/** The 1/1 title in a metadata name ("CHOG #53 — Blaze" -> "Blaze"); boss rooms are keyed by it. */
const titleOf = (chog: Chog) => /—\s*(.+)$/.exec(chog.name)?.[1] ?? null;
const roomFor = (tokenId: number, chog: Chog, pixels: Pixel[]) =>
  generateRoom({ tokenId, pixels, traits: chog.traits, title: titleOf(chog) });

const decode = (s: string): Pixel[] =>
  Array.from({ length: s.length / 6 }, (_, i) => {
    const n = parseInt(s.slice(i * 6, i * 6 + 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  });

async function build(tokenId: number): Promise<{ chog: Chog; room: Room } | null> {
  const local = fromBundle(tokenId);
  if (local) return { chog: local.chog, room: roomFor(tokenId, local.chog, local.pixels) };
  const adapter = getNftAdapter();
  const key = `room:v${INPUTS_VERSION}:${adapter.mode}:${tokenId}`;
  const store = getStore();
  const saved = await store.getKv<RoomInputs>(key).catch(() => null);
  if (saved) {
    return { chog: saved.chog, room: roomFor(tokenId, saved.chog, decode(saved.pixels)) };
  }
  const [chog, pixels] = await Promise.all([adapter.getChog(tokenId), adapter.getPixels(tokenId)]);
  if (!chog || !pixels) return null;
  void store.setKv(key, { chog, pixels: encode(pixels) } satisfies RoomInputs).catch(() => {});
  return { chog, room: roomFor(tokenId, chog, pixels) };
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
