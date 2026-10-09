import { COLOR_RULES } from "./config";
import type { Pixel, Tile } from "./types";

export function luminance([r, g, b]: Pixel): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Returns [hue 0-360, saturation 0-1, lightness 0-1]. */
export function rgbToHsl([r8, g8, b8]: Pixel): [number, number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function colorDistance(a: Pixel, b: Pixel): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function toHex([r, g, b]: Pixel): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Color class of a single pixel, ignoring void (which needs neighborhood info). */
export function classifyPixel(p: Pixel): Exclude<Tile, "void"> {
  const c = COLOR_RULES;
  if (luminance(p) < c.wallMaxLuminance) return "wall";
  const [h, s, l] = rgbToHsl(p);
  if (h >= c.waterHueMin && h <= c.waterHueMax && s >= c.waterMinSat) return "water";
  if (
    (h >= c.hazardHueMin || h <= c.hazardHueMax) &&
    s >= c.hazardMinSat &&
    l >= c.hazardMinLight &&
    l <= c.hazardMaxLight
  ) {
    return "hazard";
  }
  return "floor";
}
