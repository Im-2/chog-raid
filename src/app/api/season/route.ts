import { currentRaider } from "@/server/identity";
import { daily, seasonBoards, snapshot } from "@/server/progress";

/** Current season standings (with countdown) and today's daily raid board. */
export async function GET() {
  const [snap, me] = await Promise.all([snapshot(), currentRaider()]);
  return Response.json({ ...seasonBoards(snap, me), daily: daily(snap, me) }, { headers: { "Cache-Control": "no-store" } });
}
