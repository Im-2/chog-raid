import { describe, expect, it } from "vitest";
import { RETENTION as R } from "@/config/retention";
import { TIERS } from "@/config/tiers";
import { NATIVE_ENGINE } from "@/engine";
import { badgesFor, dailyBoard, dailyTokenId, dayKey, daysHeld, raidStreak, scoreRaids, seasonAt, standings } from "./retention";
import type { RaidRecord } from "./store/types";

const SUPPLY = 1969;
let n = 0;
function raid(p: Partial<RaidRecord> & { at: string }): RaidRecord {
  n++;
  const { at, ...rest } = p;
  return {
    id: `r${n}`,
    tokenId: 50,
    raider: "guest:a",
    practice: false,
    defender: "0xW",
    par: 20,
    difficulty: 1,
    traps: [],
    moves: "R".repeat(30),
    status: "defeated",
    hp: 0,
    movesLeft: 0,
    endX: 0,
    endY: 0,
    createdAt: at,
    updatedAt: at,
    ...rest,
  };
}
const pts = (awards: ReturnType<typeof scoreRaids>, id: string) => awards.find((a) => a.raidId === id)?.points ?? 0;

describe("seasons and daily raid", () => {
  it("splits time into fixed weekly seasons from the epoch", () => {
    const s0 = seasonAt(Date.parse(R.season.epoch));
    const s1 = seasonAt(Date.parse(R.season.epoch) + 7 * 86_400_000);
    expect(s1.index).toBe(s0.index + 1);
    expect(+s0.end).toBe(+s1.start);
  });

  it("features the same room all day, and usually a different one tomorrow", () => {
    expect(dailyTokenId("2026-10-10", SUPPLY)).toBe(dailyTokenId("2026-10-10", SUPPLY));
    const week = new Set(Array.from({ length: 7 }, (_, i) => dailyTokenId(`2026-10-1${i}`, SUPPLY)));
    expect(week.size).toBeGreaterThan(4);
  });
});

describe("raider points", () => {
  it("pays a full clear once per room per season, then repeat clears", () => {
    const a = raid({ at: "2026-10-06T10:00:00Z", status: "breach" });
    const b = raid({ at: "2026-10-06T11:00:00Z", status: "breach" });
    const aw = scoreRaids([a, b], SUPPLY);
    const first = R.raider.clear + R.raider.firstClearOfRoom + R.raider.firstClearEver;
    expect(pts(aw, a.id)).toBe(first + Math.round(R.raider.fastClearMax * 0.5));
    expect(pts(aw, b.id)).toBe(R.raider.repeatClear + Math.round(R.raider.fastClearMax * 0.5));
  });

  it("gives the full fast-clear bonus at par and none at par x slack", () => {
    const fast = raid({ at: "2026-10-06T10:00:00Z", status: "breach", moves: "R".repeat(20), tokenId: 60 });
    const slow = raid({ at: "2026-10-06T10:00:00Z", status: "breach", moves: "R".repeat(40), tokenId: 61, raider: "guest:z" });
    const aw = scoreRaids([fast, slow], SUPPLY);
    expect(aw.find((a) => a.raidId === fast.id)!.parts.some((p) => p.label === "Perfect route" && p.points === R.raider.fastClearMax)).toBe(true);
    expect(aw.find((a) => a.raidId === slow.id)!.parts.some((p) => p.label.includes("Fast") || p.label.includes("Perfect"))).toBe(false);
  });

  it("halves practice room points and never pays for failed raids", () => {
    const p = raid({ at: "2026-10-06T10:00:00Z", status: "breach", practice: true, defender: null, par: null });
    const f = raid({ at: "2026-10-06T10:00:00Z", status: "defeated", raider: "guest:q", defender: null, practice: true });
    const aw = scoreRaids([p, f], SUPPLY);
    expect(pts(aw, p.id)).toBe(Math.round((R.raider.clear + R.raider.firstClearOfRoom) * R.raider.practiceMultiplier));
    expect(aw.some((a) => a.raidId === f.id)).toBe(false);
  });

  it("adds the daily bonus once per day on the featured room", () => {
    const day = "2026-10-07";
    const tokenId = dailyTokenId(day, SUPPLY);
    const a = raid({ at: `${day}T09:00:00Z`, status: "breach", tokenId });
    const b = raid({ at: `${day}T10:00:00Z`, status: "breach", tokenId });
    const aw = scoreRaids([a, b], SUPPLY);
    expect(aw.find((x) => x.raidId === a.id)!.parts.some((p) => p.label === "Daily raid")).toBe(true);
    expect(aw.find((x) => x.raidId === b.id)!.parts.some((p) => p.label === "Daily raid")).toBe(false);
  });
});

