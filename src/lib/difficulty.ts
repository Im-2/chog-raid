// Every room's real difficulty, precomputed from its generated layout and native defenses by
// scripts/difficulty-index.mts (rerun it whenever the engine or config/tiers.ts changes).
// Client-safe: the Atlas and the room browser read it without generating rooms.
import data from "@/data/chog-difficulty.json";
import { tierAtLevel, type TierId } from "@/config/tiers";

export type Difficulty = { score: number; rating: number; tier: TierId; tierName: string; label: string };

const index = data as unknown as Record<string, [number, number, number]>;

export function difficultyFor(tokenId: number): Difficulty | null {
  const row = index[tokenId];
  if (!row) return null;
  const t = tierAtLevel(row[2]);
  return { score: row[0], rating: row[1], tier: t.id, tierName: t.name, label: t.label };
}

/** The same shape from a generated room (the room page and HUD use the live room). */
export const difficultyOfRoom = (room: { difficulty: { score: number; rating: number }; tier: { id: TierId; name: string; label: string } }): Difficulty => ({
  score: room.difficulty.score,
  rating: room.difficulty.rating,
  tier: room.tier.id,
  tierName: room.tier.name,
  label: room.tier.label,
});
