import { listAlerts, markAlertsSeen } from "@/server/alerts";
import { snapshot } from "@/server/progress";
import { sessionAddress } from "@/server/session";

/** Raid alerts for the signed-in holder: who raided which of your Chogs, and how it went. */
export async function GET() {
  const wallet = await sessionAddress();
  if (!wallet) return Response.json({ alerts: [] });
  return Response.json({ alerts: await listAlerts(await snapshot(0), wallet) }, { headers: { "Cache-Control": "no-store" } });
}

/** Mark all alerts read. */
export async function POST() {
  const wallet = await sessionAddress();
  if (!wallet) return Response.json({ error: "Not signed in." }, { status: 401 });
  await markAlertsSeen(wallet);
  return Response.json({ ok: true });
}
