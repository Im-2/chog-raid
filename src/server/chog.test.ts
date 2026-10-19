import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { CHOG, perkEffects, perksFor } from "@/config/chog";
import { allowedAttempts, bonusPayments, isHolder, paymentConfig, verifyPayment, type ChainReader, type PaymentConfig } from "./chog";
import { dailyAttempts, dailyBoard, dayKey } from "./retention";
import { createMemoryStore } from "./store/memory";
import type { RaidRecord } from "./store/types";

vi.mock("server-only", () => ({}));

const TOKEN = "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777" as const;
const OTHER_TOKEN = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x00000000000000000000000000000000000000Aa" as const;
const ALICE = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const BOB = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";
const CFG: PaymentConfig = { token: TOKEN, recipient: RECIPIENT, amount: 10 };
const NOW = new Date("2026-10-19T12:00:00Z");
const DAY = dayKey(NOW);
const pad = (a: string) => `0x${"0".repeat(24)}${a.slice(2).toLowerCase()}`;
const wei = (n: number) => `0x${(BigInt(n) * 10n ** 18n).toString(16).padStart(64, "0")}`;
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
let n = 0;
const hash = () => `0x${(++n).toString(16).padStart(64, "0")}` as `0x${string}`;

type Tx = { status?: "success" | "reverted"; block?: bigint; at?: Date; logs?: { address: string; topics: string[]; data: string }[] };
const transfer = (p: { token?: string; from?: string; to?: string; amount?: number } = {}) => ({
  address: p.token ?? TOKEN,
  topics: [TRANSFER, pad(p.from ?? ALICE), pad(p.to ?? RECIPIENT)],
  data: wei(p.amount ?? 10),
});

/** A fake chain: latest block 1000, decimals 18; transactions are whatever each test registers. */
function chain(txs: Record<string, Tx>, latest = 1000n): ChainReader {
  return {
    async receipt(h) {
      const t = txs[h];
      return t ? { status: t.status ?? "success", blockNumber: t.block ?? 990n, logs: t.logs ?? [transfer()] } : null;
    },
    latestBlock: async () => latest,
    blockTimestamp: async (b) => Math.floor((txs[Object.keys(txs).find((k) => (txs[k].block ?? 990n) === b) ?? ""]?.at ?? NOW).getTime() / 1000),
    decimals: async () => 18,
  };
}
const setup = (txs: Record<string, Tx>) => ({ store: createMemoryStore(), chain: chain(txs) });
const pay = (s: ReturnType<typeof setup>, txHash: unknown, wallet = ALICE, config: PaymentConfig | null = CFG) =>
  verifyPayment({ txHash, wallet }, { chain: s.chain, store: s.store, config, now: NOW });

