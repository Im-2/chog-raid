import { raidDeps } from "@/server/deps";
import { currentRaider, raiderLabel } from "@/server/identity";
import { listRoomRaids } from "@/server/raids";

/** A room's raid log: outcome, length and where each raid ended. No trap positions. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tokenId = Number((await params).id);
  if (!Number.isInteger(tokenId) || tokenId < 1) return Response.json({ error: "Bad token id." }, { status: 400 });
  const me = await currentRaider();
  const raids = await listRoomRaids(raidDeps(), tokenId);
  return Response.json({
    raids: raids.map((r) => ({ ...r, raider: raiderLabel(r.raider), mine: r.raider === me })),
  });
}
