"use client";

import { useEffect, useRef } from "react";
import type { Move } from "@/engine";
import styles from "./game.module.css";

const BTN: [Move, string, string][] = [
  ["U", "▲", "Up"],
  ["L", "◀", "Left"],
  ["D", "▼", "Down"],
  ["R", "▶", "Right"],
];

/** Hold a direction: first step at once, repeats start after HOLD_DELAY, then every HOLD_EVERY. */
const HOLD_DELAY = 260;
const HOLD_EVERY = 140;

/**
 * On-screen d-pad. Moves on pointerdown (no click delay on phones), repeats while held, and
 * still works from the keyboard (Enter/Space on a focused button).
 */
export function DPad({ onMove, disabled }: { onMove: (m: Move) => void; disabled?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hold = (m: Move, wait: number) => {
    timer.current = setTimeout(() => {
      moveRef.current(m);
      hold(m, HOLD_EVERY);
    }, wait);
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  return (
    <div className={styles.dpad} role="group" aria-label="Move">
      {BTN.map(([m, glyph, label]) => (
        <button
          key={m}
          className={styles.dpadBtn}
          data-dir={m}
          aria-label={label}
          disabled={disabled}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // no focus ring flash, no text selection, no synthetic click
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
            stop();
            onMove(m);
            hold(m, HOLD_DELAY);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            if (e.detail === 0) onMove(m); // keyboard activation only; pointer already moved
          }}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
