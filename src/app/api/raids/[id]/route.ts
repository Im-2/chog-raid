import { raidDeps, respond } from "@/server/deps";
import { currentRaider } from "@/server/identity";
import { getRaidView } from "@/server/raids";

/** The raider's current view of their raid (to resume after a reload). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const raider = await currentRaider();
  if (!raider) return Response.json({ error: "Not your raid." }, { status: 403 });
  return respond(await getRaidView(raidDeps(), (await params).id, raider));
}
