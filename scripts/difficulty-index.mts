// Builds src/data/chog-difficulty.json: every room's real difficulty (score 0-100, rating 1-5,
// tier level 1-5), computed from its generated layout and native defenses. The room browser's
// "Hardest" sort and the difficulty badges read it, so no room has to be generated to sort.
//
// usage: npx tsx --conditions=react-server scripts/difficulty-index.mts [--partial]
import fs from "node:fs";
import { TIER_ORDER, TIERS } from "../src/config/tiers.ts";
import { loadRealRooms } from "./lib/real-rooms.mts";

const { rooms, missing } = loadRealRooms();
if (missing.length && !process.argv.includes("--partial")) {
  console.error(`${missing.length} rooms have no cached pixels yet (first: ${missing.slice(0, 5).join(", ")}). Run scripts/cache-pixels.mts.`);
  process.exit(1);
}
const index: Record<number, [score: number, rating: number, level: number]> = {};
for (const { room } of rooms) index[room.tokenId] = [room.difficulty.score, room.difficulty.rating, room.tier.level];
fs.writeFileSync("src/data/chog-difficulty.json", JSON.stringify(index) + "\n");

console.log("tier        rooms  score min/avg/max  ratings 1-5");
for (const t of TIER_ORDER) {
  const rs = rooms.filter((r) => r.room.tier.id === t).map((r) => r.room.difficulty);
  const s = rs.map((d) => d.score);
  const stars = [1, 2, 3, 4, 5].map((k) => rs.filter((d) => d.rating === k).length).join("/");
  console.log(`${TIERS[t].name.padEnd(11)} ${String(rs.length).padStart(5)}  ${Math.min(...s)}/${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1)}/${Math.max(...s)}`.padEnd(38) + stars);
}
console.log(`wrote ${rooms.length} rooms to src/data/chog-difficulty.json`);
