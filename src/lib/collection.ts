import { chogName, tokenIdForNumber } from "@/lib/names";
import "server-only";
import { generateRoom } from "@/engine";
import { difficultyFor, difficultyOfRoom, type Difficulty } from "@/lib/difficulty";
import { mockPixels, mockTraits } from "@/nft/mockArt";
import { getNftAdapter, type Chog } from "@/nft";
import { getStats, leastDefended, mostRaided } from "@/server/stats";
import { getStore } from "@/server/store";

export type RoomCard = {
  tokenId: number;
  name: string;
  image: string;
  tier?: string;
  /** Rating 1-5 from the room's real difficulty score. 0 = unknown. */
  difficulty: number;
  /** Tier, rating and score for the badge (src/data/chog-difficulty.json). */
  diff: Difficulty | null;
  /** Present on the raid-stat sorts. */
  raids?: number;
  defenseRate?: number;
};

export type RoomSort = "id" | "hardest" | "raided" | "undefended" | "uncleared";

// Mock Chogs aren't in the precomputed index, so their rooms are generated (once) to rate them.
const mockDiff = new Map<number, Difficulty>();
function cardDifficulty(tokenId: number): Difficulty | null {
  if (getNftAdapter().mode !== "mock") return difficultyFor(tokenId);
  let d = mockDiff.get(tokenId);
  if (!d) {
    d = difficultyOfRoom(generateRoom({ tokenId, pixels: mockPixels(tokenId), traits: mockTraits(tokenId) }));
    mockDiff.set(tokenId, d);
  }
  return d;
}

const withDiff = (tokenId: number) => {
  const diff = cardDifficulty(tokenId);
  return { diff, difficulty: diff?.rating ?? 0 };
};

function toCard(c: Chog): RoomCard {
  return {
    tokenId: c.tokenId,
    name: c.name,
    image: c.image,
    tier: c.traits.find((t) => t.trait_type === "Tier")?.value,
    ...withDiff(c.tokenId),
  };
}

const fallbackCard = (id: number): RoomCard => ({ tokenId: id, name: chogName(id), image: `/api/chogs/${id}/image`, ...withDiff(id) });

/** Every room ordered by real difficulty score, hardest first (ties by token id). */
export function hardestIds(total: number): number[] {
  return Array.from({ length: total }, (_, i) => i + 1).sort(
    (a, b) => (cardDifficulty(b)?.score ?? -1) - (cardDifficulty(a)?.score ?? -1) || a - b,
  );
}

/** Rating per room, for "similar difficulty" suggestions. */
export function difficultyCards(total: number): { tokenId: number; difficulty: number }[] {
  return Array.from({ length: total }, (_, i) => ({ tokenId: i + 1, difficulty: cardDifficulty(i + 1)?.rating ?? 0 })).filter((c) => c.difficulty > 0);
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
      const base = c ? toCard(c) : fallbackCard(r.tokenId);
      return { ...base, raids: r.raids, defenseRate: r.defenseRate };
    });
    return { items, total: ordered.length, hasMore: start + opts.pageSize < ordered.length };
  }

  if (opts.sort === "hardest") {
    const ordered = hardestIds(total);
    const start = opts.page * opts.pageSize;
    const ids = ordered.slice(start, start + opts.pageSize);
    const chogs = await Promise.all(ids.map((id) => adapter.getChog(id).catch(() => null)));
    return { items: ids.map((id, i) => (chogs[i] ? toCard(chogs[i]) : fallbackCard(id))), total: ordered.length, hasMore: start + opts.pageSize < ordered.length };
  }

  // Token order, optionally skipping rooms (e.g. ones you already cleared).
  const all = Array.from({ length: total }, (_, i) => i + 1).filter((id) => !opts.exclude?.has(id));
  const start = opts.page * opts.pageSize;
  const ids = all.slice(start, start + opts.pageSize);
  const chogs = await Promise.all(ids.map((id) => adapter.getChog(id).catch(() => null)));
  // Keep cards for Chogs whose metadata timed out; their room page retries on open.
  const items = ids.map((id, i): RoomCard => {
    const c = chogs[i];
    return c ? toCard(c) : fallbackCard(id);
  });
  return { items, total: all.length, hasMore: start + opts.pageSize < all.length };
}
