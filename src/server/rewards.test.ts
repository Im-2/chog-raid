import { afterEach, describe, expect, it, vi } from "vitest";
import { REWARDS } from "@/config/rewards";
import { seasonByIndex } from "./retention";
import { buildSnapshot, computeRanking, detectAutomation, ensureSnapshot, isAdminWallet, poolState, snapshotCsv, snapshotKey, standingOf, type PoolState } from "./rewards";
import { createMemoryStore } from "./store/memory";
import type { RaidRecord } from "./store/types";

vi.mock("server-only", () => ({}));
// The real (on-chain) path: not mock mode.
vi.mock("@/lib/env", () => ({ env: { nftAdapter: "onchain", rpcUrl: "http://rpc.invalid", chainId: 143, chainName: "Monad" } }));
const balances = vi.hoisted(() => ({ value: "0" as string | null }));
vi.mock("./chog", async (orig) => ({ ...(await orig<typeof import("./chog")>()), chogBalance: async () => balances.value }));

const SEASON = 2;
const S = seasonByIndex(SEASON);
const T0 = +S.start + 3_600_000; // an hour into the season
const SUPPLY = 1969;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
let id = 0;

type R = { raider: string; token: number; status?: RaidRecord["status"]; defender?: string | null; practice?: boolean; moves?: string; at?: number; secs?: number };
function raid(p: R): RaidRecord {
  const start = p.at ?? T0 + ++id * 1000;
  const moves = p.moves ?? "R".repeat(20);
  return {
    id: `r${++id}`,
    tokenId: p.token,
    raider: p.raider,
    practice: p.practice ?? false,
    defender: p.defender === undefined ? addr(9000 + p.token) : p.defender,
    par: 18,
    difficulty: 1,
    engine: 3,
    traps: [],
    moves,
    status: p.status ?? "breach",
    hp: 3,
    movesLeft: 10,
    endX: 0,
    endY: 0,
    createdAt: new Date(start).toISOString(),
    updatedAt: new Date(start + (p.secs ?? 60) * 1000).toISOString(),
  };
}
/** A wallet that clears `rooms` different rooms (defended by someone else). */
const clears = (wallet: string, rooms: number, base = 100) => Array.from({ length: rooms }, (_, i) => raid({ raider: wallet, token: base + i }));
/** A defender's room that `n` different raiders failed in. */
const holds = (token: number, defender: string, n: number) => Array.from({ length: n }, (_, i) => raid({ raider: addr(50_000 + token * 100 + i), token, defender, status: "defeated", moves: "RRRR" }));

const rank = (raids: RaidRecord[], ownerOf?: (t: number) => Promise<string | null>) => computeRanking({ raids, season: SEASON, supply: SUPPLY, ownerOf });
const ids = (r: { id: string }[]) => r.map((x) => x.id.toLowerCase());

afterEach(() => {
  balances.value = "0";
  id = 0;
});

describe("eligibility", () => {
  it("raiders need the minimum number of DISTINCT rooms cleared", async () => {
    const min = REWARDS.eligibility.raiderMinRoomsCleared;
    const raids = [...clears(addr(1), min), ...clears(addr(2), min - 1), ...Array.from({ length: 10 }, () => raid({ raider: addr(3), token: 100 }))]; // 10 clears of ONE room
    const r = await rank(raids);
    expect(ids(r.raiders)).toEqual([addr(1)]);
  });

  it("guests are never ranked for rewards, but a wallet counts once however its address is cased", async () => {
    const wallet = "0xAbCdEf0000000000000000000000000000000001";
    const raids = [...clears("guest:0123456789abcdef", 5), ...clears(wallet, 2), ...clears(wallet.toLowerCase(), 2, 200)];
    const r = await rank(raids);
    expect(ids(r.raiders)).toEqual([wallet.toLowerCase()]);
    expect(r.raiders).toHaveLength(1);
    expect(r.wardens).toEqual([]);
  });

  it("only this season's raids count", async () => {
    const old = clears(addr(1), 4).map((x) => ({ ...x, createdAt: new Date(+S.start - 86_400_000).toISOString(), updatedAt: new Date(+S.start - 86_400_000 + 60_000).toISOString() }));
    expect((await rank(old)).raiders).toEqual([]);
  });

  it("wardens are wallets that earned points when raiders failed in their room, ranked by points", async () => {
    const r = await rank([...holds(7, addr(10), 3), ...holds(8, addr(11), 1)]);
    expect(ids(r.wardens)).toEqual([addr(10), addr(11)]);
    expect(r.wardens[0].points).toBeGreaterThan(r.wardens[1].points);
  });
});