describe("payment verification (on-chain, never the client's word)", () => {
  it("accepts a real transfer from the wallet to the recipient and grants one bonus attempt", async () => {
    const h = hash();
    const s = setup({ [h]: {} });
    expect(await pay(s, h)).toEqual({ ok: true, paid: 1, allowed: allowedAttempts(1) });
    expect(await bonusPayments(s.store, ALICE, DAY)).toBe(1);
  });

  it("accepts overpaying, and any address casing", async () => {
    const h = hash();
    const s = setup({ [h]: { logs: [transfer({ amount: 25, from: ALICE.toLowerCase(), to: RECIPIENT.toUpperCase().replace("0X", "0x") })] } });
    expect((await pay(s, h, ALICE.toUpperCase().replace("0X", "0x"))).ok).toBe(true);
  });

  it("refuses less than the configured amount", async () => {
    const h = hash();
    const r = await pay(setup({ [h]: { logs: [transfer({ amount: 9 })] } }), h);
    expect(r).toMatchObject({ ok: false, status: 402, code: "mismatch" });
  });

  it("refuses a payment to anyone else", async () => {
    const h = hash();
    expect(await pay(setup({ [h]: { logs: [transfer({ to: BOB })] } }), h)).toMatchObject({ ok: false, code: "mismatch" });
  });

  it("refuses a payment made by someone else (you can't claim another wallet's transfer)", async () => {
    const h = hash();
    const s = setup({ [h]: { logs: [transfer({ from: BOB })] } });
    expect(await pay(s, h, ALICE)).toMatchObject({ ok: false, code: "mismatch" });
    expect(await bonusPayments(s.store, ALICE, DAY)).toBe(0);
  });

  it("refuses a Transfer event from any other token contract", async () => {
    const h = hash();
    expect(await pay(setup({ [h]: { logs: [transfer({ token: OTHER_TOKEN })] } }), h)).toMatchObject({ ok: false, code: "mismatch" });
  });

  it("refuses malformed Transfer events", async () => {
    const h = hash();
    const bad = { address: TOKEN, topics: [TRANSFER, pad(ALICE)], data: wei(10) }; // missing `to`
    expect(await pay(setup({ [h]: { logs: [bad] } }), h)).toMatchObject({ ok: false, code: "mismatch" });
  });

  it("refuses a reverted transaction", async () => {
    const h = hash();
    expect(await pay(setup({ [h]: { status: "reverted" } }), h)).toMatchObject({ ok: false, status: 402 });
  });

  it("asks the client to wait while the transaction is unknown or not buried deep enough", async () => {
    const unknown = hash();
    const shallow = hash();
    const s = { store: createMemoryStore(), chain: chain({ [shallow]: { block: 1000n } }) }; // 1 confirmation < required
    expect(await pay(s, unknown)).toMatchObject({ ok: false, status: 409, code: "pending" });
    expect(await pay(s, shallow)).toMatchObject({ ok: false, status: 409, code: "pending" });
    // Waiting doesn't consume anything: once it's buried, the same hash works.
    const deep = { store: s.store, chain: chain({ [shallow]: { block: 1000n } }, 1005n) };
    expect((await pay(deep, shallow)).ok).toBe(true);
  });

  it("refuses an old payment", async () => {
    const h = hash();
    const old = new Date(NOW.getTime() - (CHOG.payment.maxAgeHours + 1) * 3_600_000);
    expect(await pay(setup({ [h]: { at: old } }), h)).toMatchObject({ ok: false, code: "mismatch" });
  });

  it("refuses anything that isn't a transaction hash", async () => {
    const s = setup({});
    for (const bad of [undefined, null, 5, "", "0x123", "not a hash", `0x${"z".repeat(64)}`, [hash()]]) {
      expect(await pay(s, bad)).toMatchObject({ ok: false, status: 400, code: "bad_hash" });
    }
  });

  it("awards nothing if an RPC call fails, and the same hash works once the chain answers", async () => {
    const h = hash();
    const real = chain({ [h]: {} });
    for (const broken of ["receipt", "latestBlock", "blockTimestamp", "decimals"] as const) {
      const store = createMemoryStore();
      const flaky = { ...real, [broken]: async () => Promise.reject(new Error("rpc down")) } as ChainReader;
      await expect(verifyPayment({ txHash: h, wallet: ALICE }, { chain: flaky, store, config: CFG, now: NOW })).rejects.toThrow("rpc down");
      expect(await bonusPayments(store, ALICE, DAY)).toBe(0);
      // Nothing was consumed: with a working chain the payment is accepted.
      expect((await verifyPayment({ txHash: h, wallet: ALICE }, { chain: real, store, config: CFG, now: NOW })).ok).toBe(true);
    }
  });

  it("is unavailable (not an error) when payments aren't configured", async () => {
    const h = hash();
    expect(await pay(setup({ [h]: {} }), h, ALICE, null)).toMatchObject({ ok: false, status: 404, code: "not_available" });
  });
});

describe("replay protection", () => {
  it("a transaction can only ever be used once", async () => {
    const h = hash();
    const s = setup({ [h]: {} });
    expect((await pay(s, h)).ok).toBe(true);
    expect(await pay(s, h)).toMatchObject({ ok: false, status: 409, code: "reused" });
    expect(await bonusPayments(s.store, ALICE, DAY)).toBe(1);
  });

  it("another wallet can't reuse it either, even one that is the recipient of nothing", async () => {
    const h = hash();
    const s = setup({ [h]: { logs: [transfer({ from: BOB })] } });
    expect((await pay(s, h, BOB)).ok).toBe(true);
    expect(await pay(s, h, BOB)).toMatchObject({ code: "reused" });
    expect(await pay(s, h, ALICE)).toMatchObject({ ok: false }); // not Alice's transfer, and used
  });

  it("matches the hash regardless of casing", async () => {
    const h = hash();
    const s = setup({ [h]: {} });
    expect((await pay(s, h)).ok).toBe(true);
    expect(await pay(s, h.toUpperCase().replace("0X", "0x"))).toMatchObject({ code: "reused" });
  });

  it("racing requests with the same hash grant exactly one attempt", async () => {
    const h = hash();
    const s = setup({ [h]: {} });
    const results = await Promise.all(Array.from({ length: 12 }, () => pay(s, h)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await bonusPayments(s.store, ALICE, DAY)).toBe(1);
  });

  it("racing requests with different hashes each get their own attempt, up to the daily limit", async () => {
    const hashes = Array.from({ length: 6 }, hash);
    const s = setup(Object.fromEntries(hashes.map((h) => [h, {}])));
    const results = await Promise.all(hashes.map((h) => pay(s, h)));
    expect(results.filter((r) => r.ok)).toHaveLength(CHOG.payment.maxPerDay);
    expect(await bonusPayments(s.store, ALICE, DAY)).toBe(CHOG.payment.maxPerDay);
  });

  it("stops at the daily limit, and the next day starts fresh", async () => {
    const hs = Array.from({ length: CHOG.payment.maxPerDay + 1 }, hash);
    const s = setup(Object.fromEntries(hs.map((h) => [h, {}])));
    for (const h of hs.slice(0, CHOG.payment.maxPerDay)) expect((await pay(s, h)).ok).toBe(true);
    expect(await pay(s, hs[CHOG.payment.maxPerDay])).toMatchObject({ ok: false, status: 429, code: "limit" });
    const tomorrow = await verifyPayment({ txHash: hs[CHOG.payment.maxPerDay], wallet: ALICE }, { chain: s.chain, store: s.store, config: CFG, now: new Date(NOW.getTime() + 86_400_000) });
    expect(tomorrow.ok).toBe(true);
  });

  it("insertKv is atomic: of many racing inserts exactly one wins", async () => {
    const s = createMemoryStore();
    const wins = await Promise.all(Array.from({ length: 20 }, (_, i) => s.insertKv("k", i)));
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await s.getKv("k")).toBe(wins.indexOf(true));
  });
});