describe("warden points", () => {
  it("pays per failed raid, more for harder rooms and longer hold streaks, resets on breach, never negative", () => {
    const h1 = raid({ at: "2026-10-06T01:00:00Z", difficulty: 3, raider: "guest:1" });
    const h2 = raid({ at: "2026-10-06T02:00:00Z", difficulty: 3, raider: "guest:2" });
    const br = raid({ at: "2026-10-06T03:00:00Z", status: "breach", raider: "guest:3" });
    const h3 = raid({ at: "2026-10-06T04:00:00Z", difficulty: 3, raider: "guest:4" });
    const own = raid({ at: "2026-10-06T05:00:00Z", raider: "0xw" });
    const aw = scoreRaids([h1, h2, br, h3, own], SUPPLY).filter((a) => a.role === "warden");
    const base = R.warden.hold + Math.round(R.warden.hold * R.warden.difficultyStep * 2);
    expect(aw.map((a) => a.points)).toEqual([base, base + R.warden.perConsecutiveHold, base]);
    expect(aw.every((a) => a.points > 0)).toBe(true);
  });

  it("scales holds and clears by the room's tier once rooms have native defenses", () => {
    const hold = (level: number) => pts(scoreRaids([raid({ at: "2026-10-06T01:00:00Z", difficulty: level, engine: NATIVE_ENGINE, raider: "guest:h" })], SUPPLY), `r${n}`);
    const clear = (level: number) => {
      const r = raid({ at: "2026-10-06T01:00:00Z", difficulty: level, engine: NATIVE_ENGINE, status: "breach", raider: "guest:c", par: null });
      return pts(scoreRaids([r], SUPPLY), r.id);
    };
    expect(hold(1)).toBe(R.warden.hold);
    expect(hold(5)).toBe(Math.round(R.warden.hold * TIERS.legendary.pointsMultiplier));
    const c1 = clear(1);
    expect(clear(4)).toBe(Math.round(c1 * TIERS.epic.pointsMultiplier));
    const levels = [1, 2, 3, 4, 5];
    for (let i = 1; i < levels.length; i++) {
      expect(hold(levels[i])).toBeGreaterThan(hold(levels[i - 1]));
      expect(clear(levels[i])).toBeGreaterThan(clear(levels[i - 1]));
    }
  });

  it("ranks season standings and awards badges only for finished seasons", () => {
    const last = seasonAt(Date.parse("2026-10-06T00:00:00Z")).index;
    const raids = [
      raid({ at: "2026-10-06T01:00:00Z", status: "breach", raider: "guest:top" }),
      raid({ at: "2026-10-06T02:00:00Z", status: "breach", raider: "guest:second", tokenId: 2, par: null }),
    ];
    const aw = scoreRaids(raids, SUPPLY);
    expect(standings(aw, "raider", last).map((s) => s.who)).toEqual(["guest:top", "guest:second"]);
    expect(badgesFor(aw, last).size).toBe(0);
    expect(badgesFor(aw, last + 1).get("guest:top")).toEqual([{ season: last, board: "raider", place: 1 }]);
  });
});

describe("streaks and boards", () => {
  it("counts consecutive raid days and keeps the streak alive until the day after", () => {
    const rs = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-10"].map((d) => raid({ at: `${d}T12:00:00Z` }));
    expect(raidStreak(rs, "guest:a", new Date("2026-10-10T20:00:00Z"))).toEqual({ current: 1, best: 3, activeToday: true });
    expect(raidStreak(rs.slice(0, 3), "guest:a", new Date("2026-10-09T08:00:00Z")).current).toBe(3);
    expect(raidStreak(rs.slice(0, 3), "guest:a", new Date("2026-10-10T08:00:00Z")).current).toBe(0);
  });

  it("counts days held since the last breach or save", () => {
    const rs = [raid({ at: "2026-10-03T00:00:00Z", status: "breach" })];
    expect(daysHeld(rs, 50, "2026-10-01T00:00:00Z", new Date("2026-10-08T01:00:00Z"))).toBe(5);
    expect(daysHeld([], 50, "2026-10-01T00:00:00Z", new Date("2026-10-08T01:00:00Z"))).toBe(7);
  });

  it("ranks the daily board by each raider's best clear", () => {
    const day = "2026-10-08";
    const t = dailyTokenId(day, SUPPLY);
    const rs = [
      raid({ at: `${day}T01:00:00Z`, status: "breach", tokenId: t, moves: "R".repeat(25) }),
      raid({ at: `${day}T02:00:00Z`, status: "breach", tokenId: t, moves: "R".repeat(21) }),
      raid({ at: `${day}T03:00:00Z`, status: "breach", tokenId: t, moves: "R".repeat(22), raider: "guest:b" }),
    ];
    expect(dailyBoard(rs, day, t).map((e) => [e.raider, e.moves])).toEqual([
      ["guest:a", 21],
      ["guest:b", 22],
    ]);
    expect(dayKey("2026-10-08T23:59:59Z")).toBe(day);
  });
});
