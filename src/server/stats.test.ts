import { describe, expect, it } from "vitest";
import { computeStats, leastDefended, mostRaided, rankDefenders, rankFastest, rankRaiders } from "./stats";
import type { RaidRecord } from "./store/types";

let n = 0;
function raid(p: Partial<RaidRecord>): RaidRecord {
  n++;
  return {
    id: `r${n}`,
    tokenId: 1,
    raider: "guest:a",
    practice: false,
    defender: "0xOwner",
    traps: [],
    moves: "RRRR",
    status: "defeated",
    hp: 0,
    movesLeft: 0,
    endX: 0,
    endY: 0,
    createdAt: new Date(2026, 9, 10, 0, 0, n).toISOString(),
    updatedAt: "",
    ...p,
  };
}

describe("stats", () => {
  const raids = [
    raid({ raider: "guest:a", status: "breach", moves: "R".repeat(20) }),
    raid({ raider: "guest:b", status: "breach", moves: "R".repeat(15) }),
    raid({ raider: "guest:b", status: "defeated" }),
    raid({ raider: "guest:c", status: "out_of_moves" }),
    raid({ tokenId: 2, raider: "guest:a", status: "breach", moves: "R".repeat(15), practice: true, defender: null }),
    raid({ tokenId: 1, raider: "0xowner", status: "defeated" }), // holder raiding own room
    raid({ tokenId: 3, status: "active" }),
    raid({ tokenId: 3, status: "abandoned" }),
  ];
  const s = computeStats(raids);

  it("counts room totals and defense rate from finished raids only", () => {
    const r1 = s.rooms.get(1)!;
    expect(r1.raids).toBe(5);
    expect(r1.breaches).toBe(2);
    expect(r1.defenseRate).toBeCloseTo(3 / 5);
    expect(r1.fastestClear?.moves).toBe(15);
    expect(r1.fastestClear?.raider).toBe("guest:b");
    expect(s.rooms.has(3)).toBe(false);
  });

  it("ranks raiders by rooms cleared, then clears, then speed", () => {
    expect(rankRaiders(s).map((r) => r.raider)).toEqual(["guest:a", "guest:b"]);
    expect(rankRaiders(s)[0].roomsCleared).toBe(2);
  });

  it("credits defenders only for defended raids by other people", () => {
    const [d] = rankDefenders(s);
    expect(d.defender).toBe("0xOwner");
    expect(d.raidsFaced).toBe(4);
    expect(d.held).toBe(2);
  });

  it("lists fastest clears and room orderings", () => {
    expect(rankFastest(s).map((r) => r.tokenId)).toEqual([1, 2]);
    expect(mostRaided(s)[0].tokenId).toBe(1);
    expect(leastDefended(s)[0].tokenId).toBe(2);
  });
});
