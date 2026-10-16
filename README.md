# Chog Raid

Every Chog becomes a room in one giant shared dungeon: owners set traps and defend it while offline, and everyone else raids it.

Built for **Chogathon 2026** on the [Chog Genesis](https://monadscan.com/address/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763) collection (Monad).

**Play it live: https://chog-raid.vercel.app** (no wallet needed to raid).

## Try it locally (no wallet needed)

```bash
npm install
cp .env.example .env.local   # real Chogs from Monad by default
npm run dev
```

Open http://localhost:3000.

- **Raid a room**: walk from the green entrance to the glowing exit door with arrow keys / WASD, swipes, or the d-pad. Rooms without a defender use clearly labeled practice traps, so there is always something to dodge.
- **Defend my Chog**: place traps in your Chog's slots, test the room yourself, and replay raids from the raid log.

- **Atlas** (`/atlas`): a zoomable, pannable canvas map of all 1,969 rooms, colored by activity (recent, heavily raided, open, defended, cleared by you) with filters, a minimap, pulses for fresh raids, a live activity feed and a preview card per room. Art streams in as you zoom.
- **Leaderboards**: weekly seasons with a countdown; Raider and Warden points boards, the daily raid board, fastest clears and all-time stats. Top 3 each season earn a badge.
- **Come back daily**: one featured room per day (same for everyone) with a bonus and its own board, a raid-day streak, and for holders a "days held" streak, Warden points for every raider who fails in their room, raid alerts with replays, and a "Defend again" heatmap that shows where raiders got through and suggests a fix.

**$CHOG prize pool (optional, off by default, simulated):** set `NEXT_PUBLIC_FEATURE_CHOG_TOKEN=true` (or `npm run dev:mock -- --chog`). Your real $CHOG balance is read from Monad; daily-raid entry fees and season payouts are recorded by the game only. No tokens are transferred.

**No wallet or no Chog?** Run `npm run dev:mock` and open http://localhost:3001: generated Chogs, and a **Demo owner** button that signs you in as the holder of Chogs 1-10 so you can save a defense and raid it from another browser. (Offline or no RPC? Set `NFT_ADAPTER=mock` in `.env.local`.)

With a real wallet: Connect wallet signs a Sign-In with Ethereum message (no gas). Saving a defense checks `ownerOf` on Monad on every save.

## Rarer Chogs, harder rooms

Each room's tier comes from the Chog's **Tier** trait (Common 1,279 · Uncommon 590 · Rare 60 · Epic 30 · Legendary 10). Rarer rooms get **native defenses** on top of whatever the owner adds: tighter corridors, more embers, built-in guards on patrol routes, locked doors with keys placed far away, and fewer HP or moves. Natives are generated from the token id and tier, are always on, can't be removed by the owner, and every piece is kept only if the room stays beatable.

| Tier | Native defenses | HP / moves | Points |
|---|---|---|---|
| Common | none | 5 / 60 | ×1 |
| Uncommon | a few walls, 2 embers, 1 guard | 5 / 56 | ×1.25 |
| Rare | walls, 4 embers, 1 guard, 1 locked door | 4 / 54 | ×1.6 |
| Epic | dense walls, 10 embers, 4 guards, 1 locked door | 4 / 48 | ×2 |
| Legendary (boss) | dense walls, 12 embers, 4 guards, 2 locked doors, plus a boss signature | 4 / 44 | ×3 |

- **Boss rooms**: each named 1/1 (e.g. CHOG #53 — Blaze, "Inferno") has its own signature, and is the only tier with **fog of war**: the raider sees by torchlight and explored tiles stay dimly visible. Visibility is computed on the server; tiles and traps in the dark are never sent to the browser.
- **Difficulty**: every room has a 0-100 score and a 1-5 rating from its real layout and defenses, shown as a badge on room cards, the room page, the Atlas and leaderboards. "Hardest" sorts by it.
- **Extra moves**: hourglasses (+6 moves) sit a short detour off the route in Rare and rarer rooms. A raider who runs out of moves can **Keep going** once (+10 moves); that clear pays half points and doesn't count for fastest clears or the daily board.
- **Practice traps**: undefended rooms get a fair practice set (Common: 1 guard, 1 locked door, 2 hidden spikes; rarer tiers mostly hidden spikes and a teleporter on top of their natives). Simulated practice clear rates run from 93% (Common) to 53% (Legendary).

Every number above lives in one file: `src/config/tiers.ts`. Points, streaks, seasons and fees live in `src/config/retention.ts`.

## How it works

- **Names vs token ids**: the official name (e.g. token 53 is "CHOG #1514"; "CHOG #53 — Blaze" is token 561) is shown everywhere and used for search. Token ids are only used for routes and contract calls. The index is `src/data/chog-names.json`.
- **Real data** (`src/nft/onchain.ts`): `tokenURI` is read on Monad with viem, the metadata JSON is fetched through IPFS gateways, and the image is taken from the metadata's `image` field. Because metadata and art are immutable, every room's inputs (name, traits, 16x16 pixels) also ship with the server in `src/data/room-inputs.json`, so a room is built with no network calls.
- **Room generation** (`src/engine/generate.ts`, `src/engine/native.ts`): the art is downsampled to 16x16, keeping the hand-drawn ink lines (`src/nft/pixels.ts`). Dark lines become walls, blue becomes water (slow), and saturated red becomes embers (damage). A path from entrance to exit is always carved, then the tier's native defenses are added, each kept only if a fair route remains.
- **Traits** shape each room through one table: `src/engine/traitRules.ts` (trap slots, unlocked trap types, extra embers).
- **Raids** are turn-based and deterministic (`src/engine/simulate.ts`). Real raids are resolved by the server (`src/server/raids.ts`): the browser predicts each move instantly and sends moves in batches; the server replays the stored move list with the same engine and returns only what the raider can see, so hidden traps (and, in boss rooms, unexplored tiles) never reach the client. Every raid's move list is stored and doubles as its replay; raids are stamped with an engine version so older raids still replay exactly.
- **Display** (`src/components/board`): canvas rendering with an offscreen tile layer, animated water and embers, telegraph pulses before a guard steps next to you, door-unlock animation, floating combat text, a minimap and optional zoom, and a "reduced effects" mode (automatic for prefers-reduced-motion, low-end devices or slow frames).
- **Storage** (`src/server/store`): a local JSON file in `.data/` by default; set the Supabase env vars (and run `supabase/migrations/*.sql`) to use Postgres for deployments.
- **Speed**: raid starts report a `Server-Timing` header. A GitHub Actions job (`.github/workflows/keep-warm.yml`) pings the raid routes every 5 minutes so a warm server instance is usually ready.

## Scripts

- `npm run dev`: start the app (real Chogs) · `npm run dev:mock`: generated Chogs on port 3001
- `npm test`: engine, server and sync tests · `npm run typecheck`: TypeScript check · `npm run build`: production build
- `node scripts/make-icons.mjs`: regenerate the favicon set and share image from the flame cursor art

Offline analysis (run with `npx tsx --conditions=react-server <script>`):

- `scripts/cache-pixels.mts`: download every Chog's art and cache its 16x16 room pixels in `.cache/`
- `scripts/build-room-inputs.mts`: rebuild `src/data/room-inputs.json` from that cache
- `scripts/difficulty-index.mts`: rebuild `src/data/chog-difficulty.json` (rerun after changing the engine or `src/config/tiers.ts`)
- `scripts/balance-sim.mts [raids] [--practice]`: simulate raids per tier on the real rooms and print clear rates
- `node scripts/fetch-metadata.mjs <outDir>`: snapshot all Chog metadata and trait counts
