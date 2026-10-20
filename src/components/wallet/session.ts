"use client";

import { useSyncExternalStore } from "react";
import { getAddress, toHex } from "viem";
import { createSiweMessage } from "viem/siwe";
import type { AccountInfo, WalletApi } from "./appkit";
import { CHAIN_ID } from "./chain";

// Two layers, kept separate on purpose:
//   1. the wallet connection (Reown AppKit + wagmi, loaded lazily in ./appkit), and
//   2. the game session: a Sign-In-with-Ethereum message signed by the connected wallet and verified
//      by the server (/api/auth/*). Ownership checks happen on the server and are unchanged.

export type SessionState = {
  status: "loading" | "ready" | "signing";
  /** The signed-in (server-verified) address. */
  address: string | null;
  /** Mock-mode demo owner address when demo sign-in is enabled (dev flag, never production). */
  demo: string | null;
  error: string | null;
  /** The connected wallet (may differ from the session, e.g. after switching accounts). */
  wallet: AccountInfo;
  /** Connect list shown by our own UI (only when WalletConnect isn't configured). */
  fallbackOpen: boolean;
  /** Whether the wallet module has loaded. */
  walletReady: boolean;
};

let state: SessionState = {
  status: "loading",
  address: null,
  demo: null,
  error: null,
  wallet: { address: null, chainId: null, connected: false },
  fallbackOpen: false,
  walletReady: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<SessionState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

// ---- wallet module (lazy) ----

let walletPromise: Promise<WalletApi> | null = null;
let wallet: WalletApi | null = null;
/** True from "Connect" being pressed until a session exists or the user backs out. */
let wantSignIn = false;
let signing = false;

/** Load AppKit/wagmi once. Heavy, so it only runs on Connect or when a session already exists. */
export function loadWallet(): Promise<WalletApi> {
  if (!walletPromise) {
    walletPromise = import("./appkit").then(({ initWallet }) => {
      const w = initWallet();
      wallet = w;
      set({ walletReady: true, wallet: w.account() });
      w.onAccount((a) => {
        set({ wallet: a });
        // Let AppKit finish and close its own connect flow before asking for the signature.
        if (a.connected && wantSignIn && !state.address) setTimeout(() => void finishSignIn(), 400);
        // The wallet switched to a different account than the signed-in one: the old session no longer matches.
        if (a.connected && a.address && state.address && a.address.toLowerCase() !== state.address.toLowerCase() && !signing) {
          void endServerSession("Your wallet switched accounts. Sign in again to continue.");
        }
      });
      w.onModal((open) => {
        if (!open && !w.account().connected) wantSignIn = false;
      });
      return w;
    });
  }
  return walletPromise;
}

/** The connected wallet's provider (for sending transactions); null if nothing is connected. */
export async function getWalletProvider() {
  const w = wallet ?? (await loadWallet());
  return w.provider();
}

/** Ask the connected wallet to switch to the game chain (Monad). */
export async function switchToGameChain() {
  const w = await loadWallet();
  try {
    await w.switchToGameChain();
    set({ error: null });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    set({ error: err.code === 4001 ? "Network switch was cancelled." : "Couldn't switch the network. Switch to Monad in your wallet." });
  }
}

let loaded = false;
async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    const j = await r.json();
    set({ status: "ready", address: j.address ?? null, demo: j.demo ?? null });
    // A signed-in player may need to pay or send a transaction, so restore the wallet connection quietly.
    if (j.address && typeof window !== "undefined") {
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
      idle(() => void loadWallet());
    }
  } catch {
    set({ status: "ready" });
  }
}

/**
 * Connect Button: open the wallet modal; once a wallet is connected, ask it to sign a
 * Sign-In-with-Ethereum message (no transaction, no gas) and start the session.
 */
export async function signIn(): Promise<string | null> {
  set({ error: null });
  wantSignIn = true;
  try {
    const w = await loadWallet();
    if (w.account().connected) return await finishSignIn();
    if (w.mode === "appkit") w.open();
    else set({ fallbackOpen: true });
  } catch (e) {
    wantSignIn = false;
    console.error("[wallet] couldn't load the wallet connector", e);
    set({ error: "Couldn't load wallet support. Check your connection and try again." });
  }
  return null;
}

async function finishSignIn(): Promise<string | null> {
  if (signing || !wallet) return null;
  signing = true;
  wantSignIn = false;
  set({ status: "signing", error: null, fallbackOpen: false });
  wallet.close();
  try {
    const provider = await wallet.provider();
    const account = wallet.account().address;
    if (!provider || !account) throw new Error("No wallet account is connected.");
    const address = getAddress(account);
    const { nonce } = await (await fetch("/api/auth/nonce", { cache: "no-store" })).json();
    const message = createSiweMessage({
      domain: window.location.host,
      address,
      statement: "Sign in to Chog Raid to defend your Chogs. This costs no gas and moves no tokens.",
      uri: window.location.origin,
      version: "1",
      chainId: CHAIN_ID,
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
  } finally {
    signing = false;
  }
}

export async function demoSignIn() {
  const r = await fetch("/api/auth/demo", { method: "POST" });
  const j = await r.json();
  if (r.ok) set({ address: j.address, error: null });
  else set({ error: j.error });
}

async function endServerSession(error: string | null = null) {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  set({ address: null, error });
}

/** Disconnect: end the game session and the wallet connection. */
export async function signOut() {
  await endServerSession();
  if (wallet) await wallet.disconnect();
}

/** Switch account: disconnect, then open the wallet list again (a new connection asks to sign in). */
export async function switchAccount() {
  await endServerSession();
  const w = await loadWallet();
  await w.disconnect();
  await signIn();
}

export function closeFallback() {
  wantSignIn = false;
  set({ fallbackOpen: false });
}

export async function connectFallback(index: number) {
  const w = await loadWallet();
  const c = w.connectors()[index];
  if (!c) return;
  try {
    await w.connectWith(c);
  } catch (e) {
    const err = e as { code?: number; message?: string };
    set({ error: err.code === 4001 ? "Connection was cancelled." : (err.message?.split("\n")[0] ?? "Couldn't connect.") });
  }
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
