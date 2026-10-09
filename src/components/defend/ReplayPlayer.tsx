"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { simulateRaid, type Move, type Room, type Trap } from "@/engine";
import { Board } from "../board/Board";
import { causeOfEnd } from "../game/describe";
import styles from "./defend.module.css";

/** Plays back a stored move list with the shared engine. Owners see every trap. */
export function ReplayPlayer({ room, traps, moves, sound }: { room: Room; traps: Trap[]; moves: Move[]; sound?: boolean }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const lastStep = useRef(0);
  const result = useMemo(() => simulateRaid(room, traps, moves.slice(0, step)), [room, traps, moves, step]);
  const full = useMemo(() => simulateRaid(room, traps, moves), [room, traps, moves]);
  const end = full.stepsProcessed;
  const instant = Math.abs(step - lastStep.current) > 1;
  lastStep.current = step;

  useEffect(() => {
    if (!playing) return;
    if (step >= end) return setPlaying(false);
    const t = setTimeout(() => setStep((s) => s + 1), 220);
    return () => clearTimeout(t);
  }, [playing, step, end]);

  return (
    <div className={styles.replay}>
      <div className={styles.replayBoard}>
        <Board
          room={room}
          traps={traps}
          keysHeld={result.keys}
          path={result.path}
          guards={result.guards}
          events={result.events}
          outcome={result.outcome}
          instant={instant}
          sound={sound}
          label="Raid replay"
        />
      </div>
      <div className={styles.replayControls}>
        <button
          className="btn icon"
          onClick={() => {
            if (step >= end) setStep(0);
            setPlaying((p) => !p || step >= end);
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button className="btn icon" onClick={() => (setPlaying(false), setStep((s) => Math.max(0, s - 1)))} aria-label="Step back">
          ◀
        </button>
        <button className="btn icon" onClick={() => (setPlaying(false), setStep((s) => Math.min(end, s + 1)))} aria-label="Step forward">
          ▶|
        </button>
        <input
          type="range"
          min={0}
          max={end}
          value={step}
          aria-label="Replay position"
          onChange={(e) => {
            setPlaying(false);
            setStep(Number(e.target.value));
          }}
        />
        <span className="small muted">
          {step}/{end}
        </span>
      </div>
      <p className="small">{step >= end ? causeOfEnd(full) : " "}</p>
    </div>
  );
}