describe("ownership re-check at the snapshot", () => {
  const raids = [...holds(7, addr(10), 3), ...holds(8, addr(11), 3)];

  it("counts Warden points only on Chogs the wallet still holds", async () => {
    const owner = async (t: number) => (t === 7 ? addr(10) : addr(99)); // token 8 was sold
    const r = await rank(raids, owner);
    expect(ids(r.wardens)).toEqual([addr(10)]);
    expect(r.droppedPoints.every((d) => d.wallet === addr(11) && d.tokenId === 8)).toBe(true);
    expect(r.droppedPoints.length).toBe(3);
  });

  it("a wallet that holds only some of its Chogs keeps the points from those", async () => {
    const mixed = [...holds(7, addr(10), 3), ...holds(8, addr(10), 3)];
    const kept = await rank(mixed, async (t) => (t === 7 ? addr(10) : addr(99)));
    const all = await rank(mixed);
    expect(kept.wardens[0].points).toBeLessThan(all.wardens[0].points);
    expect(kept.wardens[0].points).toBeGreaterThan(0);
  });

  it("matches owners case-insensitively, and a missing owner counts as not holding", async () => {
    const r1 = await rank(raids, async (t) => (t === 7 ? addr(10).toUpperCase().replace("0X", "0x") : addr(11)));
    expect(ids(r1.wardens).sort()).toEqual([addr(10), addr(11)].sort());
    const r2 = await rank(raids, async () => null);
    expect(r2.wardens).toEqual([]);
  });

  it("a failed ownership read aborts instead of guessing", async () => {
    await expect(rank(raids, async () => Promise.reject(new Error("rpc down")))).rejects.toThrow("rpc down");
  });

  it("is skipped (live projection) when no owner lookup is given", async () => {
    expect((await rank(raids)).droppedPoints).toEqual([]);
  });
});

