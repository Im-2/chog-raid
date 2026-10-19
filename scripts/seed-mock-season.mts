// Mock-mode demo data: fills .data-mock (the dev:mock file store) with a populated season, so the
// leaderboards, reward zone and projections can be seen offline. Never touches Supabase or any
// real data. Fake wallets only.
//
// usage: npx tsx --conditions=react-server scripts/seed-mock-season.mts   (then restart npm run dev:mock)
import fs from "node:fs";
import path from "node:path";
import { seasonAt } from "../src/server/retention.ts";

const dir = ".data-mock";
const file = path.join(dir, "store.json");
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { raids: {}, defenses: {} };
const season = seasonAt(Date.now());
const start = Math.max(+season.start, Date.now() - 5 * 86_400_000) + 3_600_000;
const wallet = (n: number) => `0x${(0xd0000 + n).toString(16).padStart(40, "0")}`;
let seq = 0;

function raid(raider: string, tokenId: number, status: "breach" | "defeated", defender: string | null, t: number) {
  const id = `demo-${++seq}`;
  const moves = status === "breach" ? "RRDRRDRRRDRR".slice(0, 12 + (seq % 6)) : "RRDR";
  state.raids[id] = {
    id, tokenId, raider, practice: !defender, defender, par: 16, difficulty: 1, engine: 3, traps: [], moves, status,
    hp: status === "breach" ? 3 : 0, movesLeft: 20, endX: 0, endY: 0,
    createdAt: new Date(t).toISOString(), updatedAt: new Date(t + 40_000).toISOString(),
  };
}

// 62 raiders with different numbers of clears (so ~55 are eligible and the top 50 cutoff is visible).
for (let i = 0; i < 62; i++) {
  const clears = 3 + (62 - i);
  for (let k = 0; k < clears; k++) raid(wallet(i), 100 + ((i * 7 + k) % 400), "breach", null, start + (i * 53 + k) * 17_000);
}
// 56 defenders (wallets) whose rooms raiders failed in.
for (let i = 0; i < 56; i++) {
  const holds = 1 + (56 - i);
  for (let k = 0; k < holds; k++) raid(wallet(200 + ((i * 3 + k) % 40)), 900 + i, "defeated", wallet(500 + i), start + (i * 37 + k) * 17_000);
}
// The mock "Demo owner" wallet (dev:mock's sign-in): a Raider just outside the top 50, and a Warden inside it.
const DEMO = "0x000000000000000000000000000000000000dE40";
for (let k = 0; k < 9; k++) raid(DEMO, 700 + k, "breach", null, start + (4000 + k) * 17_000);
for (let k = 0; k < 28; k++) raid(wallet(200 + (k % 40)), 1, "defeated", DEMO, start + (5000 + k) * 17_000);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(state));
console.log(`seeded ${seq} demo raids into ${file} (season ${season.index + 1})`);
