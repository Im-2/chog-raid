"use client";

import { useEffect, useState } from "react";
import type { PayoutBand } from "@/config/rewards";
import { useSession } from "../wallet/session";

export type Standing = { rank: number; inZone: boolean; sharePct: number; amount: number; toCutoff: number | null };
export type RewardsState = {
  season: { index: number; endsAt: string };
  pool: {
    state: "unconfigured" | "unavailable" | "unfunded" | "funded";
    balance: string | null;
    address: string | null;
    explorer: string | null;
    target: number | null;
    targetLabel: string;
  };
  split: { wardens: number; raiders: number };
  topN: number;
  payout: PayoutBand[];
  eligibility: { raiderMinRoomsCleared: number };
  eligible: { wardens: number; raiders: number };
  me: { isWallet: boolean; wardens: Standing | null; raiders: Standing | null } | null;
  lastSnapshot: { season: number; takenAt: string; poolBalance: string | null; poolState: string } | null;
  admin: boolean;
};

/** The Season Rewards view for the current visitor (re-read when they sign in or out). */
export function useRewards(): { data: RewardsState | null; failed: boolean } {
  const session = useSession();
  const [data, setData] = useState<RewardsState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (session.status === "loading") return;
    let live = true;
    fetch("/api/rewards", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => live && (setData(j), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [session.status, session.address]);
  return { data, failed };
}

export const POOL_PILL: Record<RewardsState["pool"]["state"], { label: string; tone: "off" | "on" | "warn" }> = {
  unconfigured: { label: "Pool not set up yet", tone: "off" },
  unavailable: { label: "Pool balance unavailable", tone: "warn" },
  unfunded: { label: "Pool not funded yet", tone: "off" },
  funded: { label: "Funded", tone: "on" },
};

/** "Ranks 4–10" / "Rank 1". */
export const bandLabel = (b: PayoutBand) => (b.from === b.to ? `Rank ${b.from}` : `Ranks ${b.from}–${b.to}`);