describe("optional: on/off and configuration", () => {
  const keep = { ...process.env };
  afterEach(() => {
    process.env = { ...keep };
  });
  const set = (v: Record<string, string | undefined>) => {
    for (const [k, val] of Object.entries(v)) val === undefined ? delete process.env[k] : (process.env[k] = val);
  };
  const base = { CHOG_PAYMENTS_ENABLED: undefined, CHOG_PRIZE_POOL_ADDRESS: RECIPIENT, NEXT_PUBLIC_CHOG_TOKEN_ADDRESS: TOKEN, CHOG_PAYMENT_AMOUNT: undefined };

  it("is on with just the recipient address and the token address set (the flag defaults to on)", () => {
    set(base);
    expect(paymentConfig()).toEqual({ token: getAddress(TOKEN), recipient: getAddress(RECIPIENT), amount: CHOG.payment.defaultAmount });
  });

  it("is hidden (null), never an error, when the recipient isn't set or isn't an address", () => {
    set({ ...base, CHOG_PRIZE_POOL_ADDRESS: undefined });
    expect(paymentConfig()).toBeNull();
    set({ ...base, CHOG_PRIZE_POOL_ADDRESS: "   " });
    expect(paymentConfig()).toBeNull();
    set({ ...base, CHOG_PRIZE_POOL_ADDRESS: "not-an-address" });
    expect(paymentConfig()).toBeNull();
  });

  it("is hidden when switched off, even with an address set", () => {
    set({ ...base, CHOG_PAYMENTS_ENABLED: "false" });
    expect(paymentConfig()).toBeNull();
  });

  it("is hidden without the token address", () => {
    set({ ...base, NEXT_PUBLIC_CHOG_TOKEN_ADDRESS: undefined });
    expect(paymentConfig()).toBeNull();
  });

  it("takes the amount from env, and ignores nonsense", () => {
    set({ ...base, CHOG_PAYMENT_AMOUNT: "25" });
    expect(paymentConfig()?.amount).toBe(25);
    for (const bad of ["0", "-3", "abc"]) {
      set({ ...base, CHOG_PAYMENT_AMOUNT: bad });
      expect(paymentConfig()).toBeNull();
    }
  });

});

