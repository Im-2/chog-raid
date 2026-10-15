"use client";

import { useEffect, useState } from "react";
import { latencyEnabled, latencyStats, onLatency } from "./latency";

/** Dev-only overlay: input → screen update in ms. Shown in dev, or with ?debug=latency. */
export function LatencyReadout() {
  const [on, setOn] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    setOn(latencyEnabled());
    return onLatency(() => tick((n) => n + 1));
  }, []);
  if (!on) return null;
  const s = latencyStats();
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 70,
        padding: "4px 8px",
        font: "12px/1.3 ui-monospace, monospace",
        color: s && s.median > 50 ? "#ffb4b4" : "#b8f5c0",
        background: "rgba(0,0,0,0.75)",
        border: "1px solid #444",
        pointerEvents: "none",
      }}
    >
      input→frame {s ? `${s.last.toFixed(0)}ms · median ${s.median.toFixed(0)} · worst ${s.worst.toFixed(0)} (n=${s.n})` : "move to measure"}
    </div>
  );
}
