import { EXTRA_MOVES } from "@/config/tiers";
import { GAME } from "./config";
import { inBounds, isMove, samePoint, step } from "./grid";
import { guardAt, guardRoute } from "./traps";
import type { Point, RaidEvent, RaidInput, RaidOutcome, RaidResult, Room, Trap } from "./types";

/**
 * Replays a raid. This is the single source of truth: the client runs it to show
 * the game, the server runs it on the submitted move list to decide the outcome.
 *
 * Each move, in order:
 * 1. Move one tile. Walls, void, room edges and locked doors cause a bump (no
 *    movement, still costs 1 move). Entering water costs GAME.waterMoveCost.
 * 2. Reaching the exit is an immediate breach.
 * 3. Guards advance one step along their patrol.
 * 4. Effects of the tile you entered: hazard / spike damage, key pickup.
 * 5. Guard contact (same tile, or swapped places) deals damage.
 * 6. Teleporter sends you to the entrance.
 * 7. HP <= 0 is death; otherwise no moves left is exhaustion, unless the very next input is
 *    "E" ("Keep going", at most EXTRA_MOVES.extendLimit times): that adds EXTRA_MOVES.extend moves
 *    and the raid goes on. Anywhere else "E" does nothing.
 *
 * Entering a "+moves" pickup tile (room.native.pickups) adds EXTRA_MOVES.pickupValue moves, once.
 * Guards move once per step, not per "E".
 *
 * Moves after the raid ends are ignored. If moves run out of input first, the
 * outcome is "incomplete".
 */
export function simulateRaid(
  room: Room,
  traps: Trap[],
  moves: readonly RaidInput[],
  /** Patrol routes per guard (in trap order), for a client that can't see every tile a guard walks. */
  opts: { routes?: Point[][] } = {},
): RaidResult {
  const { size, rules } = room;
  const guards = traps.flatMap((t) => (t.type === "guard" ? [guardRoute(room, t)] : []));
  opts.routes?.forEach((r, i) => i < guards.length && r.length && (guards[i] = r));
  const trapAt = new Map<number, { trap: Trap; index: number }>();
  const keyAt = new Map<number, number>();
  traps.forEach((trap, index) => {
    trapAt.set(trap.y * size + trap.x, { trap, index });
    if (trap.type === "lockdoor") keyAt.set(trap.key.y * size + trap.key.x, index);
  });

  let pos: Point = room.entrance;
  let hp: number = rules.raiderHp;
  let movesLeft: number = rules.maxMoves;
  let outcome: RaidOutcome | null = null;
  let turn = 0;
  /** Steps taken (guards' clock); equals `turn` unless the list holds "E". */
  let clock = 0;
  let extended = 0;
  const pickupAt = new Set(room.native?.pickups ?? []);
  const picked = new Set<number>();
  const keys = new Set<number>();
  const path: Point[] = [pos];
  const events: RaidEvent[] = [];

  for (; turn < moves.length && outcome === null; turn++) {
    const m = moves[turn];
    if (m === "E") continue; // only meaningful right after running out (below)
    if (!isMove(m)) throw new Error(`invalid move at ${turn}: ${String(m)}`);
    const s = turn + 1;
    const prev = pos;
    const target = step(pos, m);
    const tile = inBounds(size, target) ? room.tiles[target.y * size + target.x] : "void";
    const there = inBounds(size, target) ? trapAt.get(target.y * size + target.x) : undefined;
    const locked = there?.trap.type === "lockdoor" && !keys.has(there.index);

    let entered = false;
    if (tile === "wall" || tile === "void" || locked) {
      events.push({ step: s, kind: locked ? "door" : "bump", at: target });
      movesLeft -= 1;
    } else {
      pos = target;
      entered = true;
      movesLeft -= tile === "water" ? GAME.waterMoveCost : 1;
    }
    path.push(pos);

    if (samePoint(pos, room.exit)) {
      outcome = "breach";
      events.push({ step: s, kind: "breach", at: pos });
      clock++;
      break;
    }

    const damage = (amount: number, source: RaidEvent["source"]) => {
      hp -= amount;
      events.push({ step: s, kind: "damage", at: pos, amount, source });
    };

    let teleport = false;
    if (entered) {
      if (tile === "hazard") damage(GAME.hazardDamage, "hazard");
      if (there?.trap.type === "spike") damage(GAME.spikeDamage, "spike");
      if (there?.trap.type === "teleporter") teleport = true;
      const here = pos.y * size + pos.x;
      if (pickupAt.has(here) && !picked.has(here)) {
        picked.add(here);
        movesLeft += EXTRA_MOVES.pickupValue;
        events.push({ step: s, kind: "moves", at: pos, amount: EXTRA_MOVES.pickupValue });
      }
      const k = keyAt.get(pos.y * size + pos.x);
      if (k !== undefined && !keys.has(k)) {
        keys.add(k);
        events.push({ step: s, kind: "key", at: pos });
      }
    }

    for (const route of guards) {
      const before = guardAt(route, clock);
      const now = guardAt(route, clock + 1);
      if (samePoint(now, pos) || (samePoint(now, prev) && samePoint(before, pos))) {
        damage(GAME.guardDamage, "guard");
      }
    }

    if (teleport && hp > 0) {
      pos = room.entrance;
      path.push(pos);
      events.push({ step: s, kind: "teleport", at: pos });
    }

    if (hp <= 0) {
      outcome = "defeated";
      events.push({ step: s, kind: "defeated", at: pos });
    } else if (movesLeft <= 0) {
      if (moves[turn + 1] === "E" && extended < EXTRA_MOVES.extendLimit) {
        extended++;
        movesLeft += EXTRA_MOVES.extend;
        turn++; // consume the "E"
        events.push({ step: turn + 1, kind: "extend", at: pos, amount: EXTRA_MOVES.extend });
      } else {
        outcome = "out_of_moves";
        events.push({ step: s, kind: "out_of_moves", at: pos });
      }
    }
    clock++;
  }

  const processed = outcome === "breach" ? turn + 1 : turn;
  return {
    outcome: outcome ?? "incomplete",
    hp: Math.max(hp, 0),
    movesLeft: Math.max(movesLeft, 0),
    stepsProcessed: processed,
    path,
    keys: [...keys].sort((a, b) => a - b),
    guards: guards.map((r) => guardAt(r, clock)),
    events,
    endAt: pos,
    pickedUp: [...picked],
    extended,
  };
}
