import type { Point, Room } from "@/engine";
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
export function NativeDefensePanel({ room, highlight, onHighlight }: { room: Room; highlight?: boolean; onHighlight?: (on: boolean) => void }) {
  const n = room.native;
  const guards = n.traps.filter((t) => t.type === "guard").length;
  const doors = n.traps.filter((t) => t.type === "lockdoor").length;
  const rows: [number, string][] = [
    [n.walls.length, "extra walls (tighter corridors)"],
    [n.hazards.length, "ember tiles"],
    [n.moat.length, "moat tiles of slow water"],
    [guards, guards === 1 ? "guard on patrol" : "guards on patrol"],
    [doors, doors === 1 ? "locked door, key far away" : "locked doors, keys far away"],
  ];
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
      <p className="small muted">
        Built in by the {room.tier.name} tier: always on, and the owner can&apos;t remove them. Raiders get <b>{room.rules.raiderHp}</b> HP and{" "}
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
