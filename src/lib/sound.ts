// Tiny synthesized sound effects (no audio files). Off by default; toggled by the player.

export type Sfx = "step" | "bump" | "hurt" | "key" | "teleport" | "door" | "win" | "lose" | "place";

let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSfx(name: Sfx) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    return;
  }
  switch (name) {
    case "step":
      return tone(180, 0.05, "square", 0.03);
    case "bump":
      return tone(90, 0.08, "square", 0.06);
    case "place":
      return tone(520, 0.06, "square", 0.05);
    case "hurt":
      tone(220, 0.18, "sawtooth", 0.12, 0, 70);
      return tone(110, 0.2, "square", 0.06, 0.02);
    case "key":
      [660, 880, 1320].forEach((f, i) => tone(f, 0.09, "square", 0.06, i * 0.07));
      return;
    case "door":
      return tone(140, 0.12, "triangle", 0.1);
    case "teleport":
      return tone(300, 0.35, "sine", 0.1, 0, 1400);
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "square", 0.07, i * 0.11));
      return;
    case "lose":
      [392, 311, 233, 175].forEach((f, i) => tone(f, 0.25, "triangle", 0.09, i * 0.16));
      return;
  }
}

const KEY = "chograid:sound";

export function loadSoundPref(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function saveSoundPref(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}