describe("automation is flagged and excluded pending review", () => {
  it("flags impossible move speed, and a wallet with repeated too-fast raids", async () => {
    const fast = (w: string, token: number) => raid({ raider: w, token, moves: "R".repeat(40), secs: 1 });
    const humans = clears(addr(2), 3);
    const raids = [fast(addr(1), 100), fast(addr(1), 101), fast(addr(1), 102), ...humans];
    const auto = detectAutomation(raids);
    expect(auto.raids.size).toBe(3);
    expect(auto.wallets.get(addr(1))?.[0]).toMatch(/impossible speed/);
    expect(auto.wallets.has(addr(2))).toBe(false);
    const r = await rank(raids);
    expect(ids(r.raiders)).toEqual([addr(2)]); // the fast wallet is excluded
    expect(r.flags.some((f) => f.kind === "wallet" && f.id === addr(1))).toBe(true);
  });

  it("does not flag ordinary play: fast-ish humans, short raids, one fast raid", () => {
    const raids = [raid({ raider: addr(1), token: 1, moves: "R".repeat(60), secs: 10 }), raid({ raider: addr(1), token: 2, moves: "R".repeat(5), secs: 0.1 }), raid({ raider: addr(1), token: 3, moves: "R".repeat(40), secs: 2 })];
    const auto = detectAutomation(raids);
    expect(auto.wallets.size).toBe(0); // one too-fast raid isn't enough to flag a wallet
  });

  it("flags the same long move sequence shared by many wallets on one room, not a short one", () => {
    const { minMoves, minWallets } = REWARDS.antiAbuse.identicalSequence;
    const seq = "RD".repeat(minMoves);
    const bots = Array.from({ length: minWallets }, (_, i) => raid({ raider: addr(100 + i), token: 5, moves: seq }));
    const humans = Array.from({ length: minWallets }, (_, i) => raid({ raider: addr(200 + i), token: 6, moves: "RRDD" })); // short and shared: normal
    const fewer = Array.from({ length: minWallets - 1 }, (_, i) => raid({ raider: addr(300 + i), token: 7, moves: seq }));
    const auto = detectAutomation([...bots, ...humans, ...fewer]);
    expect([...auto.wallets.keys()].sort()).toEqual(bots.map((b) => b.raider).sort());
    expect([...auto.wallets.values()][0][0]).toMatch(/other wallets on room 5/);
  });

  it("flags a room whose failed raids come from just a couple of wallets, and drops the Warden points from it", async () => {
    const { minFailedRaids, maxDistinctRaiders } = REWARDS.antiAbuse.roomFarming;
    const farmed = Array.from({ length: minFailedRaids }, (_, i) => raid({ raider: addr(1 + (i % maxDistinctRaiders)), token: 9, defender: addr(66), status: "defeated", moves: "RRRR" }));
    const honest = holds(10, addr(67), 4);
    const auto = detectAutomation([...farmed, ...honest]);
    expect(auto.rooms.has(9)).toBe(true);
    expect(auto.rooms.has(10)).toBe(false);
    const r = await rank([...farmed, ...honest]);
    expect(ids(r.wardens)).toEqual([addr(67)]);
  });

  it("flagged raids stop earning points, so ranks shift up for everyone else", async () => {
    const bots = Array.from({ length: REWARDS.antiAbuse.identicalSequence.minWallets }, (_, i) => clears(addr(100 + i), 3).map((x) => ({ ...x, moves: "RD".repeat(30), token: x.tokenId })));
    const sameRoom = bots.flat().map((x) => ({ ...x, tokenId: 5 }));
    const human = clears(addr(1), 3, 300);
    const r = await rank([...sameRoom, ...human]);
    expect(ids(r.raiders)).toEqual([addr(1)]);
    expect(r.raiders[0].rank).toBe(1);
  });
});

