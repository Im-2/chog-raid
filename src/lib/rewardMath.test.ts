import { describe, expect, it } from "vitest";
import { REWARDS, type PayoutBand } from "@/config/rewards";
import { boardPool, pointsToCutoff, projectedAmount, rankPlayers, rankShares, roundDown, validateBands } from "./rewardMath";

const players = (points: number[]) => points.map((p, i) => ({ id: `p${i + 1}`, points: p }));
const N = REWARDS.topN;

describe("payout shape (config)", () => {
  it("adds up to exactly 100 percent, covers ranks 1..topN once, and the board split adds up to 1", () => {
    expect(REWARDS.bands.reduce((s, b) => s + b.pct, 0)).toBe(100);
    expect(validateBands()).toEqual([]);
  });

  it("matches the planned shape: 20/12/8 for the top three, 25% shared by 4-10, 35% shared by 11-50", () => {
    expect(REWARDS.bands.map((b) => [b.from, b.to, b.pct])).toEqual([[1, 1, 20], [2, 2, 12], [3, 3, 8], [4, 10, 25], [11, 50, 35]]);
    expect(REWARDS.topN).toBe(50);
    expect(REWARDS.split).toEqual({ wardens: 0.5, raiders: 0.5 });
  });

  it("rejects bad shapes", () => {
    const bad = (bands: PayoutBand[], topN = N) => validateBands(bands, topN);
    expect(bad([{ from: 1, to: 50, pct: 99 }])).toEqual(expect.arrayContaining([expect.stringMatching(/add up to 99/)]));
    expect(bad([{ from: 1, to: 50, pct: 101 }]).length).toBeGreaterThan(0);
    expect(bad([{ from: 1, to: 10, pct: 50 }, { from: 12, to: 50, pct: 50 }])).toEqual(expect.arrayContaining([expect.stringMatching(/should start at rank 11/)]));
    expect(bad([{ from: 1, to: 10, pct: 100 }])).toEqual(expect.arrayContaining([expect.stringMatching(/cover ranks 1-10, not 1-50/)]));
    expect(bad([{ from: 1, to: 50, pct: 150 }, { from: 51, to: 50, pct: -50 }]).length).toBeGreaterThan(0);
    expect(validateBands(REWARDS.bands, N, { wardens: 0.6, raiders: 0.6 })).toEqual(expect.arrayContaining([expect.stringMatching(/split/)]));
  });

  it("gives each rank its share, and the shares add up to the whole half", () => {
    const s = rankShares();
    expect(s).toHaveLength(N);
    expect(s[0]).toBeCloseTo(0.2);
    expect(s[1]).toBeCloseTo(0.12);
    expect(s[2]).toBeCloseTo(0.08);
    for (let r = 4; r <= 10; r++) expect(s[r - 1]).toBeCloseTo(0.25 / 7);
    for (let r = 11; r <= 50; r++) expect(s[r - 1]).toBeCloseTo(0.35 / 40);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});

describe("ranking, ties and the top-N cutoff", () => {
  it("ranks in order and puts exactly the top N in the zone", () => {
    const ranked = rankPlayers(players(Array.from({ length: 60 }, (_, i) => 1000 - i)));
    expect(ranked.filter((r) => r.inZone)).toHaveLength(N);
    expect(ranked[49].inZone).toBe(true);
    expect(ranked[50].inZone).toBe(false);
    expect(ranked[50].share).toBe(0);
    expect(ranked[0].share).toBeCloseTo(0.2);
    expect(ranked.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 12);
  });

  it("players tied on points share a rank and split the positions they occupy", () => {
    const ranked = rankPlayers(players([100, 90, 90, 50]));
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    // ranks 2 and 3 are worth 12% + 8% = 20%, split two ways
    expect(ranked[1].share).toBeCloseTo(0.1);
    expect(ranked[2].share).toBeCloseTo(0.1);
    expect(ranked[3].share).toBeCloseTo(0.25 / 7); // rank 4 is in the 4-10 band
  });

  it("a tie across the cutoff splits only the positions inside the top N, and everyone tied counts as inside", () => {
    const pts = [...Array.from({ length: 48 }, (_, i) => 500 - i), 100, 100, 100, 100, 10];
    const ranked = rankPlayers(players(pts));
    const tied = ranked.filter((r) => r.points === 100);
    expect(tied).toHaveLength(4);
    expect(tied.every((r) => r.inZone && r.rank === 49)).toBe(true);
    // positions 49 and 50 are worth 2 x (0.35/40); four players split them
    expect(tied[0].share).toBeCloseTo((2 * 0.35) / 40 / 4);
    expect(ranked.at(-1)!.inZone).toBe(false);
    // the whole half is still paid exactly once
    expect(ranked.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 12);
  });

  it("a tie entirely below the cutoff earns nothing", () => {
    const ranked = rankPlayers(players([...Array.from({ length: 50 }, (_, i) => 500 - i), 5, 5, 5]));
    expect(ranked.slice(50).every((r) => !r.inZone && r.share === 0)).toBe(true);
  });

  it("fewer than N players: everyone is inside, and the unclaimed shares are simply not paid", () => {
    const ranked = rankPlayers(players([30, 20, 10]));
    expect(ranked.every((r) => r.inZone)).toBe(true);
    expect(ranked.reduce((s, r) => s + r.share, 0)).toBeCloseTo(0.4); // 20% + 12% + 8%
  });

  it("handles nobody", () => {
    expect(rankPlayers([])).toEqual([]);
  });

  it("points to the cutoff: enough to at least tie the last place inside", () => {
    const ranked = rankPlayers(players(Array.from({ length: 60 }, (_, i) => 1000 - i * 5)));
    // 50th place has 1000 - 49*5 = 755; player 55 has 730
    expect(pointsToCutoff(ranked, "p55")).toBe(25);
    expect(pointsToCutoff(ranked, "p50")).toBeNull(); // already inside
    expect(pointsToCutoff(ranked, "nobody")).toBeNull();
    expect(pointsToCutoff(rankPlayers(players([5, 4, 3])), "p3")).toBeNull(); // board not full: no cutoff
  });
});

describe("projected share math", () => {
  it("is zero when the pool is zero, missing, unreadable or nonsense", () => {
    for (const pool of [0, "0", null, undefined, "", "abc", -5, Number.NaN]) {
      expect(boardPool(pool as never, "wardens")).toBe(0);
      expect(projectedAmount(0.2, pool as never, "raiders")).toBe(0);
    }
  });

  it("splits the real pool between the boards, then by share", () => {
    expect(boardPool(1000, "wardens")).toBe(500);
    expect(boardPool("1000", "raiders")).toBe(500);
    expect(projectedAmount(0.2, 1000, "wardens")).toBeCloseTo(100);
    expect(projectedAmount(0.12, 1000, "raiders")).toBeCloseTo(60);
    const total = rankPlayers(players(Array.from({ length: 50 }, (_, i) => 900 - i))).reduce((s, r) => s + projectedAmount(r.share, 1000, "wardens"), 0);
    expect(total).toBeCloseTo(500, 9);
  });

  it("respects a different board split", () => {
    expect(boardPool(1000, "wardens", { wardens: 0.7, raiders: 0.3 })).toBe(700);
    expect(boardPool(1000, "raiders", { wardens: 0.7, raiders: 0.3 })).toBe(300);
  });

  it("never rounds money up", () => {
    expect(roundDown(1.999)).toBe(1.99);
    expect(roundDown(0.004)).toBe(0);
    expect(roundDown(12.34)).toBe(12.34);
  });
});
