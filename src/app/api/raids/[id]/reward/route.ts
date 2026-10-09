import { currentRaider } from "@/server/identity";
import { awardFor, playerSummary, snapshot } from "@/server/progress";

/** Points earned by a finished raid, plus the raider's updated streak and season total. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentRaider();
  if (!me) return Response.json({ error: "Not your raid." }, { status: 403 });
  const snap = await snapshot(0);
  const award = awardFor(snap, (await params).id);
  if (award && award.who.toLowerCase() !== me.toLowerCase()) return Response.json({ error: "Not your raid." }, { status: 403 });
  const p = playerSummary(snap, me);
  return Response.json(
    { award, streak: p.streak, seasonPoints: p.raider.points, rank: p.raider.rank },
    { headers: { "Cache-Control": "no-store" } },
  );
}
