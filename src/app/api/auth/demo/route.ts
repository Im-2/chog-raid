import { env } from "@/lib/env";
import { startSession } from "@/server/session";

/**
 * Mock mode only: sign in as MOCK_OWNER_ADDRESS (owner of mock Chogs 1-10) without a wallet,
 * so the defend flow can be tried with no wallet. Never available with real onchain data.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production" || env.nftAdapter !== "mock" || process.env.DEMO_SIGNIN !== "1" || !env.mockOwner) {
    return Response.json({ error: "Demo sign-in is off." }, { status: 404 });
  }
  await startSession(env.mockOwner);
  return Response.json({ address: env.mockOwner });
}
