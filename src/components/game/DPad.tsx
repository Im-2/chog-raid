"use client";

import type { Move } from "@/engine";
import styles from "./game.module.css";

const BTN: [Move, string, string][] = [
  ["U", "▲", "Up"],
  ["L", "◀", "Left"],
  ["D", "▼", "Down"],
  ["R", "▶", "Right"],
];

export function DPad({ onMove, disabled }: { onMove: (m: Move) => void; disabled?: boolean }) {
  return (
    <div className={styles.dpad} role="group" aria-label="Move">
      {BTN.map(([m, glyph, label]) => (
        <button
          key={m}
          className={styles.dpadBtn}
          data-dir={m}
          aria-label={label}
          disabled={disabled}
          onClick={() => onMove(m)}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
