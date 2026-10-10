import { chogName, tokenIdForNumber } from "@/lib/names";
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { GAME, resolveRules, type Trait } from "@/engine";
import { env } from "@/lib/env";
import { getNftAdapter, type Chog } from "@/nft";
import { getStats, leastDefended, mostRaided } from "@/server/stats";
import { getStore } from "@/server/store";

export type RoomCard = {
  tokenId: number;
  name: string;
  image: string;
  tier?: string;
  /** 1-5, from the room rules the Chog's traits produce. 0 = unknown (metadata unavailable right now). */
  difficulty: number;
  /** Present on the raid-stat sorts. */
  raids?: number;
  defenseRate?: number;
};

export type RoomSort = "id" | "hardest" | "raided" | "undefended" | "uncleared";

/** How hard a room is to raid, from its trait-derived rules (more slots, more trap types, more embers). */
export function difficultyOf(traits: Trait[]): number {
  const { rules, hazardSprinkle } = resolveRules(traits);
  const score =
    (rules.trapSlots - GAME.baseTrapSlots) * 2 + (rules.allowedTraps.length - 2) * 1.5 + hazardSprinkle / 3;
  return Math.max(1, Math.min(5, 1 + Math.round(score / 2)));
}

function toCard(c: Chog): RoomCard {
  return {
    tokenId: c.tokenId,
    name: c.name,
    image: c.image,
    tier: c.traits.find((t) => t.trait_type === "Tier")?.value,
    difficulty: difficultyOf(c.traits),
  };
}

// Whole-collection index, built in the background (metadata is immutable).
const index = new Map<number, RoomCard>();
let warming: Promise<void> | null = null;
const indexFile = () => path.join(env.cacheDir, `collection-${getNftAdapter().mode}.json`);

/** Cards indexed so far (the whole collection once warm). */
export function indexedCards(): RoomCard[] {
  return [...index.values()];
}

export function indexProgress() {
  return { done: index.size, warming: !!warming };
}

export function warmIndex(total: number): void {
  if (warming || index.size >= total) return;
  warming = (async () => {
    try {
      const saved = JSON.parse(await fs.readFile(indexFile(), "utf8")) as RoomCard[];
      saved.forEach((c) => index.set(c.tokenId, c));
    } catch {}
    const adapter = getNftAdapter();
    const todo = Array.from({ length: total }, (_, i) => i + 1).filter((id) => !index.has(id));
    let next = 0;
    let sinceSave = 0;
    const save = async () => {
      await fs.mkdir(env.cacheDir, { recursive: true }).catch(() => {});
      await fs.writeFile(indexFile(), JSON.stringify([...index.values()])).catch(() => {});
    };
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < todo.length) {
          const id = todo[next++];
          try {
            const c = await adapter.getChog(id);
            if (c) index.set(id, toCard(c));
          } catch {}
          if (++sinceSave >= 100) {
            sinceSave = 0;
            await save();
          }
        }
      }),
    );
    await save();
  })().finally(() => (warming = null));
}

export async function listRooms(opts: { sort: RoomSort; page: number; pageSize: number; q?: number; exclude?: Set<number> }) {
  const adapter = getNftAdapter();
  const total = await adapter.totalSupply();

  if (opts.q !== undefined) {
    // Search by the name number shown on OpenSea first; a token id match comes second.
    const ids = [...new Set([tokenIdForNumber(opts.q), opts.q <= total ? opts.q : null].filter((x): x is number => !!x))];
    const found = (await Promise.all(ids.map((id) => adapter.getChog(id).catch(() => null)))).filter((c): c is Chog => !!c);
    return { items: found.map(toCard), total: found.length, hasMore: false };
  }

  if (opts.sort === "raided" || opts.sort === "undefended") {
    const stats = await getStats(getStore());
    const ordered = opts.sort === "raided" ? mostRaided(stats) : leastDefended(stats);
    if (ordered.length === 0) return { items: [], total: 0, hasMore: false, reason: "no-raid-data" as const };
    const start = opts.page * opts.pageSize;
    const slice = ordered.slice(start, start + opts.pageSize);
    const chogs = await Promise.all(slice.map((r) => adapter.getChog(r.tokenId).catch(() => null)));
    const items = slice.map((r, i): RoomCard => {
      const c = chogs[i];
      const base = c ? toCard(c) : { tokenId: r.tokenId, name: chogName(r.tokenId), image: `/api/chogs/${r.tokenId}/image`, difficulty: 0 };
      return { ...base, raids: r.raids, defenseRate: r.defenseRate };
    });
    return { items, total: ordered.length, hasMore: start + opts.pageSize < ordered.length };
  }

  if (opts.sort === "hardest") {
    warmIndex(total);
    const sorted = [...index.values()].sort((a, b) => b.difficulty - a.difficulty || a.tokenId - b.tokenId);
    const start = opts.page * opts.pageSize;
    return {
      items: sorted.slice(start, start + opts.pageSize),
      total: sorted.length,
      hasMore: start + opts.pageSize < sorted.length,
      indexing: index.size < total ? { done: index.size, total } : undefined,
    };
  }

  // Token order, optionally skipping rooms (e.g. ones you already cleared).
  const all = Array.from({ length: total }, (_, i) => i + 1).filter((id) => !opts.exclude?.has(id));
  const start = opts.page * opts.pageSize;
  const ids = all.slice(start, start + opts.pageSize);
  const chogs = await Promise.all(ids.map((id) => adapter.getChog(id).catch(() => null)));
  // Keep cards for Chogs whose metadata timed out; their room page retries on open.
  const items = ids.map((id, i): RoomCard => {
    const c = chogs[i];
    return c ? toCard(c) : { tokenId: id, name: chogName(id), image: `/api/chogs/${id}/image`, difficulty: 0 };
  });
  items.forEach((c) => c.difficulty && index.set(c.tokenId, c));
  return { items, total: all.length, hasMore: start + opts.pageSize < all.length };
}
