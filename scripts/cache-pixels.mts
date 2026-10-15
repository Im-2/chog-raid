// Downloads every Chog's artwork (from its metadata image field) and stores the 16x16 room pixels.
// Needed for offline analysis (difficulty index, balance simulation). Resumable.
//
// usage: npx tsx --conditions=react-server scripts/cache-pixels.mts [.cache/meta/chog-metadata.json]
import fs from "node:fs";
import path from "node:path";
import { downsampleImage } from "../src/nft/pixels.ts";

const snapshot = process.argv[2] ?? ".cache/meta/chog-metadata.json";
const gateways = (process.env.CHOG_IPFS_GATEWAYS ?? "https://ipfs.filebase.io/ipfs/,https://gateway.pinata.cloud/ipfs/").split(",");
const imgDir = path.join(".cache", "chog-images");
const outFile = path.join(".cache", "pixels.json");

type Meta = { tokenId: number; image: string };
const meta: Meta[] = JSON.parse(fs.readFileSync(snapshot, "utf8")).filter(Boolean);
const out: Record<string, string> = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
fs.mkdirSync(imgDir, { recursive: true });

const hex = (px: readonly (readonly [number, number, number])[]) =>
  px.map(([r, g, b]) => ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")).join("");

async function fetchImage(uri: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const gw = gateways[attempt % gateways.length];
    try {
      const res = await fetch(uri.replace("ipfs://", gw), { signal: AbortSignal.timeout(45000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`failed ${uri}`);
}

const todo = meta.filter((m) => !out[m.tokenId]);
console.log(`${meta.length} tokens, ${todo.length} to do`);
let next = 0;
let done = 0;
let lastSave = Date.now();
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < todo.length) {
      const m = todo[next++];
      const file = path.join(imgDir, `${m.tokenId}.img`);
      try {
        const img = fs.existsSync(file) ? fs.readFileSync(file) : await fetchImage(m.image);
        if (!fs.existsSync(file)) fs.writeFileSync(file, img);
        out[m.tokenId] = hex(await downsampleImage(img));
      } catch (e) {
        console.warn(String(e));
      }
      if (++done % 50 === 0) console.log(`${done}/${todo.length}`);
      if (Date.now() - lastSave > 20000) {
        fs.writeFileSync(outFile, JSON.stringify(out));
        lastSave = Date.now();
      }
    }
  }),
);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`done: ${Object.keys(out).length} rooms cached in ${outFile}`);
