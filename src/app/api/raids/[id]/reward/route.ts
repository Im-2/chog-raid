import { chogName } from "@/lib/names";
import { indexedCards, warmIndex } from "@/lib/collection";
import { currentRaider } from "@/server/identity";
import { awardFor, myRooms, playerSummary, snapshot, suggestNextRoom } from "@/server/progress";
import { getStore } from "@/server/store";

/**
 * Everything the result card needs after a raid ends: points earned, streak and season total,
 * your best result for this room, and a suggested next room.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentRaider();
  if (!me) return Response.json({ error: "Not your raid." }, { status: 403 });
  const raidId = (await params).id;
  const [snap, raid] = await Promise.all([snapshot(0), getStore().getRaid(raidId)]);
  if (!raid || raid.raider.toLowerCase() !== me.toLowerCase()) return Response.json({ error: "Not your raid." }, { status: 403 });

  warmIndex(snap.supply);
  const cards = indexedCards();
  const diff = new Map(cards.map((c) => [c.tokenId, c.difficulty]));
  const next = suggestNextRoom(snap, me, raid.tokenId, (id) => diff.get(id) ?? raid.difficulty ?? null, cards);
  const p = playerSummary(snap, me);
  const rooms = myRooms(snap, me);
  const best = rooms.get(raid.tokenId) ?? { attempts: 0, cleared: false, bestMoves: null, lastOutcome: null };

  return Response.json(
    {
      award: awardFor(snap, raidId),
      streak: p.streak,
      seasonPoints: p.raider.points,
      rank: p.raider.rank,
      room: { ...best, name: chogName(raid.tokenId) },
      cleared: [...rooms.values()].filter((r) => r.cleared).length,
      total: snap.supply,
      next: { ...next, name: chogName(next.tokenId) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
