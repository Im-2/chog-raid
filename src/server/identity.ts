import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "cr_guest";

/** Public id for a guest secret. Safe to show in raid logs; the secret itself never leaves the cookie. */
export function guestIdFor(secret: string): string {
  return `guest:${createHash("sha256").update(secret).digest("hex").slice(0, 16)}`;
}

/**
 * Who is making this request. Until wallet sign-in (milestone 5) everyone is a guest,
 * identified by an httpOnly random secret cookie. Creates one when `create` is set.
 */
export async function currentRaider(create = false): Promise<string | null> {
  const jar = await cookies();
  let secret = jar.get(COOKIE)?.value;
  if (!secret || !/^[a-f0-9]{48}$/.test(secret)) {
    if (!create) return null;
    secret = randomBytes(24).toString("hex");
    jar.set(COOKIE, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return guestIdFor(secret);
}

/** Short display label, e.g. "Guest 3fa2". */
export function raiderLabel(id: string): string {
  if (id.startsWith("guest:")) return `Guest ${id.slice(6, 10)}`;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
