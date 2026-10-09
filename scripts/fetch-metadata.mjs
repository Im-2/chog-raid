// Analysis helper: reads tokenURI for every Chog on Monad, fetches each metadata JSON
// and writes a snapshot plus a trait frequency table. Not used by the app at runtime.
//
// usage: node scripts/fetch-metadata.mjs <outDir>
// env:   NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS, CHOG_IPFS_GATEWAYS (comma separated)

import { createPublicClient, http, parseAbi } from "viem";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? ".";
const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.monad.xyz";
const address = process.env.NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS;
const gateways = (process.env.CHOG_IPFS_GATEWAYS ?? "https://ipfs.filebase.io/ipfs/,https://gateway.pinata.cloud/ipfs/")
  .split(",")
  .map((g) => g.trim());
if (!address) throw new Error("set NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS");

const abi = parseAbi(["function totalSupply() view returns (uint256)", "function tokenURI(uint256) view returns (string)"]);
const client = createPublicClient({ transport: http(rpc, { batch: { batchSize: 100 } }) });
const supply = Number(await client.readContract({ address, abi, functionName: "totalSupply" }));
console.log("supply", supply);

const ids = Array.from({ length: supply }, (_, i) => i + 1);
const uris = [];
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  uris.push(...(await Promise.all(chunk.map((id) => client.readContract({ address, abi, functionName: "tokenURI", args: [BigInt(id)] })))));
  process.stdout.write(`\ruris ${uris.length}/${supply}`);
}
console.log();

const resolve = (uri, gw) => (uri.startsWith("ipfs://") ? gw + uri.slice(7) : uri);
async function fetchJson(uri) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const gw = gateways[attempt % gateways.length];
    try {
      const res = await fetch(resolve(uri, gw), { signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error("failed " + uri);
}

const out = new Array(supply);
for (let pass = 0; pass < 3; pass++) {
  const todo = ids.map((id) => id - 1).filter((i) => !out[i]);
  if (todo.length === 0) break;
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < todo.length) {
        const i = todo[next++];
        try {
          const meta = await fetchJson(uris[i]);
          out[i] = { tokenId: i + 1, tokenURI: uris[i], name: meta.name, image: meta.image, attributes: meta.attributes };
        } catch (e) {
          console.warn(String(e));
        }
        if (++done % 50 === 0) process.stdout.write(`\rpass ${pass} meta ${done}/${todo.length}`);
      }
    }),
  );
  console.log();
}
const missing = out.filter((m) => !m).length;
if (missing) console.warn("missing", missing);

const freq = {};
for (const m of out.filter(Boolean)) for (const a of m.attributes ?? []) {
  freq[a.trait_type] ??= {};
  freq[a.trait_type][a.value] = (freq[a.trait_type][a.value] ?? 0) + 1;
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "chog-metadata.json"), JSON.stringify(out));
fs.writeFileSync(path.join(outDir, "chog-traits.json"), JSON.stringify(freq, null, 1));
console.log("trait types", Object.fromEntries(Object.entries(freq).map(([k, v]) => [k, Object.keys(v).length])));
