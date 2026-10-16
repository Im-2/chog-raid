"use client";

import { useCallback, useEffect, useState } from "react";

// "Reduced effects": no screen shake, flicker or water shimmer, few particles, a camera that snaps,
// and no idle redraws. On automatically for prefers-reduced-motion, low-end devices, or when the
// board's frame watchdog sees sustained slow frames; the player can force it on or off.

export type EffectsMode = "auto" | "full" | "reduced";
const KEY = "chograid:effects";

function lowEnd(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency ?? 8) <= 2;
}

export function useEffectsMode() {
  const [mode, setModeState] = useState<EffectsMode>("auto");
  const [autoReduced, setAutoReduced] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "full" || v === "reduced") setModeState(v);
    } catch {}
    setAutoReduced(lowEnd());
  }, []);

  const setMode = useCallback((m: EffectsMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  }, []);

  /** The board reports sustained slow frames: switch to reduced (only in auto mode). */
  const onSlow = useCallback(() => setAutoReduced(true), []);

  const reduced = mode === "reduced" || (mode === "auto" && autoReduced);
  return { mode, setMode, reduced, onSlow };
}
