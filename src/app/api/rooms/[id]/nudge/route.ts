import { sameAddress } from "@/server/auth";
import { raidDeps } from "@/server/deps";
import { rebuildNudge } from "@/server/nudge";
import { sessionAddress } from "@/server/session";

/** Holder only: where raiders got through since the last save, and one suggested trap change. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tokenId = Number((await params).id);
  const deps = raidDeps();
  const [wallet, owner, room, defense] = await Promise.all([
    sessionAddress(),
    deps.ownerOf(tokenId),
    deps.getRoom(tokenId),
    deps.store.getDefense(tokenId),
  ]);
  if (!room || !owner) return Response.json({ error: "No such Chog." }, { status: 404 });
  if (!sameAddress(owner, wallet)) return Response.json({ error: "Only the holder can see this." }, { status: 403 });
  if (!defense) return Response.json({ nudge: null });
  const raids = await deps.store.listRaids(tokenId, 300);
  return Response.json({ nudge: rebuildNudge(room, defense.traps, raids, defense.updatedAt) }, { headers: { "Cache-Control": "no-store" } });
}
