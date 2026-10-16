import type { Point, PublicRoom, Room } from "@/engine";
import { EXTRA_MOVES } from "@/config/tiers";
import { difficultyOfRoom } from "@/lib/difficulty";
import { DifficultyBadge } from "../ui/DifficultyBadge";
import styles from "./game.module.css";

/** True when a tile holds a native (built-in) piece: an owner can't place, move or remove it. */
export function isNativeAt(room: Room, p: Point): boolean {
  const i = p.y * room.size + p.x;
  const n = room.native;
  if (!n) return false;
  return (
    n.walls.includes(i) ||
    n.hazards.includes(i) ||
    n.moat.includes(i) ||
    n.traps.some((t) => (t.x === p.x && t.y === p.y) || (t.type === "lockdoor" && t.key.x === p.x && t.key.y === p.y))
  );
}

/** The labeled "Native defense" layer: what the room's tier built in, separate from owner traps. */
/** Counts of a room's native pieces, from a full room or a public (fogged) one. */
function nativeCounts(room: Room | PublicRoom) {
  const n = room.native;
  if ("counts" in n) return n.counts;
  return {
    walls: n.walls.length,
    hazards: n.hazards.length,
    moat: n.moat.length,
    guards: n.traps.filter((t) => t.type === "guard").length,
    doors: n.traps.filter((t) => t.type === "lockdoor").length,
    pickups: n.pickups.length,
  };
}

export function NativeDefensePanel({ room, highlight, onHighlight }: { room: Room | PublicRoom; highlight?: boolean; onHighlight?: (on: boolean) => void }) {
  const n = room.native;
  const { guards, doors, walls, hazards, moat, pickups } = nativeCounts(room);
  const rows: [number, string][] = [
    [walls, "extra walls (tighter corridors)"],
    [hazards, "ember tiles"],
    [moat, "moat tiles of slow water"],
    [guards, guards === 1 ? "guard on patrol" : "guards on patrol"],
    [doors, doors === 1 ? "locked door, key far away" : "locked doors, keys far away"],
  ];
  const extras: [number, string][] = [[pickups, `hourglass${pickups === 1 ? "" : "es"} (+${EXTRA_MOVES.pickupValue} moves for raiders)`]];
  const any = rows.some(([k]) => k > 0);
  return (
    <section className={`panel ${styles.native}`} data-tier={room.tier.id}>
      <div className={styles.nativeHead}>
        <h3 className={styles.nativeTitle}>Native defense</h3>
        <DifficultyBadge d={difficultyOfRoom(room)} />
      </div>
      {n.boss && (
        <p className={styles.boss}>
          <b>Boss room: {n.boss.name}.</b> {n.boss.blurb}
        </p>
      )}
      {any ? (
        <ul className={styles.nativeList}>
          {rows.filter(([k]) => k > 0).map(([k, label]) => (
            <li key={label}>
              <b className="num">{k}</b> {label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Common rooms have no built-in defenses: the owner&apos;s traps are all there is.</p>
      )}
      {pickups > 0 && (
        <ul className={styles.nativeList}>
          {extras.map(([k, label]) => (
            <li key={label}>
              <b className="num">{k}</b> {label}
            </li>
          ))}
        </ul>
      )}
      {room.tier.fog && <p className="small">Boss room: fog of war. Raiders only see what their torch lights.</p>}
      <p className="small muted">
        Built in by the {room.tier.name} tier{"counts" in room.native && room.tier.fog ? " (hidden in the dark until you find them)" : ""}: always on, and the owner can&apos;t remove them. Raiders get <b>{room.rules.raiderHp}</b> HP and{" "}
        <b>{room.rules.maxMoves}</b> moves here.
      </p>
      {onHighlight && any && (
        <label className={styles.nativeToggle}>
          <input type="checkbox" checked={!!highlight} onChange={(e) => onHighlight(e.target.checked)} /> Highlight on the map
        </label>
      )}
    </section>
  );
}
