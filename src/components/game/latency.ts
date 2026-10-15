"use client";

// Input-to-screen latency, for verifying how responsive movement feels. Off in production unless
// the page is opened with ?debug=latency. Measures from the input (key, tap, swipe) to the first
// animation frame that draws the raider moving.

let inputAt: number | null = null;
const samples: number[] = [];
const subs = new Set<() => void>();

export function latencyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).get("debug") === "latency";
}

export function markInput(at = performance.now()) {
  inputAt = at;
}

/** Called by the board on the frame it starts drawing a new step. */
export function markFrame(at: number) {
  if (inputAt === null) return;
  const ms = Math.max(0, at - inputAt);
  inputAt = null;
  samples.push(ms);
  if (samples.length > 30) samples.shift();
  subs.forEach((s) => s());
}

export function latencyStats() {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    last: samples[samples.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    worst: sorted[sorted.length - 1],
    n: samples.length,
  };
}

export function onLatency(fn: () => void) {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** For tests and measurement scripts. */
export function latencySamples() {
  return [...samples];
}

if (typeof window !== "undefined") (window as unknown as { __chogLatency?: () => number[] }).__chogLatency = latencySamples;
