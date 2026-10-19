import { ensureSnapshot } from "@/server/rewards";
import { snapshotDeps } from "@/server/rewardsDeps";
import { snapshot } from "@/server/progress";

/**
 * Called by the scheduled job in vercel.json shortly after each season ends. Stores the final
 * ranking snapshot once (immutable). Requires the CRON_SECRET env var: Vercel sends it as a
 * Bearer token. With no secret configured this route does nothing. It only reads the chain.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const snap = await snapshot(0);
  const season = snap.season.index - 1;
  if (season < 0) return Response.json({ ok: true, skipped: "no finished season yet" });
  try {
    const { created, snapshot: s } = await ensureSnapshot(season, await snapshotDeps());
    return Response.json({ ok: true, season: season + 1, created, wardens: s.wardens.length, raiders: s.raiders.length, pool: s.pool.state });
  } catch (e) {
    console.error("season snapshot:", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
