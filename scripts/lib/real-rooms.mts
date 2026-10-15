// Loads every real Chog room offline, from the metadata snapshot and the cached 16x16 pixels
// (scripts/cache-pixels.mts). Shared by the difficulty index and the balance simulation.
import fs from "node:fs";
import { generateRoom } from "../../src/engine/index.ts";
import type { Pixel, Room, Trait } from "../../src/engine/types.ts";

type Meta = { tokenId: number; name: string; attributes: Trait[] };

const decode = (s: string): Pixel[] =>
  Array.from({ length: s.length / 6 }, (_, i) => {
    const n = parseInt(s.slice(i * 6, i * 6 + 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  });

export function loadRealRooms(metaFile = ".cache/meta/chog-metadata.json", pixelFile = ".cache/pixels.json") {
  const meta: Meta[] = JSON.parse(fs.readFileSync(metaFile, "utf8")).filter(Boolean);
  const pixels: Record<string, string> = JSON.parse(fs.readFileSync(pixelFile, "utf8"));
  const rooms: { name: string; room: Room }[] = [];
  const missing: number[] = [];
  for (const m of meta) {
    const px = pixels[m.tokenId];
    if (!px) {
      missing.push(m.tokenId);
      continue;
    }
    // Same title rule as src/lib/rooms.ts.
    const title = /—\s*(.+)$/.exec(m.name)?.[1] ?? null;
    rooms.push({ name: m.name, room: generateRoom({ tokenId: m.tokenId, pixels: decode(px), traits: m.attributes, title }) });
  }
  return { rooms, missing };
}
