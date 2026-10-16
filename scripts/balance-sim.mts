// Balance check: 1,000 automated raids per tier on the real rooms, each room defended with a
// seeded owner layout (sampleTraps) on top of its native defenses.
//
// The bot plays like a careful human who can't see hidden traps: it knows guards, doors and keys
// (always visible) and any spike/teleporter it has stepped on, plans the safest route with that
// knowledge, replans whenever it learns something, and misjudges a step `MISTAKE` of the time.
// If no route that avoids guard contact exists it tries to slip past guards, else it gives up.
//
// usage: npx tsx --conditions=react-server scripts/balance-sim.mts [raidsPerTier=1000] [--practice]
// --practice: undefended rooms with their practice traps instead of a random owner layout.
import { TIER_ORDER, TIERS } from "../src/config/tiers.ts";
import { findSafePath, practiceTraps, sampleTraps, simulateRaid, withNative, type Move, type Room, type Trap } from "../src/engine/index.ts";
import { DIR_ORDER } from "../src/engine/grid.ts";
import { mulberry32 } from "../src/engine/rng.ts";
import { loadRealRooms } from "./lib/real-rooms.mts";

const PER_TIER = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1000);
const PRACTICE_MODE = process.argv.includes("--practice");
const MISTAKE = 0.08;

function botRaid(room: Room, traps: Trap[], seed: number) {
  const rng = mulberry32(seed);
  const moves: Move[] = [];
  const known = new Set<number>(traps.flatMap((t, i) => (t.type === "guard" || t.type === "lockdoor" ? [i] : [])));
  let plan: Move[] = [];
  for (;;) {
    const res = simulateRaid(room, traps, moves);
    if (res.outcome !== "incomplete") return res.outcome;
    let learned = false;
    traps.forEach((t, i) => {
      if (!known.has(i) && res.path.some((p) => p.x === t.x && p.y === t.y)) known.add(i), (learned = true);
    });
    const at = res.path[res.path.length - 1];
    if (learned || plan.length === 0) {
      const ids = [...known].sort((a, b) => a - b);
      const plan1 = (list: number[]) =>
        findSafePath(room, list.map((i) => traps[i]), {
          at,
          keys: res.keys.map((k) => list.indexOf(k)).filter((k) => k >= 0),
          damage: room.rules.raiderHp - res.hp,
          movesUsed: room.rules.maxMoves - res.movesLeft,
        });
      plan = plan1(ids) ?? plan1(ids.filter((i) => traps[i].type !== "guard")) ?? [];
      if (!plan.length) return "gave_up";
    }
    if (rng() < MISTAKE) {
      moves.push(DIR_ORDER[Math.floor(rng() * 4)]);
      plan = [];
    } else moves.push(plan.shift()!);
  }
}

const { rooms, missing } = loadRealRooms();
if (missing.length) console.warn(`(${missing.length} rooms without cached pixels are skipped)`);

console.log(`tier        level  rooms  clear rate  defeated  out of moves  gave up   (${PER_TIER} raids each)`);
for (const tier of TIER_ORDER) {
  const pool = rooms.filter((r) => r.room.tier.id === tier).map((r) => r.room);
  const tally: Record<string, number> = { breach: 0, defeated: 0, out_of_moves: 0, gave_up: 0 };
  for (let i = 0; i < PER_TIER; i++) {
    const room = pool[i % pool.length];
    const owner = PRACTICE_MODE ? practiceTraps(room) : sampleTraps(room, 7919 * (i + 1));
    tally[botRaid(room, withNative(room, owner), 104729 * (i + 1))]++;
  }
  const pct = (k: string) => `${((100 * tally[k]) / PER_TIER).toFixed(1)}%`.padStart(6);
  console.log(
    `${TIERS[tier].name.padEnd(11)} ${String(TIERS[tier].level).padStart(5)}  ${String(pool.length).padStart(5)}      ${pct("breach")}    ${pct("defeated")}        ${pct("out_of_moves")}   ${pct("gave_up")}`,
  );
}
