// $CHOG: every number in one place. $CHOG is an optional bonus layer: the game is fully playable
// without it, free attempts are the default, and nothing is gated behind it.
//
// What is real (nothing simulated):
//   - the wallet's $CHOG balance (an on-chain ERC-20 read) and the perks it unlocks
//   - an optional payment for a bonus daily attempt, verified on-chain by the server
// There is no prize, no payout and no funding of any $CHOG reward.
//
// Env (see .env.example):
//   NEXT_PUBLIC_FEATURE_CHOG_TOKEN   balance + perks; on unless set to "false"
//   NEXT_PUBLIC_CHOG_TOKEN_ADDRESS   the $CHOG ERC-20 on Monad
//   CHOG_PRIZE_POOL_ADDRESS          where optional payments are sent; unset = the payment is hidden
//   CHOG_PAYMENTS_ENABLED            "false" turns the payment off even if the address is set
//   CHOG_PAYMENT_AMOUNT              whole $CHOG per bonus attempt (default below)

export type Perk = {
  id: string;
  tier: string;
  /** Whole $CHOG a wallet must hold to unlock it. */
  minBalance: number;
  title: string;
  blurb: string;
  /** Extra counted attempts on the Daily Raid (a convenience: more tries, never an easier room). */
  extraAttempts?: number;
  /** Cosmetic torch color on rooms you raid. */
  torch?: string;
  /** Shows the holder badge. */
  badge?: boolean;
};

export const CHOG = {
  decimals: 18,

  /**
   * Holder perks. Cosmetic or convenience only: none changes a room's difficulty, the points a
   * clear earns, or any ranking rule, and nothing in the game requires holding $CHOG.
   */
  perks: [
    { id: "badge", tier: "Holder", minBalance: 100, title: "$CHOG holder badge", blurb: "A badge next to your name on your profile and the Daily card.", badge: true },
    { id: "attempt", tier: "Believer", minBalance: 1_000, title: "One extra daily raid", blurb: "One more counted attempt on the Daily Raid, every day.", extraAttempts: 1 },
    { id: "torch", tier: "Torchbearer", minBalance: 10_000, title: "Golden torch", blurb: "Your torch burns gold in every room you raid. Cosmetic only.", torch: "#ffd166" },
  ] as readonly Perk[],

  daily: {
    /** Finished attempts per day that count toward the daily board. More are still playable. */
    freeAttempts: 3,
  },

  /** The optional "bonus attempt" payment. */
  payment: {
    /** Whole $CHOG, when CHOG_PAYMENT_AMOUNT isn't set. */
    defaultAmount: 10,
    /** Extra counted daily attempts one payment buys. */
    bonusAttempts: 1,
    /** Payments allowed per wallet per UTC day. */
    maxPerDay: 3,
    /** Blocks a payment must be buried under before the server accepts it. */
    confirmations: 2,
    /** A payment older than this can't be used for a bonus attempt. */
    maxAgeHours: 24,
  },
} as const;

export type PerkStatus = Perk & {
  unlocked: boolean;
  /** Whole $CHOG still needed to unlock it (0 when unlocked). */
  needed: number;
};

/** Every perk with whether this balance unlocks it, and how much more would. Pure. */
export function perksFor(balance: number | string | null | undefined): PerkStatus[] {
  const b = balance === null || balance === undefined ? 0 : Number(balance);
  const have = Number.isFinite(b) && b > 0 ? b : 0;
  return CHOG.perks.map((p) => ({ ...p, unlocked: have >= p.minBalance, needed: Math.max(0, Math.ceil(p.minBalance - have)) }));
}

/** Perk-derived values for a balance. */
export function perkEffects(balance: number | string | null | undefined) {
  const unlocked = perksFor(balance).filter((p) => p.unlocked);
  return {
    badge: unlocked.some((p) => p.badge),
    extraAttempts: unlocked.reduce((s, p) => s + (p.extraAttempts ?? 0), 0),
    torch: unlocked.find((p) => p.torch)?.torch ?? null,
    tier: unlocked.at(-1)?.tier ?? null,
  };
}
