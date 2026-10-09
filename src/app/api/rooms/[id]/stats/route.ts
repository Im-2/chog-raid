import { raiderLabel } from "@/server/identity";
import { getStats } from "@/server/stats";
import { getStore } from "@/server/store";

/** One room's record: raids, breaches, defense rate, fastest clear, and who defends it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tokenId = Number((await params).id);
  if (!Number.isInteger(tokenId) || tokenId < 1) return Response.json({ error: "Bad token id." }, { status: 400 });
  const store = getStore();
  const [stats, defense] = await Promise.all([getStats(store), store.getDefense(tokenId)]);
  const r = stats.rooms.get(tokenId);
  return Response.json(
    {
      tokenId,
      defended: !!defense,
      defender: defense ? raiderLabel(defense.owner) : null,
      raids: r?.raids ?? 0,
      breaches: r?.breaches ?? 0,
      defenseRate: r?.defenseRate ?? null,
      fastestClear: r?.fastestClear ? { moves: r.fastestClear.moves, raider: raiderLabel(r.fastestClear.raider) } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
