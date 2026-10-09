# Chog Raid: build brief for Claude Code

Paste this whole file to Claude Code as the first message (or save it as CLAUDE.md in the repo root). Build in the order given. Ship a working core first, then the extras.

---

## 1. What we're building

**Chog Raid**: every Chog NFT becomes a room in one giant shared dungeon. Owners set traps and defend their room, even while offline. Everyone else raids rooms and tries to reach the exit.

One-sentence pitch: *Every Chog becomes a room in one giant shared dungeon: owners set traps and defend it while offline, and everyone else raids it.*

This is for Chogathon 2026 (Chog NFT hackathon). Rules that shape every decision:

- **The Chog NFT must be essential.** Without the NFT there must be no room, no defender, and no game. Never build a mode that works without a Chog. (Raiding other people's rooms needs no NFT to *play*, but every room comes from a Chog and only the holder can defend it. Keep a clear connected-wallet flow.)
- Judging weights: Novelty 30, Fun 20, Retention 20, Clarity 15, Execution 15, plus an optional $CHOG token bonus. Tie-breakers: novelty, then retention.
- Must be easy to understand in one sentence, easy to demo in a 3-minute video, and actually working with simple testing instructions.
- I am building this fast. Do not pad scope. A tight, polished core beats a big half-finished world.

## 2. Unknowns: do these first, and ask me if blocked

1. **Chain: Monad (confirmed).** The Chog NFT collection lives on Monad. Chain ID, RPC URL, and the Chog contract address are **env config** (`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS`; see `.env.example`), never hardcoded.
2. **Collection: "Chog Genesis" (resolved).** Contract `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` on Monad mainnet (chain id 143). ERC-721 with the metadata extension (not enumerable). Token ids 1-1969, total supply 1,969. `tokenURI` returns `ipfs://<cid>/<n>.json` (file numbers are shuffled relative to token ids), and the metadata `image` is `ipfs://<cid>/<n>.webp` (1000x1000). Always resolve the image from metadata; never hardcode image URLs. Trait types: Accessory, Aura, Background, Base, Body, Eyes, Form, Head, Mouth, Naked, Side, Skin, Tier.
3. Everything goes through the **NFT data adapter** (`src/nft`): `onchain` (default, real reads) and `mock` (generated Chogs, offline fallback). Switching is one env var: `NFT_ADAPTER`.

## 3. Core game design

**Format: turn-based, grid-based dungeon.** Chosen because it is simple to build, easy to understand, and lets the server replay and validate a raid deterministically (no cheating, no real-time netcode).

### 3.1 Room generation (deterministic)
- Input: token ID + image + traits. Same input must always give the same room.
- Downsample the Chog image to a small grid (start with 16x16). Quantize colors to a few palette groups. Map each group to a tile type (floor, wall, water/slow, hazard, etc.) using a fixed, documented mapping.
- Guarantee solvability: entrance and exit always exist and a path always connects them (run a pathfinding check at generation; adjust tiles if it fails).
- Traits influence the room: for example certain traits add a hazard type, change the number of **trap slots**, or unlock specific **trap types** for the defender. Keep the trait-to-rule table in one config file so it is easy to tune.
- The room should visibly look like its Chog (the palette and shapes should be recognizable).

### 3.2 Defending (owner only)
- Connect wallet, sign a message to log in, and verify ownership via `ownerOf` (or the adapter).
- Owner sees their Chog's room and a limited number of trap slots. Place trap types on valid tiles. Start with 4 types, for example: spike (damage), teleporter (sends raider back), guard (patrols a fixed route), lock-door (needs a key tile).
- Trap setup is saved server-side. The room is "defended" automatically when raided, even when the owner is offline.
- Re-verify ownership at the moment of every edit. If the Chog is transferred, the new owner takes over the room and the old owner loses edit rights.

### 3.3 Raiding (anyone)
- Anyone can browse rooms and raid one. Raider moves tile by tile with a limited number of moves/HP.
- **Spikes and teleporters are hidden** until stepped on; guards, lock doors and keys are visible. So the client must never receive the full trap list for a real raid.
- **The server resolves each move as it is made** (decided by the user): the client starts a raid session, then sends one move at a time. The server appends it to the session's stored move list, re-runs the deterministic engine on the full list, and returns only what the raider can now see (position, HP, moves left, keys, guard positions, revealed traps, events, outcome). Never trust the client's claimed result.
- Record every raid: raider, room, outcome, the full stored move list, where they died or got stuck. The move list is what the owner's raid log replays.
- **Undefended rooms** use seeded practice traps, clearly labeled "practice", so there is always something to raid.
- Owner gets a **raid log**: "Your Chog was raided 4 times, 1 got through," with the replay of each.

### 3.4 Stats and leaderboards
- Per Chog: raids received, breaches, defense rate. Per raider: rooms cleared, fastest clears.
- Leaderboards: best defenders, best raiders, fastest clear per room.

## 4. The extras that make it unique (build after the core works)

These are the novelty features. Build in this order, only after sections 3.1–3.4 work end to end.

1. **Level memory (small, high impact).** Rooms remember their history: a footstep heatmap, death markers, and visible "scars" on frequently raided rooms. A room should look different after it has been raided a lot.
2. **The Atlas (shared world).** Every Chog is a room placed on one big map (neighbors by token ID adjacency or by shared trait). Show a zoomable map of the whole collection, color-coded by how heavily defended or raided each room is. Click a room to raid it. Stretch: walking from one room's exit straight into the next room.
3. **Daily raid.** One featured room per day (seeded, deterministic) with a daily leaderboard, to give people a reason to return.
4. **Raid alerts.** In-app notification feed for "your Chog was raided" (push or email only if time allows).

## 5. $CHOG token bonus (optional, last)

Behind a feature flag, off by default. If time allows: optional $CHOG entry fee for daily raid and payout to the defender or top raiders. The game must be fully playable without it. Keep the integration small and real, not decorative.

## 6. Suggested stack (change if you have a better reason)

- Next.js + TypeScript.
- Canvas rendering (plain Canvas or Phaser 3) for the grid game.
- wagmi + viem for wallet connection and `ownerOf`.
- Supabase (Postgres) for rooms, traps, raids, stats.
- A shared, pure TypeScript **game engine package** (room generation + raid simulation) used by both client and server so replays match exactly. Unit test this heavily.

### Data model (starting point)
- `rooms`: token_id, seed, grid, trait_snapshot, owner_wallet, updated_at
- `traps`: room_id, type, x, y
- `raids`: id, room_id, raider_wallet, moves, outcome, steps, created_at
- `room_stats` (or view): raids, breaches, heat map data
- `alerts`: wallet, raid_id, read

## 7. Build order (milestones, not a schedule)

1. Repo scaffold, env config, NFT data adapter with `mock` mode.
2. Game engine package: deterministic room generator + raid simulator + tests (same input, same output; solvable rooms).
3. Render a room, and let me play a raid locally.
4. Server: save raid results with deterministic replay validation.
5. Wallet login + ownership check + trap placement and saving.
6. Room browser, raid log for owners, stats and leaderboards.
7. Connect the `onchain` adapter with the real collection.
8. Extras in order: level memory, Atlas, daily raid, alerts.
9. Optional $CHOG feature flag.
10. Polish: clean UI, onboarding in one screen ("Defend your Chog. Raid others."), mobile-friendly, loading and error states.

At each milestone, run the app, check it works, and tell me what to look at before moving on.

## 8. Definition of done

- A new user understands the game within 10 seconds of landing.
- A holder can connect, set traps, and see raid logs.
- Anyone can raid a room and the result is server-validated.
- Rooms visibly come from their Chog and are always solvable.
- No bugs in the main path, with clear empty and error states.
- Deployed with a public link, a README with simple testing instructions (including a no-wallet or mock way to try it), and a short list of what is next.

## 9. Submission assets to prepare alongside (hackathon asks for these)

- Demo link + demo video up to 3 minutes. Script it: pick a Chog, show its room, set a trap, switch accounts and raid it, show the raid log.
- Short "why Chog matters" write-up (no Chog, no room, no owner, no game).
- Repo, tech stack, and any pre-existing work used.
- Any user feedback or usage numbers collected, and what is next.

## 10. Rules for you, Claude Code

- Keep scope tight. If something is not in this brief, ask before adding it.
- Prefer simple and working over clever.
- Keep the engine deterministic and pure, with tests.
- Commit in small steps with clear messages.
- Don't hardcode secrets or contract addresses. Use env vars and provide `.env.example`.

## 11. QUEUED: retention and rewards system (start right after milestone 6 is done)

Requested by the user on 2026-10-09. Do NOT start before milestones 4-6 are complete; begin immediately after milestone 6. Retention is 20% of the judging score, so this is core, not optional. Keep the engine deterministic and don't break existing features.

1. **Defender points ("Warden score")**: defenders earn points when a raider fails in their room, more for harder rooms and longer-surviving defenses, and lose none. Show it on the owner dashboard and a Wardens leaderboard.
2. **Raider points**: earned for clears, fast clears, and first clears of a room. Show a Raiders leaderboard.
3. **Streaks**: a daily raid streak for raiders and a "days held" streak for defenders whose room wasn't breached. Show the streak prominently.
4. **Weekly seasons**: leaderboards reset weekly with a visible countdown, and the top 3 get a badge shown on their profile and room.
5. **Daily raid**: one featured room each day (seeded), with its own daily leaderboard.
6. **Raid alerts**: when someone raids your Chog, show an in-app alert (and a notification badge) with outcome and a replay link. Add "Defend again" prompting when your room was breached so the owner has a reason to come back and redesign it.
7. **Rebuild nudge**: after a breach, show the owner exactly where the raider got through (the path heatmap) and suggest a trap slot to change.
8. **$CHOG integration**, behind a feature flag (off by default; the game fully works without it): an optional $CHOG prize pool funded by raid entry fees on the daily raid, paid out to the top defender and top raider each season. $CHOG token contract: `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` on Monad. Build a clean, minimal integration. If a real payout contract is too risky for the time available, build the full UI and logic with a testnet or simulated pool and tell the user clearly what is simulated.

Put all tunable numbers (point values, streak rules, season length, fees) in one config file. When done, run the app and tell the user what to look at.

Note: this overlaps the section 4 extras (daily raid, raid alerts, level memory heatmap) and section 5 ($CHOG). Build them as part of this system rather than twice.
