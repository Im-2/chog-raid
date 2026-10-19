import { REWARDS, TARGET_LABEL } from "@/config/rewards";
import { env } from "@/lib/env";
import { isAdminWallet, liveRanking, poolState, snapshotKey, standingOf, type SeasonSnapshot } from "@/server/rewards";
import { currentRaider } from "@/server/identity";
import { snapshot } from "@/server/progress";
import { sessionAddress } from "@/server/session";
import { getStore } from "@/server/store";

/**
 * Season Rewards, as shown on the landing page, the leaderboards and /chog. The pool is the REAL
 * on-chain $CHOG balance of the pool address; nothing here is claimable, automatic or guaranteed.
 * Rewards are paid manually by the team once a pool is funded (see src/config/rewards.ts).
 */
export async function GET() {
  const [snap, pool, wallet, me] = await Promise.all([snapshot(), poolState(), sessionAddress(), currentRaider()]);
  const ranking = await liveRanking(snap.raids, snap.supply);
  const prev = snap.season.index - 1;
  const last = prev >= 0 ? await getStore().getKv<SeasonSnapshot>(snapshotKey(prev)) : null;
  const mine = (board: "wardens" | "raiders") => standingOf(ranking[board], me, board, pool);

  return Response.json(
    {
      season: { index: snap.season.index, endsAt: snap.season.end.toISOString() },
      pool: {
        state: pool.state,
        balance: pool.balance,
        address: pool.address,
        explorer: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.replace(/\/$/, "") ?? null,
        target: pool.target,
        targetLabel: TARGET_LABEL,
      },
      split: REWARDS.split,
      topN: REWARDS.topN,
      payout: REWARDS.bands,
      eligibility: { raiderMinRoomsCleared: REWARDS.eligibility.raiderMinRoomsCleared },
      eligible: { wardens: ranking.wardens.length, raiders: ranking.raiders.length },
      me: me ? { isWallet: !!wallet, wardens: mine("wardens"), raiders: mine("raiders") } : null,
      lastSnapshot: last ? { season: last.season, takenAt: last.takenAt, poolBalance: last.pool.balance, poolState: last.pool.state } : null,
      admin: isAdminWallet(wallet),
      mock: env.nftAdapter === "mock",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
