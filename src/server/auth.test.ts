import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { eoaVerifier, readToken, signToken, verifySignIn } from "./auth";

const SECRET = "x".repeat(40);

describe("session tokens", () => {
  it("round-trips and rejects tampering or expiry", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const tok = signToken(SECRET, { a: "0xabc", exp });
    expect(readToken<{ a: string; exp: number }>(SECRET, tok)?.a).toBe("0xabc");
    expect(readToken(SECRET.replace("x", "y"), tok)).toBeNull();
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ a: "0xevil", exp })).toString("base64url");
    expect(readToken(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(readToken(SECRET, `${body}.${sig}`, (exp + 1) * 1000)).toBeNull();
    expect(readToken(SECRET, undefined)).toBeNull();
  });
});

describe("sign-in with ethereum", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const domain = "localhost:3000";
  const nonce = "abcdef1234567890";
  const make = (over: Partial<Parameters<typeof createSiweMessage>[0]> = {}) =>
    createSiweMessage({
      domain,
      address: account.address,
      uri: `http://${domain}`,
      version: "1",
      chainId: 143,
      nonce,
      issuedAt: new Date(),
      statement: "Sign in to Chog Raid.",
      ...over,
    });

  it("accepts a valid signature for the issued nonce", async () => {
    const message = make();
    const signature = await account.signMessage({ message });
    const r = await verifySignIn({ message, signature }, { domain, nonce }, eoaVerifier);
    expect(r).toEqual({ ok: true, address: account.address });
  });

  it("rejects another wallet's signature, a wrong nonce, a wrong domain, and stale messages", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const message = make();
    const bad = await other.signMessage({ message });
    expect((await verifySignIn({ message, signature: bad }, { domain, nonce }, eoaVerifier)).ok).toBe(false);

    const good = await account.signMessage({ message });
    expect((await verifySignIn({ message, signature: good }, { domain, nonce: "different00000" }, eoaVerifier)).ok).toBe(false);
    expect((await verifySignIn({ message, signature: good }, { domain: "evil.example", nonce }, eoaVerifier)).ok).toBe(false);

    const old = make({ issuedAt: new Date(Date.now() - 60 * 60 * 1000) });
    const oldSig = await account.signMessage({ message: old });
    expect((await verifySignIn({ message: old, signature: oldSig }, { domain, nonce }, eoaVerifier)).ok).toBe(false);
  });

  it("rejects junk input", async () => {
    expect((await verifySignIn({ message: 1, signature: "nope" }, { domain, nonce }, eoaVerifier)).ok).toBe(false);
  });
});
