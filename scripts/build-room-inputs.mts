// Builds src/data/room-inputs.json: every Chog Genesis room's inputs (official name, metadata
// image, traits, 16x16 pixels), so the server builds any room with no network calls (no tokenURI,
// IPFS or cache reads). Metadata and art are immutable, so this never goes stale.
//
// usage: npx tsx --conditions=react-server scripts/build-room-inputs.mts
// Needs .cache/meta/chog-metadata.json and .cache/pixels.json (scripts/cache-pixels.mts).
import fs from "node:fs";

const CONTRACT = "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763";
type Meta = { tokenId: number; name: string; image: string; attributes: { trait_type: string; value: string }[] };
const meta: Meta[] = JSON.parse(fs.readFileSync(".cache/meta/chog-metadata.json", "utf8")).filter(Boolean);
const pixels: Record<string, string> = JSON.parse(fs.readFileSync(".cache/pixels.json", "utf8"));

const rooms: Record<number, [name: string, image: string, traits: [string, string][], pixels: string]> = {};
for (const m of meta) {
  const hex = pixels[m.tokenId];
  if (!hex) throw new Error(`no pixels for ${m.tokenId}`);
  rooms[m.tokenId] = [m.name, m.image, m.attributes.filter((a) => a.trait_type).map((a) => [String(a.trait_type), String(a.value)]), Buffer.from(hex, "hex").toString("base64")];
}
fs.writeFileSync("src/data/room-inputs.json", JSON.stringify({ contract: CONTRACT, rooms }) + "\n");
console.log(`wrote ${Object.keys(rooms).length} rooms, ${(fs.statSync("src/data/room-inputs.json").size / 1024).toFixed(0)} KB`);