describe("the season snapshot", () => {
  const afterEnd = new Date(+S.end + 5 * 60_000);
  const fundedPool: PoolState = { address: addr(777), balance: "1000", state: "funded", target: null };
  const unfundedPool: PoolState = { address: addr(777), balance: "0", state: "unfunded", target: null };
  const raids = () => [...clears(addr(1), 4), ...clears(addr(2), 3, 200), ...holds(7, addr(10), 3), ...holds(8, addr(11), 2)];
  const deps = (store = createMemoryStore(), pool = fundedPool, ownerOf: (t: number) => Promise<string | null> = async (t) => (t === 7 ? addr(10) : addr(11))) => ({
    store,
    loadRaids: async () => raids(),
    supply: SUPPLY,
    ownerOf,
    pool: async () => pool,
    now: afterEnd,
  });

  it("stores wallet, rank, points, share percentages and the pool balance at that time", async () => {
    const { snapshot, created } = await ensureSnapshot(SEASON, deps());
    expect(created).toBe(true);
    expect(snapshot.season).toBe(SEASON);
    expect(snapshot.pool).toEqual({ address: addr(777), balance: "1000", state: "funded" });
    expect(snapshot.takenAt).toBe(afterEnd.toISOString());
    const [top] = snapshot.raiders;
    expect(top).toMatchObject({ wallet: addr(1), rank: 1 });
    expect(top.points).toBeGreaterThan(0);
    // rank 1 gets 20% of its board's half: 10% of the whole pool = 100 of 1000; rank 2 gets 12% -> 6% -> 60
    expect(top).toMatchObject({ sharePctOfBoard: 20, sharePctOfPool: 10, amount: 100 });
    expect(snapshot.raiders[1]).toMatchObject({ rank: 2, sharePctOfBoard: 12, sharePctOfPool: 6, amount: 60 });
    expect(snapshot.raiders.map((e) => e.rank)).toEqual([1, 2]);
    expect(snapshot.wardens.map((e) => e.wallet)).toEqual([addr(10), addr(11)]);
    expect(snapshot.wardens[0]).toMatchObject({ rank: 1, amount: 100 });
    expect(snapshot.eligible).toEqual({ wardens: 2, raiders: 2 });
  });

  it("re-checks ownership at the snapshot", async () => {
    const { snapshot } = await ensureSnapshot(SEASON, deps(createMemoryStore(), fundedPool, async (t) => (t === 7 ? addr(10) : addr(99))));
    expect(snapshot.wardens.map((e) => e.wallet)).toEqual([addr(10)]);
    expect(snapshot.droppedPoints.some((d) => d.wallet === addr(11))).toBe(true);
  });

  it("is saved once and never changes: later calls, even racing ones, get the same document", async () => {
    const store = createMemoryStore();
    const first = await Promise.all(Array.from({ length: 6 }, () => ensureSnapshot(SEASON, deps(store))));
    expect(first.filter((r) => r.created)).toHaveLength(1);
    const later = await ensureSnapshot(SEASON, { ...deps(store, { ...fundedPool, balance: "99999" }), now: new Date(+afterEnd + 86_400_000) });
    expect(later.created).toBe(false);
    expect(later.snapshot.pool.balance).toBe("1000");
    expect(await store.getKv(snapshotKey(SEASON))).toEqual(first[0].snapshot);
  });

  it("refuses to snapshot a season that hasn't ended", async () => {
    await expect(ensureSnapshot(SEASON, { ...deps(), now: new Date(+S.end - 1000) })).rejects.toThrow(/hasn't ended/);
  });

  it("aborts, storing nothing, if an ownership read fails", async () => {
    const store = createMemoryStore();
    await expect(ensureSnapshot(SEASON, deps(store, fundedPool, async () => Promise.reject(new Error("rpc down"))))).rejects.toThrow("rpc down");
    expect(await store.getKv(snapshotKey(SEASON))).toBeNull();
  });

  it("an unfunded pool snapshots every amount as 0 (nothing is promised)", async () => {
    const { snapshot } = await ensureSnapshot(SEASON, deps(createMemoryStore(), unfundedPool));
    expect(snapshot.pool.state).toBe("unfunded");
    expect([...snapshot.raiders, ...snapshot.wardens].every((e) => e.amount === 0)).toBe(true);
  });

  it("a funded pool is divided without ever paying out more than it holds", async () => {
    const { snapshot } = await ensureSnapshot(SEASON, deps());
    const sum = (list: { amount: number }[]) => list.reduce((s, e) => s + e.amount, 0);
    expect(sum(snapshot.raiders)).toBeLessThanOrEqual(500);
    expect(sum(snapshot.wardens)).toBeLessThanOrEqual(500);
    expect(sum(snapshot.raiders) + sum(snapshot.wardens)).toBeLessThanOrEqual(1000);
  });

  it("builds the CSV for manual payouts: verified rows and flagged ones pending review, escaped", async () => {
    const ranking = await rank(raids());
    const snap = buildSnapshot({ ...ranking, flags: [{ kind: "wallet", id: addr(5), reason: 'looks automated, "fast"' }] }, SEASON, fundedPool, afterEnd);
    const csv = snapshotCsv(snap);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("season,board,rank,wallet,points,share_pct_of_board,share_pct_of_pool,amount_chog_at_snapshot,pool_balance_at_snapshot,pool_state,status,note");
    expect(lines.filter((l) => l.includes(",verified,"))).toHaveLength(snap.raiders.length + snap.wardens.length);
    const flagged = lines.find((l) => l.includes("pending_review"))!;
    expect(flagged).toContain(addr(5));
    expect(flagged).toContain('"looks automated, ""fast"""');
    expect(csv).not.toMatch(/private|secret|mnemonic/i);
  });
});

describe("a player's standing (leaderboard rows)", () => {
  it("shows rank, share and distance to the cutoff, and a zero amount until the pool is funded", async () => {
    const people = Array.from({ length: 52 }, (_, i) => clears(addr(1000 + i), 3, 100 + i * 10).flatMap((x, k) => Array.from({ length: 52 - i }, () => ({ ...x, id: `${x.id}-${k}-${Math.random()}` }))));
    const r = await rank(people.flat());
    const unfunded: PoolState = { address: addr(7), balance: "0", state: "unfunded", target: null };
    const funded: PoolState = { ...unfunded, balance: "1000", state: "funded" };
    const best = standingOf(r.raiders, r.raiders[0].id, "raiders", unfunded)!;
    expect(best).toMatchObject({ rank: 1, inZone: true, amount: 0, toCutoff: null });
    expect(standingOf(r.raiders, r.raiders[0].id, "raiders", funded)!.amount).toBeGreaterThan(0);
    const outside = r.raiders.find((x) => !x.inZone);
    if (outside) expect(standingOf(r.raiders, outside.id, "raiders", unfunded)!.toCutoff).toBeGreaterThan(0);
    expect(standingOf(r.raiders, "0xnobody", "raiders", funded)).toBeNull();
    expect(standingOf(r.raiders, null, "raiders", funded)).toBeNull();
  });
});

describe("pool state is the real balance only", () => {
  const keep = { ...process.env };
  afterEach(() => {
    process.env = { ...keep };
  });

  it("not configured, unreadable, unfunded and funded", async () => {
    delete process.env.CHOG_PRIZE_POOL_ADDRESS;
    expect((await poolState()).state).toBe("unconfigured");
    process.env.CHOG_PRIZE_POOL_ADDRESS = addr(777);
    balances.value = null;
    expect(await poolState()).toMatchObject({ state: "unavailable", balance: null });
    balances.value = "0";
    expect((await poolState()).state).toBe("unfunded");
    balances.value = "12.5";
    expect(await poolState()).toMatchObject({ state: "funded", balance: "12.5" });
  });

  it("the planned target is reported separately and never mixed into the balance", async () => {
    process.env.CHOG_PRIZE_POOL_ADDRESS = addr(777);
    process.env.CHOG_POOL_TARGET = "5000";
    balances.value = "0";
    const p = await poolState();
    expect(p).toMatchObject({ balance: "0", state: "unfunded", target: 5000 });
    process.env.CHOG_POOL_TARGET = "nonsense";
    expect((await poolState()).target).toBeNull();
  });
});

describe("admin", () => {
  const keep = process.env.ADMIN_WALLETS;
  afterEach(() => {
    if (keep === undefined) delete process.env.ADMIN_WALLETS;
    else process.env.ADMIN_WALLETS = keep;
  });
  it("only wallets listed in ADMIN_WALLETS, case-insensitively; nobody when unset", () => {
    delete process.env.ADMIN_WALLETS;
    expect(isAdminWallet(addr(1))).toBe(false);
    process.env.ADMIN_WALLETS = ` ${addr(1).toUpperCase().replace("0X", "0x")} , ${addr(2)} `;
    expect(isAdminWallet(addr(1))).toBe(true);
    expect(isAdminWallet(addr(2))).toBe(true);
    expect(isAdminWallet(addr(3))).toBe(false);
    expect(isAdminWallet(null)).toBe(false);
  });
});

