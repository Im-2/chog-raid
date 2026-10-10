import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createPublicClient, defineChain, http, parseAbi, type PublicClient } from "viem";
import type { Pixel, Trait } from "@/engine";
import { env, requireEnv } from "@/lib/env";
import { downsampleImage } from "./pixels";
import type { Address, Chog, NftAdapter } from "./types";

const ERC721 = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

type Meta = { name?: string; image?: string; attributes?: { trait_type?: string; value?: unknown }[] };

/** Resolve ipfs:// (and ar://) to an http URL on the given gateway. */
export function resolveUri(uri: string, gateway: string): string {
  if (uri.startsWith("ipfs://")) return gateway.replace(/\/?$/, "/") + uri.slice(7).replace(/^ipfs\//, "");
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

// Public IPFS gateways rate-limit bursts, so all gateway traffic shares a small pool.
const MAX_GATEWAY_REQUESTS = 6;
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_GATEWAY_REQUESTS) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Fetch an (ipfs://) URI, trying each gateway in turn, for a few rounds with backoff. */
function fetchWithGateways(uri: string, timeoutMs = 20000): Promise<Buffer> {
  return limited(async () => {
    let lastError: unknown;
    const gateways = uri.startsWith("ipfs://") ? env.ipfsGateways : [""];
    for (let round = 0; round < 3; round++) {
      for (const gw of gateways) {
        try {
          const res = await fetch(resolveUri(uri, gw), { signal: AbortSignal.timeout(timeoutMs) });
          if (res.ok) return Buffer.from(await res.arrayBuffer());
          lastError = new Error(`${res.status} from ${gw || uri}`);
        } catch (e) {
          lastError = e;
        }
      }
      await new Promise((r) => setTimeout(r, 600 * (round + 1)));
    }
    throw new Error(`Could not fetch ${uri}: ${String(lastError)}`);
  });
}

/**
 * Real reads from the Chog Genesis contract on Monad: tokenURI -> metadata JSON
 * -> image field. Metadata and pixels are cached in memory; image bytes are cached
 * on disk (CHOG_CACHE_DIR) since the art never changes. ownerOf is never cached.
 */
export function createOnchainAdapter(): NftAdapter {
  const address = requireEnv("NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS") as Address;
  const rpcUrl = requireEnv("NEXT_PUBLIC_RPC_URL");
  const chain = defineChain({
    id: env.chainId,
    name: env.chainName,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(rpcUrl, { batch: true }) }) as PublicClient;

  let supply: { value: number; at: number } | null = null;
  let owners: { map: Map<number, string>; at: number } | null = null;
  let ownersLoading: Promise<Map<number, string>> | null = null;

  /** Every token's holder, via Multicall3 in chunks (~8s for the full collection). */
  async function scanOwners(): Promise<Map<number, string>> {
    const total = await totalSupply();
    const ids = Array.from({ length: total }, (_, i) => i + 1);
    const map = new Map<number, string>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const res = await client.multicall({
        multicallAddress: env.multicall3,
        allowFailure: true,
        contracts: chunk.map((id) => ({ address, abi: ERC721, functionName: "ownerOf" as const, args: [BigInt(id)] as const })),
      });
      res.forEach((r, j) => r.status === "success" && map.set(chunk[j], r.result as string));
    }
    return map;
  }

  /** Cached for 2 minutes; a stale snapshot is served while a fresh one loads. */
  function ownersSnapshot(): Promise<Map<number, string>> {
    const fresh = owners && Date.now() - owners.at < 2 * 60_000;
    if (!fresh && !ownersLoading) {
      ownersLoading = scanOwners()
        .then((map) => ((owners = { map, at: Date.now() }), map))
        .finally(() => (ownersLoading = null));
    }
    return owners ? Promise.resolve(owners.map) : ownersLoading!;
  }
  const meta = new Map<number, Promise<Chog | null>>();
  const pixels = new Map<number, Promise<Pixel[] | null>>();

  async function totalSupply(): Promise<number> {
    if (supply && Date.now() - supply.at < 10 * 60_000) return supply.value;
    const value = Number(await client.readContract({ address, abi: ERC721, functionName: "totalSupply" }));
    supply = { value, at: Date.now() };
    return value;
  }

  async function exists(tokenId: number): Promise<boolean> {
    return Number.isInteger(tokenId) && tokenId >= 1 && tokenId <= (await totalSupply());
  }

  async function loadChog(tokenId: number): Promise<Chog | null> {
    if (!(await exists(tokenId))) return null;
    const uri = await client.readContract({
      address,
      abi: ERC721,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });
    const json = JSON.parse((await fetchWithGateways(uri)).toString("utf8")) as Meta;
    if (!json.image) throw new Error(`Chog #${tokenId} metadata has no image`);
    const traits: Trait[] = (json.attributes ?? [])
      .filter((a) => a.trait_type)
      .map((a) => ({ trait_type: String(a.trait_type), value: String(a.value) }));
    return {
      tokenId,
      // The official name (e.g. "CHOG #1514"). Its number differs from the token id.
      name: json.name ?? `Chog #${tokenId}`,
      image: `/api/chogs/${tokenId}/image`,
      imageSource: json.image,
      traits,
    };
  }

  function getChog(tokenId: number): Promise<Chog | null> {
    let p = meta.get(tokenId);
    if (!p) {
      p = loadChog(tokenId);
      meta.set(tokenId, p);
      p.catch(() => meta.delete(tokenId)); // retry on next request
    }
    return p;
  }

  async function getImage(tokenId: number): Promise<Buffer | null> {
    const chog = await getChog(tokenId);
    if (!chog?.imageSource) return null;
    const file = path.join(env.cacheDir, "chog-images", `${tokenId}.img`);
    try {
      return await fs.readFile(file);
    } catch {}
    const bytes = await fetchWithGateways(chog.imageSource, 45000);
    await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {});
    await fs.writeFile(file, bytes).catch(() => {});
    return bytes;
  }

  function getPixels(tokenId: number): Promise<Pixel[] | null> {
    let p = pixels.get(tokenId);
    if (!p) {
      p = getImage(tokenId).then((img) => (img ? downsampleImage(img) : null));
      pixels.set(tokenId, p);
      p.catch(() => pixels.delete(tokenId));
    }
    return p;
  }

  return {
    mode: "onchain",
    totalSupply,
    getChog,
    getPixels,
    getImage,
    async ownedBy(holder) {
      const map = await ownersSnapshot();
      const want = holder.toLowerCase();
      return [...map].filter(([, o]) => o.toLowerCase() === want).map(([id]) => id).sort((a, b) => a - b);
    },
    async ownerOf(tokenId) {
      if (!(await exists(tokenId))) return null;
      try {
        return await client.readContract({ address, abi: ERC721, functionName: "ownerOf", args: [BigInt(tokenId)] });
      } catch {
        return null;
      }
    },
  };
}
