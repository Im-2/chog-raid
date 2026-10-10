import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/nft", () => ({ getNftAdapter: () => ({}) }));
vi.mock("./store", () => ({ getStore: () => ({}) }));

import { myRooms, suggestNextRoom, type Snapshot } from "./progress";
import { dailyTokenId, dayKey, seasonAt } from "./retention";
import type { RaidRecord } from "./store/types";

const NOW = new Date("2026-10-08T12:00:00Z");
const SUPPLY = 200;
const raid = (tokenId: number, status: RaidRecord["status"], moves = 20): RaidRecord => ({
  id: `${tokenId}-${status}-${moves}`,
  tokenId,
  raider: "guest:me",
  practice: true,
  defender: null,
  traps: [],
  moves: "R".repeat(moves),
  status,
  hp: 1,
  movesLeft: 0,
  endX: 0,
  endY: 0,
  createdAt: "2026-10-08T10:00:00Z",
  updatedAt: "",
});
const snap = (raids: RaidRecord[]): Snapshot => ({ raids, awards: [], defenses: [], supply: SUPPLY, badges: new Map(), season: seasonAt(NOW) });

describe("next room and bests", () => {
  const daily = dailyTokenId(dayKey(NOW), SUPPLY);
  const cards = Array.from({ length: SUPPLY }, (_, i) => ({ tokenId: i + 1, difficulty: (i % 5) + 1 }));
  const diff = (id: number) => cards[id - 1].difficulty;

  it("tracks attempts and the best clear per room", () => {
    const rooms = myRooms(snap([raid(7, "defeated"), raid(7, "breach", 30), raid(7, "breach", 22)]), "guest:me");
    expect(rooms.get(7)).toMatchObject({ attempts: 3, cleared: true, bestMoves: 22 });
  });

  it("suggests today's daily raid first, until you've cleared it", () => {
    expect(suggestNextRoom(snap([]), "guest:me", 1, diff, cards, NOW)).toEqual({ tokenId: daily, reason: "Today's daily raid" });
    const after = suggestNextRoom(snap([raid(daily, "breach")]), "guest:me", 1, diff, cards, NOW);
    expect(after.tokenId).not.toBe(daily);
  });

  it("then picks an uncleared room of similar difficulty, never the current one", () => {
    const from = daily === 10 ? 11 : 10;
    const s = snap([raid(daily, "breach")]);
    const next = suggestNextRoom(s, "guest:me", from, diff, cards, NOW);
    expect(next.reason).toBe("Similar difficulty, not cleared yet");
    expect(next.tokenId).not.toBe(from);
    expect(Math.abs(diff(next.tokenId) - diff(from))).toBeLessThanOrEqual(1);
  });
});
