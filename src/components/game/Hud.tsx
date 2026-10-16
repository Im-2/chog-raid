import { EXTRA_MOVES } from "@/config/tiers";
import type { Difficulty } from "@/lib/difficulty";
import { DifficultyBadge } from "../ui/DifficultyBadge";
import styles from "./game.module.css";

export function Hearts({ hp, max }: { hp: number; max: number }) {
  return (
    <span className={styles.hearts} aria-label={`${hp} of ${max} HP`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 7 6" className={i < hp ? styles.heart : styles.heartLost} aria-hidden>
          <path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
        </svg>
      ))}
    </span>
  );
}

function KeyIcon({ held }: { held: boolean }) {
  return (
    <svg viewBox="0 0 10 5" className={held ? styles.keyHeld : styles.keyEmpty} aria-hidden>
      <path d="M1 0h2v1h1v1h6v1H9v1H8V3H4v1H3v1H1V4H0V1h1zm0 2v1h2V2z" />
    </svg>
  );
}

export type HudProps = {
  hp: number;
  maxHp: number;
  movesLeft: number;
  maxMoves: number;
  /** Keys held, and doors the raider has found. */
  keys: number;
  doors?: number;
  difficulty?: Difficulty | null;
};

/** One compact bar: HP hearts, moves, key status, tier and difficulty. */
export function Hud({ hp, maxHp, movesLeft, maxMoves, keys, doors = 0, difficulty }: HudProps) {
  const pct = Math.max(0, Math.min(100, (movesLeft / maxMoves) * 100));
  const slots = Math.max(keys, doors);
  return (
    <div className={styles.hud}>
      <div className={styles.hudItem}>
        <span className={styles.hudLabel}>HP</span>
        <Hearts hp={hp} max={maxHp} />
      </div>
      <div className={styles.hudItem} style={{ flex: 1 }}>
        <span className={styles.hudLabel}>Moves</span>
        <div className={styles.movesBar} aria-hidden>
          <div className={styles.movesFill} style={{ width: `${pct}%` }} data-low={pct < 25 || undefined} />
        </div>
        <b className={styles.hudValue}>{movesLeft}</b>
      </div>
      {slots > 0 && (
        <div className={styles.hudItem} aria-label={`${keys} of ${slots} keys`}>
          <span className={styles.hudLabel}>Keys</span>
          <span className={styles.keys}>
            {Array.from({ length: slots }, (_, i) => (
              <KeyIcon key={i} held={i < keys} />
            ))}
          </span>
        </div>
      )}
      {difficulty && (
        <div className={`${styles.hudItem} ${styles.hudTier}`}>
          <DifficultyBadge d={difficulty} size="sm" />
        </div>
      )}
    </div>
  );
}

/** Compact, hideable legend for the raid board. */
export function BoardLegend({ onClose, fog }: { onClose: () => void; fog?: boolean }) {
  const rows: [string, string][] = [
    ["var(--legend-floor)", "Floor"],
    ["var(--legend-wall)", "Wall"],
    ["var(--legend-water)", "Water: 2 moves"],
    ["var(--legend-hazard)", "Embers: -1 HP"],
    ["#e5484d", "Guard / next step"],
    ["#ffd166", "Key, door, exit"],
    ["#7fd28c", `Hourglass: +${EXTRA_MOVES.pickupValue} moves`],
    ...(fog ? ([["#06040380", "Explored, out of torchlight"]] as [string, string][]) : []),
  ];
  return (
    <div className={styles.miniLegend} role="note" aria-label="Legend">
      <button className={styles.legendClose} onClick={onClose} aria-label="Hide legend">
        ✕
      </button>
      <ul>
        {rows.map(([c, label]) => (
          <li key={label}>
            <i style={{ background: c }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
