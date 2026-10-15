// Procedural 16x16 mock Chogs. Deterministic per token id. Only used in mock mode.

import { hashString, mulberry32, pickWeighted, ROOM_SIZE, toHex, type Pixel, type Trait } from "@/engine";

type Weighted = readonly (readonly [string, number])[];

export const MOCK_TRAITS: Record<string, Weighted> = {
  Background: [["Lilac", 5], ["Sky", 4], ["Mint", 4], ["Peach", 4], ["Cream", 3], ["Night", 2]],
  Body: [["Purple", 8], ["Grape", 3], ["Pink", 3], ["Lime", 2], ["Gold", 1], ["Frost", 1]],
  Eyes: [["Round", 8], ["Sleepy", 3], ["Shades", 2], ["Star", 2], ["Laser", 1]],
  Mouth: [["Smile", 6], ["Grin", 3], ["Open", 3], ["Fangs", 2], ["Tongue", 2]],
  Pattern: [["None", 6], ["Spots", 3], ["Stripes", 3], ["Belly", 3], ["Puddles", 2], ["Embers", 1]],
  Head: [["None", 8], ["Crown", 1], ["Halo", 1], ["Horns", 2], ["Cap", 2]],
  // Same proportions as the real collection (1279 / 590 / 60 / 30 / 10). Last, so earlier picks are unchanged.
  Tier: [["Common", 1279], ["Uncommon", 590], ["Rare", 60], ["Epic", 30], ["Legendary", 10]],
};

const BG: Record<string, Pixel> = {
  Lilac: [217, 200, 245], Sky: [191, 227, 255], Mint: [200, 242, 220],
  Peach: [255, 217, 194], Cream: [245, 238, 220], Night: [61, 56, 112],
};
const BODY: Record<string, Pixel> = {
  Purple: [142, 92, 240], Grape: [107, 63, 201], Pink: [240, 143, 200],
  Lime: [155, 220, 92], Gold: [242, 193, 78], Frost: [96, 165, 250],
};
const INK: Pixel = [29, 20, 48];
const RED: Pixel = [255, 59, 47];
const BLUE: Pixel = [59, 130, 246];
const YELLOW: Pixel = [255, 224, 102];
const WHITE: Pixel = [255, 255, 255];

// O = outline, B = body, E = eye, M = mouth, . = background
const TEMPLATE = [
  "................",
  "..OO........OO..",
  ".OBBO......OBBO.",
  ".OBBBOOOOOOBBBO.",
  ".OBBBBBBBBBBBBO.",
  "OBBBBBBBBBBBBBBO",
  "OBBEEBBBBBBEEBBO",
  "OBBEEBBBBBBEEBBO",
  "OBBBBBBBBBBBBBBO",
  "OBBBBBMMMMBBBBBO",
  "OBBBBBBBBBBBBBBO",
  "OBBBBBBBBBBBBBBO",
  ".OBBBBBBBBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OOOOOOOOOOOO..",
  "................",
];

export function mockTraits(tokenId: number): Trait[] {
  const rng = mulberry32(hashString(`mock-chog:${tokenId}`));
  return Object.entries(MOCK_TRAITS).map(([trait_type, options]) => ({
    trait_type,
    value: pickWeighted(rng, options),
  }));
}

export function mockPixels(tokenId: number): Pixel[] {
  const traits = Object.fromEntries(mockTraits(tokenId).map((t) => [t.trait_type, t.value]));
  const S = ROOM_SIZE;
  const bg = BG[traits.Background];
  const body = BODY[traits.Body];
  const px: Pixel[] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = TEMPLATE[y][x];
      px.push(c === "." ? bg : c === "B" ? body : INK);
    }
  }
  const set = (x: number, y: number, p: Pixel) => (px[y * S + x] = p);
  const eyeCells = [[3, 6], [4, 6], [3, 7], [4, 7], [11, 6], [12, 6], [11, 7], [12, 7]];

  switch (traits.Eyes) {
    case "Sleepy":
      eyeCells.filter(([, y]) => y === 6).forEach(([x, y]) => set(x, y, body));
      break;
    case "Shades":
      for (let x = 5; x <= 10; x++) set(x, 6, INK);
      break;
    case "Star":
      eyeCells.forEach(([x, y]) => set(x, y, YELLOW));
      break;
    case "Laser":
      eyeCells.forEach(([x, y]) => set(x, y, RED));
      break;
  }

  switch (traits.Mouth) {
    case "Grin":
      set(5, 9, INK);
      set(10, 9, INK);
      break;
    case "Open":
      set(7, 10, INK);
      set(8, 10, INK);
      break;
    case "Fangs":
      set(6, 10, WHITE);
      set(9, 10, WHITE);
      break;
    case "Tongue":
      set(7, 10, RED);
      set(8, 10, RED);
      break;
  }

  switch (traits.Pattern) {
    case "Spots":
      [[4, 4], [11, 4], [3, 10], [12, 11], [7, 12], [9, 5]].forEach(([x, y]) => set(x, y, INK));
      break;
    case "Stripes":
      [2, 3, 4, 5, 10, 11, 12, 13].forEach((x) => set(x, 8, INK));
      [3, 4, 5, 6, 9, 10, 11, 12].forEach((x) => set(x, 12, INK));
      break;
    case "Belly":
      for (let y = 10; y <= 13; y++) for (let x = 5; x <= 10; x++) set(x, y, [239, 230, 255]);
      break;
    case "Puddles":
      [[3, 11], [4, 11], [3, 12], [4, 12], [11, 11], [12, 11], [11, 12], [12, 12], [7, 4], [8, 4]].forEach(
        ([x, y]) => set(x, y, BLUE),
      );
      break;
    case "Embers":
      [[3, 5], [12, 5], [6, 11], [9, 12], [2, 9], [13, 10]].forEach(([x, y]) => set(x, y, RED));
      break;
  }

  switch (traits.Head) {
    case "Crown":
      [[6, 1], [8, 1], [10, 1], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]].forEach(([x, y]) => set(x, y, YELLOW));
      break;
    case "Halo":
      for (let x = 5; x <= 10; x++) set(x, 0, YELLOW);
      break;
    case "Horns":
      [[1, 0], [14, 0]].forEach(([x, y]) => set(x, y, WHITE));
      break;
    case "Cap":
      for (let x = 4; x <= 11; x++) set(x, 4, [230, 57, 70]);
      break;
  }
  return px;
}

/** Pixel-art SVG of the mock Chog (crisp at any size). */
export function mockSvg(tokenId: number): string {
  const px = mockPixels(tokenId);
  const rects = px
    .map((p, i) => `<rect x="${i % ROOM_SIZE}" y="${Math.floor(i / ROOM_SIZE)}" width="1" height="1" fill="${toHex(p)}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ROOM_SIZE} ${ROOM_SIZE}" shape-rendering="crispEdges">${rects}</svg>`;
}
