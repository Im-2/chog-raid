import { currentRaider } from "@/server/identity";
import { myRooms, snapshot } from "@/server/progress";

/** Which rooms you've cleared, and your best result in each (for grid badges and the progress counter). */
export async function GET() {
  const [snap, me] = await Promise.all([snapshot(), currentRaider()]);
  const rooms = me ? myRooms(snap, me) : new Map();
  return Response.json(
    {
      total: snap.supply,
      cleared: [...rooms].filter(([, b]) => b.cleared).map(([id]) => id),
      rooms: Object.fromEntries(rooms),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
