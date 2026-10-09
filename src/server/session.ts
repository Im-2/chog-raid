import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createPublicClient, http, type Hex } from "viem";
import { env } from "@/lib/env";
import { eoaVerifier, NONCE_TTL_S, readToken, SESSION_TTL_S, signToken, type SignatureVerifier } from "./auth";

const SESSION_COOKIE = "cr_session";
const NONCE_COOKIE = "cr_nonce";

let devSecret: string | undefined;
function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production.");
  if (!devSecret) {
    devSecret = randomBytes(32).toString("hex");
    console.warn("SESSION_SECRET not set: using a random dev secret (sign-ins reset when the server restarts).");
  }
  return devSecret;
}

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/** The signed-in wallet address, or null. */
export async function sessionAddress(): Promise<`0x${string}` | null> {
  const jar = await cookies();
  return readToken<{ a: `0x${string}`; exp: number }>(secret(), jar.get(SESSION_COOKIE)?.value)?.a ?? null;
}

export async function startSession(address: `0x${string}`) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signToken(secret(), { a: address, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S }), cookieOpts(SESSION_TTL_S));
  jar.delete(NONCE_COOKIE);
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Issue a one-time nonce, remembered in a signed short-lived cookie. */
export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(12).toString("hex");
  (await cookies()).set(NONCE_COOKIE, signToken(secret(), { n: nonce, exp: Math.floor(Date.now() / 1000) + NONCE_TTL_S }), cookieOpts(NONCE_TTL_S));
  return nonce;
}

export async function currentNonce(): Promise<string | null> {
  return readToken<{ n: string; exp: number }>(secret(), (await cookies()).get(NONCE_COOKIE)?.value)?.n ?? null;
}

/** Verifies EOA signatures, and smart-contract wallets (ERC-1271/6492) when an RPC is configured. */
export function signatureVerifier(): SignatureVerifier {
  if (!env.rpcUrl) return eoaVerifier;
  const client = createPublicClient({ transport: http(env.rpcUrl) });
  return ({ address, message, signature }) => client.verifyMessage({ address, message, signature: signature as Hex });
}
