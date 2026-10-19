"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PerkStatus } from "@/config/chog";
import { useSession } from "../wallet/session";

export type ChogPayment = {
  amount: number;
  amountWei: string;
  token: string;
  recipient: string;
  chainId: number;
  chainName: string;
  rpcUrl: string | null;
  boughtToday: number;
  maxPerDay: number;
  bonusAttempts: number;
};

export type ChogState = {
  /** Balance + perks are on. */
  enabled: boolean;
  signedIn: boolean;
  wallet: string | null;
  token: string | null;
  explorer: string | null;
  /** Real on-chain balance in whole $CHOG, or null (no wallet, or it couldn't be read). */
  balance: string | null;
  balanceUnavailable: boolean;
  perks: PerkStatus[];
  tier: string | null;
  effects: { badge: boolean; extraAttempts: number; torch: string | null };
  attempts: { free: number; paid: number; perk: number; allowed: number; used: number };
  /** Present only for a signed-in wallet when the payment is configured. */
  payment: ChogPayment | null;
  paymentConfigured: boolean;
  paymentAmount: number | null;
};

// One shared fetch for every $CHOG surface on the page (nav badge, panel, Daily card, wallet menu).
let state: ChogState | null = null;
let failed = false;
let loadedFor: string | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load(address: string | null) {
  loadedFor = address;
  try {
    const r = await fetch("/api/chog", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    state = (await r.json()) as ChogState;
    failed = false;
  } catch {
    failed = true;
  }
  emit();
}

/** Re-read after something changed (a payment, a sign-in). */
export function refreshChog() {
  return load(loadedFor ?? null);
}

/** null while loading; `failed` only if the request itself failed (the UI then hides $CHOG quietly). */
export function useChog(): { chog: ChogState | null; failed: boolean } {
  const session = useSession();
  const chog = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => null,
  );
  useEffect(() => {
    if (session.status === "loading") return;
    if (loadedFor !== session.address) void load(session.address);
  }, [session.status, session.address]);
  return { chog, failed };
}

/** 12,345.6 -> "12.3k", 0 -> "0", 0.5 -> "0.5". */
export function fmtChog(balance: string | number | null | undefined): string {
  if (balance === null || balance === undefined) return "—";
  const n = Number(balance);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n < 1) return n.toFixed(2);
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: n >= 1000 ? 1 : n < 100 ? 1 : 0 }).format(n);
}

/** Full, grouped number for the panel. */
export const fmtChogFull = (balance: string | number | null | undefined) =>
  balance === null || balance === undefined ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(Number(balance));

export const explorerUrl = (explorer: string | null, kind: "tx" | "token" | "address", value: string) =>
  explorer ? `${explorer}/${kind}/${value}` : null;
