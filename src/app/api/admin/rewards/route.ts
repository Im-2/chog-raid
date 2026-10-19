import { ensureSnapshot, isAdminWallet, snapshotCsv, snapshotKey, type SeasonSnapshot } from "@/server/rewards";
import { snapshotDeps } from "@/server/rewardsDeps";
import { snapshot } from "@/server/progress";
import { sessionAddress } from "@/server/session";
import { getStore } from "@/server/store";

/**
 * Admin only (a signed-in wallet listed in ADMIN_WALLETS; anyone else gets a plain 404).
 * GET ?season=N&format=csv|json[&create=1]: the final ranking snapshot, for paying out BY HAND.
 * Reads and exports only: no transfers, no keys. `create=1` takes the snapshot if the season has
 * ended and none exists yet (it is stored once and never changes).
 */
export async function GET(req: Request) {
  if (!isAdminWallet(await sessionAddress())) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const snap = await snapshot();
  const season = Number(url.searchParams.get("season") ?? snap.season.index - 1);
  if (!Number.isInteger(season) || season < 0 || season >= snap.season.index) return Response.json({ error: "That season hasn't ended." }, { status: 400 });

  let doc = await getStore().getKv<SeasonSnapshot>(snapshotKey(season));
  if (!doc && url.searchParams.get("create") === "1") {
    try {
      doc = (await ensureSnapshot(season, await snapshotDeps())).snapshot;
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  if (!doc) return Response.json({ error: "No snapshot for that season yet. Add &create=1 to take it now." }, { status: 404 });

  if (url.searchParams.get("format") === "json") return Response.json(doc);
  return new Response(snapshotCsv(doc), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chog-raid-season-${season + 1}-rewards.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
