import { issueNonce } from "@/server/session";

/** One-time nonce for the sign-in message. */
export async function GET() {
  return Response.json({ nonce: await issueNonce() }, { headers: { "Cache-Control": "no-store" } });
}
