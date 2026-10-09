// Wallet sign-in (EIP-4361 "Sign-In with Ethereum") and signed session tokens.
// Pure functions: the secret, clock and signature verifier are passed in, so this is testable.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

export const SESSION_TTL_S = 7 * 24 * 3600;
export const NONCE_TTL_S = 10 * 60;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** `payload.signature` token. Tamper-proof, not secret. */
export function signToken(secret: string, payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${mac(secret, body)}`;
}

export function readToken<T extends { exp: number }>(secret: string, token: string | undefined, now = Date.now()): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const payload = JSON.parse(unb64(body)) as T;
    return typeof payload.exp === "number" && payload.exp * 1000 > now ? payload : null;
  } catch {
    return null;
  }
}

export type SignatureVerifier = (args: { address: `0x${string}`; message: string; signature: Hex }) => Promise<boolean>;

/** EOA-only verifier (no RPC). The onchain path also supports smart-contract wallets via the public client. */
export const eoaVerifier: SignatureVerifier = ({ address, message, signature }) => verifyMessage({ address, message, signature });

/**
 * Check a signed SIWE message: right domain, the nonce we issued, fresh, and a valid signature.
 * Returns the checksummed address that signed in.
 */
export async function verifySignIn(
  input: { message: unknown; signature: unknown },
  expected: { domain: string; nonce: string; now?: Date },
  verify: SignatureVerifier,
): Promise<{ ok: true; address: `0x${string}` } | { ok: false; error: string }> {
  if (typeof input.message !== "string" || typeof input.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(input.signature)) {
    return { ok: false, error: "Missing message or signature." };
  }
  const message = input.message;
  const fields = parseSiweMessage(message);
  if (!fields.address || !isAddress(fields.address)) return { ok: false, error: "Malformed sign-in message." };
  const now = expected.now ?? new Date();
  if (!validateSiweMessage({ message: fields, domain: expected.domain, nonce: expected.nonce, time: now })) {
    return { ok: false, error: "Sign-in message is for another site, expired, or reused. Try again." };
  }
  if (fields.issuedAt && now.getTime() - fields.issuedAt.getTime() > NONCE_TTL_S * 1000) {
    return { ok: false, error: "Sign-in message expired. Try again." };
  }
  const address = getAddress(fields.address);
  let valid = false;
  try {
    valid = await verify({ address, message, signature: input.signature as Hex });
  } catch {
    valid = false;
  }
  return valid ? { ok: true, address } : { ok: false, error: "Signature doesn't match the wallet." };
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
