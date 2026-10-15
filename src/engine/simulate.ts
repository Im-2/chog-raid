import { GAME } from "./config";
import { inBounds, isMove, samePoint, step } from "./grid";
import { guardAt, guardRoute } from "./traps";
import type { Move, Point, RaidEvent, RaidOutcome, RaidResult, Room, Trap } from "./types";

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
 * 7. HP <= 0 is death; otherwise no moves left is exhaustion.
 *
 * Moves after the raid ends are ignored. If moves run out of input first, the
 * outcome is "incomplete".
 */
export function simulateRaid(
  room: Room,
  traps: Trap[],
  moves: readonly Move[],
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
  const keys = new Set<number>();
  const path: Point[] = [pos];
  const events: RaidEvent[] = [];

  for (; turn < moves.length && outcome === null; turn++) {
    const m = moves[turn];
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
      const k = keyAt.get(pos.y * size + pos.x);
      if (k !== undefined && !keys.has(k)) {
        keys.add(k);
        events.push({ step: s, kind: "key", at: pos });
      }
    }

    for (const route of guards) {
      const before = guardAt(route, turn);
      const now = guardAt(route, turn + 1);
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
      outcome = "out_of_moves";
      events.push({ step: s, kind: "out_of_moves", at: pos });
    }
  }

  const processed = outcome === "breach" ? turn + 1 : turn;
  return {
    outcome: outcome ?? "incomplete",
    hp: Math.max(hp, 0),
    movesLeft: Math.max(movesLeft, 0),
    stepsProcessed: processed,
    path,
    keys: [...keys].sort((a, b) => a - b),
    guards: guards.map((r) => guardAt(r, processed)),
    events,
    endAt: pos,
  };
}
