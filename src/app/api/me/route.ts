import { unreadAlerts } from "@/server/alerts";
import { currentRaider } from "@/server/identity";
import { playerSummary, snapshot } from "@/server/progress";
import { sessionAddress } from "@/server/session";

/** The current player's points, streaks, badges, defended rooms and unread alert count. */
export async function GET() {
  const [me, wallet] = await Promise.all([currentRaider(), sessionAddress()]);
  if (!me) return Response.json({ player: null }, { headers: { "Cache-Control": "no-store" } });
  const snap = await snapshot();
  return Response.json(
    { player: playerSummary(snap, me), unread: wallet ? await unreadAlerts(snap, wallet) : 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
