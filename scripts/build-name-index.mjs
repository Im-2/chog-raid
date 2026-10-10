// Builds src/data/chog-names.json: tokenId -> official metadata name (e.g. 53 -> "CHOG #1514",
// 561 -> "CHOG #53 — Blaze"). The name number is what OpenSea shows; the token id is what the
// contract (ownerOf, tokenURI) uses. Commit the output; re-run to refresh.
//
// usage:
//   node scripts/fetch-metadata.mjs .cache/meta                         (reads tokenURI + metadata for every token)
//   node scripts/build-name-index.mjs .cache/meta/chog-metadata.json   (writes the index)
import fs from "node:fs";
import path from "node:path";

const snapshot = process.argv[2] ?? ".cache/meta/chog-metadata.json";
const contract = process.env.NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS ?? "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763";
const meta = JSON.parse(fs.readFileSync(snapshot, "utf8")).filter(Boolean);

const names = {};
for (const m of meta) {
  if (!m.name) throw new Error(`token ${m.tokenId} has no name`);
  names[m.tokenId] = m.name;
}
const numbers = new Map();
for (const [id, name] of Object.entries(names)) {
  const n = /#(\d+)/.exec(name)?.[1];
  if (!n) throw new Error(`can't find a number in "${name}" (token ${id})`);
  if (numbers.has(n)) throw new Error(`name number #${n} is used by tokens ${numbers.get(n)} and ${id}`);
  numbers.set(n, id);
}

const out = path.join("src", "data", "chog-names.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ contract: contract.toLowerCase(), count: meta.length, generatedAt: new Date().toISOString(), names }, null, 0) + "\n",
);
console.log(`wrote ${out}: ${meta.length} names, ${numbers.size} unique numbers`);
