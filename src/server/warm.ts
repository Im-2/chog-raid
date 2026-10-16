import "server-only";
import { loadRoom } from "@/lib/rooms";
import { getStore } from "./store";

/**
 * Keep-warm ping (GET on the raid routes, called on a schedule by .github/workflows/keep-warm.yml):
 * opens the database connection and builds a room, so the next real raid on this server instance
 * doesn't pay for a cold start. Reads only.
 */
export async function warm(): Promise<Response> {
  const t0 = performance.now();
  await Promise.all([getStore().getKv("warm").catch(() => null), loadRoom(1).catch(() => null)]);
  return Response.json({ ok: true, ms: Math.round(performance.now() - t0) }, { headers: { "Cache-Control": "no-store" } });
}
