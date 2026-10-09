import { readJson } from "@/server/deps";
import { verifySignIn } from "@/server/auth";
import { currentNonce, signatureVerifier, startSession } from "@/server/session";

/** POST { message, signature }: verify a Sign-In with Ethereum message and start a session. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const nonce = await currentNonce();
  if (!nonce) return Response.json({ error: "Sign-in timed out. Try again." }, { status: 400 });
  const domain = req.headers.get("host") ?? new URL(req.url).host;
  const result = await verifySignIn({ message: body?.message, signature: body?.signature }, { domain, nonce }, signatureVerifier());
  if (!result.ok) return Response.json({ error: result.error }, { status: 401 });
  await startSession(result.address);
  return Response.json({ address: result.address });
}
