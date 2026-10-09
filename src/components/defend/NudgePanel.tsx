"use client";

import { useEffect, useState } from "react";
import { TRAP_INFO, type Point, type Trap, type TrapType } from "@/engine";
import styles from "./defend.module.css";

export type NudgeT = {
  breaches: number;
  raids: number;
  heat: number[];
  deaths: Point[];
  suggestion: { action: "add" | "move"; trapIndex?: number; type: TrapType; to: Point; traps: Trap[]; reason: string } | null;
};

/** "Rebuild nudge": where raiders got through since the last save, and one fix to try. */
export function NudgePanel({
  tokenId,
  enabled,
  focus,
  onHeat,
  onApply,
}: {
  tokenId: number;
  /** Only the holder of a defended room can see this. */
  enabled: boolean;
  /** Opened from a "Defend again" alert: show the heatmap straight away. */
  focus: boolean;
  onHeat: (n: NudgeT | null) => void;
  onApply: (traps: Trap[], at: Point) => void;
}) {
  const [nudge, setNudge] = useState<NudgeT | null>(null);
  const [show, setShow] = useState(focus);

  useEffect(() => {
    if (!enabled) return;
    fetch(`/api/rooms/${tokenId}/nudge`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setNudge(j?.nudge ?? null))
      .catch(() => {});
  }, [enabled, tokenId]);

  useEffect(() => onHeat(show ? nudge : null), [show, nudge, onHeat]);

  if (!enabled || !nudge || nudge.raids === 0) return null;
  const s = nudge.suggestion;
  return (
    <section className="panel" data-alert={nudge.breaches > 0 || undefined} style={nudge.breaches ? { borderColor: "var(--blood)" } : undefined}>
      <h3 className={styles.h3}>Since your last save</h3>
      <p className="small" style={{ margin: "0 0 8px" }}>
        <b className="num">{nudge.raids}</b> raid{nudge.raids === 1 ? "" : "s"},{" "}
        <b className="num" style={{ color: nudge.breaches ? "var(--blood)" : "var(--moss)" }}>
          {nudge.breaches}
        </b>{" "}
        got through.
      </p>
      <label className={styles.check} style={{ marginTop: 0 }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show where raiders walked (heat) and fell (✕)
      </label>
      {s && (
        <div className={styles.selected}>
          <p className="small" style={{ margin: "0 0 6px" }}>
            <b>Suggested fix:</b> {s.action === "add" ? "add a" : "move your"} {TRAP_INFO[s.type].label.toLowerCase()}{" "}
            {s.action === "add" ? "at" : "to"} <span className="num">{s.to.x},{s.to.y}</span>.
          </p>
          <p className="small muted" style={{ margin: "0 0 8px" }}>
            {s.reason}
          </p>
          <button
            className="btn primary"
            onClick={() => {
              setShow(true);
              onApply(s.traps, s.to);
            }}
          >
            Apply suggestion
          </button>
        </div>
      )}
    </section>
  );
}
