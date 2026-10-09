import { raidDeps, readJson, respond } from "@/server/deps";
import { currentRaider } from "@/server/identity";
import { applyMove } from "@/server/raids";

/** Make a move: POST { move: "U"|"D"|"L"|"R", seq }. The server resolves it and returns the new view. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const raider = await currentRaider();
  if (!raider) return Response.json({ error: "Not your raid." }, { status: 403 });
  const body = await readJson(req);
  try {
    return respond(await applyMove(raidDeps(), (await params).id, raider, body?.move, body?.seq));
  } catch (e) {
    console.error("move:", e);
    return Response.json({ error: "The move didn't go through. Try again." }, { status: 502 });
  }
}
