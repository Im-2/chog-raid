"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sampleTraps, simulateRaid, type Move, type RaidEvent, type Room, type Trap } from "@/engine";
import { RoomCanvas } from "./RoomCanvas";
import styles from "./RaidGame.module.css";

const KEYS: Record<string, Move> = {
  ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R",
  w: "U", s: "D", a: "L", d: "R", W: "U", S: "D", A: "L", D: "R",
};

const OUTCOME_TEXT = {
  breach: { title: "Breached!", body: "You made it through this Chog's room." },
  dead: { title: "You died", body: "The defenses got you." },
  exhausted: { title: "Out of moves", body: "You ran out of moves before the exit." },
} as const;

function describe(e: RaidEvent): string {
  switch (e.kind) {
    case "damage":
      return `-${e.amount} HP from ${e.source}`;
    case "teleport":
      return "Teleported back to the entrance!";
    case "key":
      return "Picked up a key";
    case "door":
      return "The door is locked. Find its key.";
    case "bump":
      return "Bumped into a wall";
    case "breach":
      return "Reached the exit";
    case "dead":
      return "Died";
    case "exhausted":
      return "Out of moves";
  }
}

export function RaidGame({ room, traps, defended }: { room: Room; traps: Trap[]; defended: boolean }) {
  const [moves, setMoves] = useState<Move[]>([]);
  const [practice, setPractice] = useState(!defended);

  const activeTraps = useMemo(
    () => (defended ? traps : practice ? sampleTraps(room, room.seed) : []),
    [defended, traps, practice, room],
  );
  const result = useMemo(() => simulateRaid(room, activeTraps, moves), [room, activeTraps, moves]);
  const over = result.outcome !== "incomplete";

  // Guards, doors and keys are always visible. Spikes and teleporters only once stepped on.
  const visibleTraps = useMemo(() => {
    const stepped = new Set(result.path.map((p) => p.y * room.size + p.x));
    return activeTraps.filter(
      (t) => t.type === "guard" || t.type === "lockdoor" || stepped.has(t.y * room.size + t.x),
    );
  }, [activeTraps, result.path, room.size]);
  const visibleKeys = useMemo(
    () => result.keys.map((k) => visibleTraps.indexOf(activeTraps[k])).filter((i) => i >= 0),
    [result.keys, visibleTraps, activeTraps],
  );

  const move = useCallback(
    (m: Move) => {
      if (!over) setMoves((ms) => [...ms, m]);
    },
    [over],
  );
  const reset = useCallback(() => setMoves([]), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = KEYS[e.key];
      if (!m) return;
      e.preventDefault();
      move(m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const lastEvents = result.events.filter((e) => e.kind !== "bump" || e.step === moves.length).slice(-3);
  const ended = over ? OUTCOME_TEXT[result.outcome as keyof typeof OUTCOME_TEXT] : null;

  return (
    <div className={styles.game}>
      <div className={styles.hud}>
        <div>
          <span className="muted small">HP </span>
          <span className={styles.hearts}>
            {"♥".repeat(result.hp)}
            <span className={styles.lost}>{"♥".repeat(room.rules.raiderHp - result.hp)}</span>
          </span>
        </div>
        <div>
          <span className="muted small">Moves </span>
          <b>{result.movesLeft}</b>
          <span className="muted small"> / {room.rules.maxMoves}</span>
        </div>
        {result.keys.length > 0 && (
          <div>
            <span className="muted small">Keys </span>
            <b>{result.keys.length}</b>
          </div>
        )}
      </div>

      <div className={styles.board}>
        <RoomCanvas
          room={room}
          traps={visibleTraps}
          raider={result.endAt}
          guards={result.guards}
          trail={result.path.slice(0, -1)}
          keysHeld={visibleKeys}
          marker={
            result.outcome === "dead" || result.outcome === "breach"
              ? { at: result.endAt, kind: result.outcome }
              : null
          }
        />
        {ended && (
          <div className={styles.overlay}>
            <div className={styles.result}>
              <h2 className={result.outcome === "breach" ? styles.win : styles.lose}>{ended.title}</h2>
              <p className="muted">{ended.body}</p>
              <p className="small muted">
                {moves.length} moves · {result.hp} HP left
              </p>
              <button className="btn primary" onClick={reset} autoFocus>
                Raid again
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.log} aria-live="polite">
        {lastEvents.length === 0 ? (
          <span className="muted small">
            Reach <b style={{ color: "#fbbf24" }}>OUT</b> from <b style={{ color: "#4ade80" }}>IN</b>. Arrow keys / WASD
            or the pad below.
          </span>
        ) : (
          lastEvents.map((e, i) => (
            <div key={`${e.step}-${i}`} className="small">
              <span className="muted">#{e.step}</span> {describe(e)}
            </div>
          ))
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.pad}>
          <span />
          <button className="btn" onClick={() => move("U")} aria-label="Up" disabled={over}>▲</button>
          <span />
          <button className="btn" onClick={() => move("L")} aria-label="Left" disabled={over}>◀</button>
          <button className="btn" onClick={() => move("D")} aria-label="Down" disabled={over}>▼</button>
          <button className="btn" onClick={() => move("R")} aria-label="Right" disabled={over}>▶</button>
        </div>
        <div className={styles.side}>
          <button className="btn" onClick={reset} disabled={moves.length === 0}>
            Restart
          </button>
          {!defended && (
            <label className="small muted">
              <input
                type="checkbox"
                checked={practice}
                onChange={(e) => {
                  setPractice(e.target.checked);
                  reset();
                }}
              />{" "}
              Practice traps (this Chog has no defender yet)
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
