import "server-only";
import sharp from "sharp";
import { ROOM_SIZE, type Pixel } from "@/engine";

/** A cell counts as "ink" (outline) when at least this share of its pixels is dark. */
const INK_SHARE = 0.18;
const INK_LUMINANCE = 0.12;
/** Work resolution before grouping into ROOM_SIZE x ROOM_SIZE cells. */
const WORK = ROOM_SIZE * 16;

/**
 * Downsample artwork to ROOM_SIZE x ROOM_SIZE for room generation.
 *
 * Plain averaging washes out the hand-drawn outlines, which are what give a room
 * its walls. So each cell keeps the average of its dark pixels when they make up
 * at least INK_SHARE of the cell, and otherwise the average of its light pixels.
 */
export async function downsampleImage(image: Buffer): Promise<Pixel[]> {
  const { data, info } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .resize(WORK, WORK, { fit: "cover", kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const cell = WORK / ROOM_SIZE;
  const out: Pixel[] = [];
  for (let cy = 0; cy < ROOM_SIZE; cy++) {
    for (let cx = 0; cx < ROOM_SIZE; cx++) {
      const dark = [0, 0, 0, 0];
      const light = [0, 0, 0, 0];
      for (let y = cy * cell; y < (cy + 1) * cell; y++) {
        for (let x = cx * cell; x < (cx + 1) * cell; x++) {
          const i = (y * WORK + x) * ch;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const acc = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < INK_LUMINANCE ? dark : light;
          acc[0] += r;
          acc[1] += g;
          acc[2] += b;
          acc[3]++;
        }
      }
      const use = dark[3] >= INK_SHARE * cell * cell ? dark : light;
      out.push([Math.round(use[0] / use[3]), Math.round(use[1] / use[3]), Math.round(use[2] / use[3])]);
    }
  }
  return out;
}
