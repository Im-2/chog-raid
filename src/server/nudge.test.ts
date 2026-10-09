import { describe, expect, it } from "vitest";
import { findSafePath, generateRoom, validateTraps } from "@/engine";
import { mockPixels, mockTraits } from "@/nft/mockArt";
import { rebuildNudge } from "./nudge";
import type { RaidRecord } from "./store/types";

const room = generateRoom({ tokenId: 9, pixels: mockPixels(9), traits: mockTraits(9) });
const breach = (moves: string, at = "2026-10-08T00:00:00Z"): RaidRecord => ({
  id: at + moves.length,
  tokenId: 9,
  raider: "guest:x",
  practice: false,
  defender: "0xW",
  traps: [],
  moves,
  status: "breach",
  hp: 5,
  movesLeft: 0,
  endX: room.exit.x,
  endY: room.exit.y,
  createdAt: at,
  updatedAt: at,
});

describe("rebuild nudge", () => {
  it("maps breach paths and suggests a valid trap on them", () => {
    const path = findSafePath(room, [])!.join("");
    const n = rebuildNudge(room, [], [breach(path), breach(path, "2026-10-08T01:00:00Z")], "2026-10-01T00:00:00Z");
    expect(n.breaches).toBe(2);
    expect(n.heat[room.entrance.y * room.size + room.entrance.x]).toBe(2);
    expect(n.suggestion?.action).toBe("add");
    expect(validateTraps(room, n.suggestion!.traps).ok).toBe(true);
    const s = n.suggestion!.to;
    expect(n.heat[s.y * room.size + s.x]).toBe(2);
  });

  it("ignores raids from before the last save, and suggests nothing without breaches", () => {
    const path = findSafePath(room, [])!.join("");
    const n = rebuildNudge(room, [], [breach(path, "2026-09-01T00:00:00Z")], "2026-10-01T00:00:00Z");
    expect(n.breaches).toBe(0);
    expect(n.suggestion).toBeNull();
  });
});
