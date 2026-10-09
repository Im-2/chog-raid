import { RETENTION } from "@/config/retention";
import { chogBalance, chogEnabled, chogToken, enterDaily, poolFor } from "@/server/chog";
import { currentRaider, raiderLabel } from "@/server/identity";
import { daily, seasonBoards, snapshot } from "@/server/progress";
import { sessionAddress } from "@/server/session";

/** $CHOG prize pool state. `simulated: true` means no tokens move (see src/server/chog.ts). */
export async function GET() {
  if (!chogEnabled()) return Response.json({ enabled: false });
  const [snap, wallet, me] = await Promise.all([snapshot(), sessionAddress(), currentRaider()]);
  const today = daily(snap, me);
  const [pool, last, balance] = await Promise.all([
    poolFor(snap.season.index),
    poolFor(snap.season.index - 1),
    wallet ? chogBalance(wallet) : Promise.resolve(null),
  ]);
  // Last season's payouts, computed from its final standings (simulated).
  const prev = seasonBoards({ ...snap, season: { ...snap.season, index: snap.season.index - 1 } }, me, 1);
  return Response.json({
    enabled: true,
    simulated: true,
    token: chogToken(),
    fee: RETENTION.chog.dailyEntryFee,
    pool: { season: pool.season, total: pool.total, entrants: new Set(pool.entries.map((e) => e.wallet.toLowerCase())).size },
    enteredToday: !!wallet && pool.entries.some((e) => e.day === today.day && e.wallet.toLowerCase() === wallet.toLowerCase()),
    balance,
    lastSeason: {
      season: last.season,
      total: last.total,
      raider: prev.raiders[0] ? { label: prev.raiders[0].label, amount: last.total * RETENTION.chog.payoutRaider } : null,
      warden: prev.wardens[0] ? { label: raiderLabel(prev.wardens[0].id), amount: last.total * RETENTION.chog.payoutWarden } : null,
    },
  });
}

/** Enter today's daily raid pool (simulated fee). */
export async function POST() {
  if (!chogEnabled()) return Response.json({ error: "The $CHOG pool is off." }, { status: 404 });
  const wallet = await sessionAddress();
  if (!wallet) return Response.json({ error: "Connect your wallet to enter." }, { status: 401 });
  const snap = await snapshot();
  const r = await enterDaily(wallet, daily(snap, wallet).day, snap.season.index);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 402 });
}
