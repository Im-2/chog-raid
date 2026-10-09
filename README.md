# Chog Raid

Every Chog becomes a room in one giant shared dungeon: owners set traps and defend it while offline, and everyone else raids it.

Built for **Chogathon 2026** on the [Chog Genesis](https://monadscan.com/address/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763) collection (Monad).

## Try it locally (no wallet needed)

```bash
npm install
cp .env.example .env.local   # real Chogs from Monad by default
npm run dev
```

Open http://localhost:3000.

- **Raid a room**: walk from IN to the glowing door with arrow keys / WASD, swipes, or the d-pad. Rooms without a defender use clearly labeled practice traps.
- **Defend my Chog**: place traps in your Chog's slots, test the room yourself, and replay test raids from the raid log.

Offline or no RPC? Set `NFT_ADAPTER=mock` in `.env.local` to use generated Chogs.

## How it works

- **Real data** (`src/nft/onchain.ts`): `tokenURI` is read on Monad with viem, the metadata JSON is fetched through IPFS gateways, and the image is taken from the metadata's `image` field. Art is cached on disk in `.cache/`.
- **Room generation** (`src/engine/generate.ts`): the art is downsampled to 16x16, keeping the hand-drawn ink lines (`src/nft/pixels.ts`). Dark lines become walls, blue becomes water (slow), and saturated red becomes embers (damage). A path from entrance to exit is always carved, so every room is beatable.
- **Traits** shape each room through one table: `src/engine/traitRules.ts` (trap slots, unlocked trap types, extra embers).
- **Raids** are turn-based and deterministic (`src/engine/simulate.ts`). Real raids are resolved by the server one move at a time (`src/server/raids.ts`): the browser sends a move, the server replays the stored move list with the same engine and returns only what the raider can see, so hidden traps never reach the client. Every raid's move list is stored and doubles as its replay.
- **Storage** (`src/server/store`): a local JSON file in `.data/` by default; set the Supabase env vars (and run `supabase/migrations/*.sql`) to use Postgres for deployments.

## Scripts

- `npm run dev`: start the app
- `npm test`: engine tests
- `npm run typecheck`: TypeScript check
- `node scripts/fetch-metadata.mjs <outDir>`: snapshot all Chog metadata and trait counts (analysis only)
