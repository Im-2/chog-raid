"use client";

import { useSyncExternalStore } from "react";
import { getAddress, toHex } from "viem";
import { createSiweMessage } from "viem/siwe";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
type Announced = { info: { name: string; rdns: string; icon: string }; provider: Eip1193 };

export type SessionState = {
  status: "loading" | "ready" | "signing";
  address: string | null;
  /** Mock-mode demo owner address when demo sign-in is enabled. */
  demo: string | null;
  error: string | null;
};

let state: SessionState = { status: "loading", address: null, demo: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<SessionState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

// EIP-6963 wallet discovery (MetaMask, Rabby, Phantom, Backpack, ...).
const wallets: Announced[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = (e as CustomEvent<Announced>).detail;
    if (d?.provider && !wallets.some((w) => w.info.rdns === d.info.rdns)) wallets.push(d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function pickProvider(): Eip1193 | null {
  if (wallets.length) return wallets[0].provider;
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum as Eip1193) ?? null;
}

let loaded = false;
async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    const j = await r.json();
    set({ status: "ready", address: j.address ?? null, demo: j.demo ?? null });
  } catch {
    set({ status: "ready" });
  }
}

/** Ask the wallet to sign a Sign-In with Ethereum message. No transaction, no gas. */
export async function signIn(): Promise<string | null> {
  const provider = pickProvider();
  if (!provider) {
    set({ error: "No wallet found. Install MetaMask or Rabby, or open this site in your wallet's browser." });
    return null;
  }
  set({ status: "signing", error: null });
  try {
    const [account] = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!account) throw new Error("No account selected.");
    const address = getAddress(account);
    const { nonce } = await (await fetch("/api/auth/nonce", { cache: "no-store" })).json();
    const message = createSiweMessage({
      domain: window.location.host,
      address,
      statement: "Sign in to Chog Raid to defend your Chogs. This costs no gas and moves no tokens.",
      uri: window.location.origin,
      version: "1",
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 143,
      nonce,
      issuedAt: new Date(),
    });
    const signature = await provider.request({ method: "personal_sign", params: [toHex(message), address] });
    const r = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Sign-in failed.");
    set({ status: "ready", address: j.address });
    return j.address;
  } catch (e) {
    const err = e as { code?: number; message?: string };
    set({ status: "ready", error: err.code === 4001 ? "Signature request was cancelled." : (err.message ?? "Sign-in failed.") });
    return null;
  }
}

export async function demoSignIn() {
  const r = await fetch("/api/auth/demo", { method: "POST" });
  const j = await r.json();
  if (r.ok) set({ address: j.address, error: null });
  else set({ error: j.error });
}

export async function signOut() {
  await fetch("/api/auth/session", { method: "DELETE" });
  set({ address: null });
}

export function clearSessionError() {
  set({ error: null });
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void load();
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
