import { env } from "@/lib/env";
import { paymentConfig, verifyPayment, viemChain } from "@/server/chog";
import { sessionAddress } from "@/server/session";

/**
 * Apply an optional $CHOG payment: POST { txHash }. Signed-in wallets only. The transaction is
 * checked on-chain here (see verifyPayment); the browser's word is never trusted. 409 "pending"
 * means "not confirmed yet, ask again".
 */
export async function POST(req: Request) {
  if (!paymentConfig() || !env.rpcUrl) return Response.json({ error: "Payments aren't available." }, { status: 404 });
  const wallet = await sessionAddress();
  if (!wallet) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const r = await verifyPayment({ txHash: body?.txHash, wallet }, { chain: viemChain(env.rpcUrl) });
    return r.ok ? Response.json(r) : Response.json({ code: r.code, error: r.error }, { status: r.status });
  } catch (e) {
    console.error("chog pay:", e);
    return Response.json({ error: "Couldn't check the payment right now. Try again in a moment." }, { status: 502 });
  }
}
