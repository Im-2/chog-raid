import { raidDeps, readJson, respond } from "@/server/deps";
import { currentRaider } from "@/server/identity";
import { applyMoves } from "@/server/raids";
import { warm } from "@/server/warm";

/**
 * Make moves: POST { moves: ["U","R",...], seq } (or the single-move form { move, seq }).
 * The server resolves them and returns the new view. Safe to resend.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const raider = await currentRaider();
  if (!raider) return Response.json({ error: "Not your raid." }, { status: 403 });
  const body = await readJson(req);
  try {
    const moves = Array.isArray(body?.moves) ? body.moves : [body?.move];
    return respond(await applyMoves(raidDeps(), (await params).id, raider, moves, body?.seq));
  } catch (e) {
    console.error("move:", e);
    return Response.json({ error: "The move didn't go through. Try again." }, { status: 502 });
  }
}

/** Keep-warm ping (see src/server/warm.ts). */
export function GET() {
  return warm();
}
