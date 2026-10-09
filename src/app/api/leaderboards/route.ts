import { currentRaider, raiderLabel } from "@/server/identity";
import { getStats, rankDefenders, rankFastest, rankRaiders } from "@/server/stats";
import { getStore } from "@/server/store";

/** Raiders, Wardens (defenders) and fastest clears. */
export async function GET() {
  try {
    const [stats, me] = await Promise.all([getStats(getStore()), currentRaider()]);
    const mine = (id: string) => !!me && id.toLowerCase() === me.toLowerCase();
    return Response.json(
      {
        totalRaids: stats.totalRaids,
        raiders: rankRaiders(stats).map((r) => ({ ...r, raider: raiderLabel(r.raider), me: mine(r.raider) })),
        defenders: rankDefenders(stats).map((d) => ({ ...d, defender: raiderLabel(d.defender), me: mine(d.defender) })),
        fastest: rankFastest(stats).map((r) => ({
          tokenId: r.tokenId,
          moves: r.fastestClear!.moves,
          raider: raiderLabel(r.fastestClear!.raider),
          me: mine(r.fastestClear!.raider),
          at: r.fastestClear!.at,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("leaderboards:", e);
    return Response.json({ error: "Couldn't load leaderboards." }, { status: 502 });
  }
}