describe("perks", () => {
  const [badge, attempt, torch] = CHOG.perks;

  it("are ordered tiers with rising thresholds", () => {
    expect(CHOG.perks.map((p) => p.minBalance)).toEqual([...CHOG.perks.map((p) => p.minBalance)].sort((a, b) => a - b));
    expect(new Set(CHOG.perks.map((p) => p.id)).size).toBe(CHOG.perks.length);
  });

  it("a zero, missing or unreadable balance unlocks nothing, and shows what each perk needs", () => {
    for (const b of [0, "0", null, undefined, "", "abc", -5, Number.NaN]) {
      const perks = perksFor(b as never);
      expect(perks.every((p) => !p.unlocked)).toBe(true);
      expect(perks.map((p) => p.needed)).toEqual(CHOG.perks.map((p) => p.minBalance));
      expect(perkEffects(b as never)).toEqual({ badge: false, extraAttempts: 0, torch: null, tier: null });
    }
  });

  it("unlock exactly at their threshold", () => {
    expect(perksFor(badge.minBalance - 1)[0].unlocked).toBe(false);
    expect(perksFor(badge.minBalance - 1)[0].needed).toBe(1);
    expect(perksFor(badge.minBalance)[0].unlocked).toBe(true);
    expect(perksFor(badge.minBalance)[0].needed).toBe(0);
    expect(perksFor(String(attempt.minBalance))[1].unlocked).toBe(true);
    expect(perksFor(torch.minBalance - 0.5)[2].unlocked).toBe(false);
  });

  it("combine by tier: higher balances keep every lower perk", () => {
    expect(perkEffects(badge.minBalance)).toMatchObject({ badge: true, extraAttempts: 0, torch: null, tier: badge.tier });
    expect(perkEffects(attempt.minBalance)).toMatchObject({ badge: true, extraAttempts: 1, torch: null, tier: attempt.tier });
    expect(perkEffects(torch.minBalance)).toMatchObject({ badge: true, extraAttempts: 1, torch: torch.torch, tier: torch.tier });
    expect(perkEffects("123456789.5").tier).toBe(torch.tier);
  });

  it("only the holder badge uses the holder check; an unreadable balance is not a holder", () => {
    expect(isHolder(String(badge.minBalance))).toBe(true);
    expect(isHolder(String(badge.minBalance - 1))).toBe(false);
    expect(isHolder(null)).toBe(false);
  });

  it("the extra-attempt perk and paid attempts add to the free ones, and nothing else", () => {
    expect(allowedAttempts(0, null)).toBe(CHOG.daily.freeAttempts);
    expect(allowedAttempts(0, String(badge.minBalance))).toBe(CHOG.daily.freeAttempts);
    expect(allowedAttempts(0, String(attempt.minBalance))).toBe(CHOG.daily.freeAttempts + 1);
    expect(allowedAttempts(2, String(attempt.minBalance))).toBe(CHOG.daily.freeAttempts + 1 + 2 * CHOG.payment.bonusAttempts);
  });

  it("are cosmetic or convenience only: no perk changes difficulty, points or rankings", () => {
    for (const p of CHOG.perks) {
      expect(Object.keys(p).sort().filter((k) => !["id", "tier", "minBalance", "title", "blurb", "badge", "extraAttempts", "torch"].includes(k))).toEqual([]);
    }
    expect(CHOG.perks.reduce((n, p) => n + (p.extraAttempts ?? 0), 0)).toBeLessThanOrEqual(1);
  });
});

describe("daily attempts: free by default, a paid bonus adds one", () => {
  const TODAY = 77;
  let id = 0;
  const raid = (raider: string, minute: number, status: RaidRecord["status"], moves = "RRRR"): RaidRecord => ({
    id: `r${++id}`,
    tokenId: TODAY,
    raider,
    practice: true,
    defender: null,
    traps: [],
    moves,
    status,
    hp: 3,
    movesLeft: 10,
    endX: 0,
    endY: 0,
    createdAt: `${DAY}T10:${String(minute).padStart(2, "0")}:00Z`,
    updatedAt: `${DAY}T10:${String(minute).padStart(2, "0")}:00Z`,
  });
  const free = CHOG.daily.freeAttempts;
  const losses = (who: string, k: number) => Array.from({ length: k }, (_, i) => raid(who, i + 1, "defeated"));

  it("only the first free attempts count; a clear after them is not on the board", () => {
    const raids = [...losses(ALICE, free), raid(ALICE, 30, "breach")];
    expect(dailyBoard(raids, DAY, TODAY, { allowed: () => allowedAttempts(0) })).toEqual([]);
    expect(dailyBoard(raids, DAY, TODAY)).toHaveLength(1); // unlimited, as before, when no limit is passed
  });

  it("a clear within the free attempts counts", () => {
    const raids = [...losses(ALICE, free - 1), raid(ALICE, 30, "breach")];
    expect(dailyBoard(raids, DAY, TODAY, { allowed: () => allowedAttempts(0) }).map((e) => e.raider)).toEqual([ALICE]);
  });

  it("a paid bonus attempt lets the next attempt count", () => {
    const raids = [...losses(ALICE, free), raid(ALICE, 30, "breach")];
    expect(dailyBoard(raids, DAY, TODAY, { allowed: (w) => allowedAttempts(w.toLowerCase() === ALICE.toLowerCase() ? 1 : 0) })).toHaveLength(1);
  });

  it("is per raider, and unfinished raids don't use an attempt", () => {
    const raids = [...losses(ALICE, free), raid(ALICE, 30, "breach"), raid(BOB, 5, "breach"), raid(BOB, 6, "active"), raid(BOB, 7, "abandoned")];
    const board = dailyBoard(raids, DAY, TODAY, { allowed: () => allowedAttempts(0) });
    expect(board.map((e) => e.raider)).toEqual([BOB]);
    expect(dailyAttempts(raids, DAY, TODAY, BOB)).toHaveLength(1);
    expect(dailyAttempts(raids, DAY, TODAY, ALICE.toLowerCase())).toHaveLength(free + 1);
  });
});
