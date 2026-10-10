import { currentRaider, raiderLabel } from "@/server/identity";
import { myRooms, snapshot } from "@/server/progress";

/**
 * Everything the Atlas needs in one compact payload: per-room activity (only rooms with raids),
 * which rooms are defended, which you've cleared, and the latest finished raids for the feed.
 */
export async function GET() {
  const [snap, me] = await Promise.all([snapshot(), currentRaider()]);
  const rooms = new Map<number, { raids: number; breaches: number; last: number }>();
  for (const r of snap.raids) {
    const s = rooms.get(r.tokenId) ?? { raids: 0, breaches: 0, last: 0 };
    s.raids++;
    if (r.status === "breach") s.breaches++;
    s.last = Math.max(s.last, Date.parse(r.updatedAt || r.createdAt));
    rooms.set(r.tokenId, s);
  }
  const recent = [...snap.raids]
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .slice(0, 25)
    .map((r) => ({ tokenId: r.tokenId, status: r.status, at: r.updatedAt || r.createdAt, raider: raiderLabel(r.raider) }));
  const cleared = me ? [...myRooms(snap, me)].filter(([, b]) => b.cleared).map(([id]) => id) : [];

  return Response.json(
    {
      supply: snap.supply,
      now: Date.now(),
      // [tokenId, raids, breaches, lastRaidAt (ms)]
      rooms: [...rooms].map(([id, s]) => [id, s.raids, s.breaches, s.last]),
      defended: snap.defenses.map((d) => [d.tokenId, raiderLabel(d.owner)]),
      cleared,
      recent,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
