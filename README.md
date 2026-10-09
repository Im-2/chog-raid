# Chog Raid

Every Chog becomes a room in one giant shared dungeon: owners set traps and defend it while offline, and everyone else raids it.

Built for **Chogathon 2026**.

## Try it locally (no wallet needed)

```bash
npm install
cp .env.example .env.local   # defaults to NFT_ADAPTER=mock
npm run dev
```

Open http://localhost:3000, pick a Chog, and raid its room with the arrow keys / WASD (or the on-screen pad).

## How it works

- **Room generation** (`src/engine/generate.ts`): the Chog image is downsampled to 16x16. The flat background becomes void, so the playable area is the Chog's silhouette. Dark lines become walls, blue becomes water (slow), and saturated red becomes hazard. A path from entrance to exit is always carved, so every room is beatable.
- **Traits** shape each room through one table: `src/engine/traitRules.ts` (trap slots, unlocked trap types, extra hazards).
- **Raids** are turn-based and deterministic (`src/engine/simulate.ts`). The same engine runs in the browser and on the server, so the server can replay a move list and decide the result.
- **NFT data** goes through an adapter (`src/nft`): `mock` (generated Chogs) or `onchain` (Monad). Switch with `NFT_ADAPTER`.

## Scripts

- `npm run dev`: start the app
- `npm test`: engine tests
- `npm run typecheck`: TypeScript check
