// Generates the favicon set from the flame cursor (src/app/globals.css, html[data-fire-cursor]).
// The flame is 12x12 pixel art; every size scales it by a whole number (nearest neighbour) and
// pads it, so the icon stays pixel-crisp, including at 16x16 (1:1 with a 2px margin).
//
// usage: node scripts/make-icons.mjs
import fs from "node:fs";
import sharp from "sharp";

// Same paths as the cursor, on a 12x12 grid.
const FLAME = `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' shape-rendering='crispEdges'><path fill='#0b0806' d='M5 0h2v1h1v2h1v1h1v5H9v1H8v1H4v-1H3V9H2V4h1V3h1V1h1z'/><path fill='#ff7a2f' d='M5 1h2v2h1v1h1v5H8v1H4V9H3V4h1V3h1z'/><path fill='#ffb347' d='M5 4h2v1h1v4H7v1H5V9H4V5h1z'/><path fill='#fff3c4' d='M5 7h2v2H5z'/></svg>`;
const BG = { r: 18, g: 13, b: 10, alpha: 1 }; // #120d0a, the app background
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// Rasterize at 12x12 by sampling a large render at pixel centres (exact for this grid art).
const big = await sharp(Buffer.from(FLAME), { density: 72 * 20 }).resize(240, 240, { kernel: "nearest" }).ensureAlpha().raw().toBuffer();
const px = Buffer.alloc(12 * 12 * 4);
for (let y = 0; y < 12; y++) {
  for (let x = 0; x < 12; x++) {
    const s = ((y * 20 + 10) * 240 + (x * 20 + 10)) * 4;
    big.copy(px, (y * 12 + x) * 4, s, s + 4);
  }
}
const grid = () => sharp(px, { raw: { width: 12, height: 12, channels: 4 } });

/** The flame scaled by an integer and centred in a `size` square. */
async function icon(size, scale, background = CLEAR) {
  const art = await grid().resize(12 * scale, 12 * scale, { kernel: "nearest" }).png().toBuffer();
  const pad = Math.floor((size - 12 * scale) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, left: pad, top: pad }])
    .png()
    .toBuffer();
}

fs.mkdirSync("public", { recursive: true });
const p16 = await icon(16, 1);
const p32 = await icon(32, 2);
const p48 = await icon(48, 4);

// favicon.ico with PNG entries (16, 32, 48).
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(([size, png], i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size, o);
    head.writeUInt8(size, o + 1);
    head.writeUInt8(0, o + 2);
    head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map(([, png]) => png)]);
}
fs.writeFileSync("src/app/favicon.ico", ico([[16, p16], [32, p32], [48, p48]]));

// SVG icon (transparent), 16x16 viewBox: the 12x12 flame with a 2px margin.
fs.writeFileSync("src/app/icon.svg", FLAME.replace("width='12' height='12' viewBox='0 0 12 12'", "width='16' height='16' viewBox='-2 -2 16 16'") + "\n");
// Transparent PNG icon too, for browsers without SVG favicons.
fs.writeFileSync("src/app/icon1.png", p32);

// Apple touch icon: opaque (iOS fills transparency with black), dark dungeon background.
fs.writeFileSync("src/app/apple-icon.png", await icon(180, 12, BG));
// Web manifest icons.
fs.writeFileSync("public/icon-192.png", await icon(192, 14, BG));
fs.writeFileSync("public/icon-512.png", await icon(512, 40, BG));

// Share preview (1200x630): flame + name + pitch on the dungeon background.
const flame = await grid().resize(12 * 30, 12 * 30, { kernel: "nearest" }).png().toBuffer();
const text = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>
  <style>.t{font-family:'Courier New',monospace;font-weight:700}</style>
  <text x='520' y='280' class='t' font-size='104' fill='#ffb347'>CHOG RAID</text>
  <text x='524' y='350' class='t' font-size='34' fill='#f4e7d0'>Every Chog is a dungeon room.</text>
  <text x='524' y='398' class='t' font-size='34' fill='#f4e7d0'>Defend yours. Raid the rest.</text>
  <rect x='524' y='440' width='300' height='8' fill='#ff7a2f'/>
</svg>`;
const og = await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
  .composite([
    { input: flame, left: 110, top: 135 },
    { input: Buffer.from(text), left: 0, top: 0 },
  ])
  .png()
  .toBuffer();
fs.writeFileSync("src/app/opengraph-image.png", og);
fs.writeFileSync("src/app/twitter-image.png", og);
console.log("icons written");
