// Generates public/icons/icon-192.png, icon-512.png, icon-512-maskable.png —
// a geometric brand mark (indigo rounded square with a white portal ring),
// written with pure Node (zlib) so the repo needs no image toolchain.
// Run: node scripts/gen-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BRAND = [79, 70, 229]; // #4f46e5
const INK = [15, 23, 42]; // #0f172a
const WHITE = [255, 255, 255];

// ---- tiny PNG writer (RGBA, no interlace, one IDAT) ----
function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundedRectInside(size, edge, radius) {
  // returns a signed-distance-ish alpha 0..255 for the rounded square
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.max(edge, Math.min(size - edge - 1, x));
      const cy = Math.max(edge, Math.min(size - edge - 1, y));
      const dx = x - cx;
      const dy = y - cy;
      // corners rounded by radius: clamp into inner rounded box
      const inner = size - edge * 2;
      const rx = Math.max(radius, inner - radius - 1);
      const ry = Math.max(radius, inner - radius - 1);
      let inCorner = true;
      const ox = Math.min(Math.max(x, edge + radius), size - edge - radius - 1);
      const oy = Math.min(Math.max(y, edge + radius), size - edge - radius - 1);
      const ddx = x - ox;
      const ddy = y - oy;
      if (ddx * ddx + ddy * ddy > radius * radius + radius) inCorner = false;
      const insideMain =
        x >= edge && x < size - edge && y >= edge && y < size - edge;
      const alpha = insideMain && inCorner ? 255 : 0;
      px[(y * size + x) * 4] = BRAND[0];
      px[(y * size + x) * 4 + 1] = BRAND[1];
      px[(y * size + x) * 4 + 2] = BRAND[2];
      px[(y * size + x) * 4 + 3] = alpha;
    }
  }
  return px;
}

function drawMark(px, size) {
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const a = px[i + 3];
    if (a === 0) return;
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  };
  const c = size / 2;
  // white ring + center portal dot, sized to the canvas
  const rOuter = size * 0.34;
  const rInner = size * 0.235;
  const rDot = size * 0.1;
  const glow = 0.6; // soft edge in px
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (px[(y * size + x) * 4 + 3] === 0) continue;
      const d = Math.hypot(x - c, y - c);
      const ring = d >= rInner - glow && d <= rOuter + glow;
      if (ring) {
        const a = Math.max(0, Math.min(1, ring && d > rInner && d < rOuter ? 1 : d >= rInner - glow && d <= rInner ? (d - (rInner - glow)) / glow : d <= rOuter + glow && d >= rOuter ? (rOuter + glow - d) / glow : 0));
        const i = (y * size + x) * 4;
        if (a > 0.15) {
          px[i] = WHITE[0]; px[i + 1] = WHITE[1]; px[i + 2] = WHITE[2];
        }
      }
      if (d <= rDot) {
        const i = (y * size + x) * 4;
        px[i] = BRAND[0]; px[i + 1] = BRAND[1]; px[i + 2] = BRAND[2];
      }
    }
  }
}

function makeIcon(size, opts = {}) {
  // background fill (maskable: full bleed brand; regular: transparent outside ring? we fill only rounded square)
  const px = roundedRectInside(size, Math.max(1, size * 0.02), size * 0.2);
  if (opts.fullBleed) {
    // maskable: fill whole canvas with brand first
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) {
        px[i] = BRAND[0]; px[i + 1] = BRAND[1]; px[i + 2] = BRAND[2]; px[i + 3] = 255;
      }
    }
  }
  drawMark(px, size);
  return png(size, size, Buffer.from(px));
}

mkdirSync(join(root, "public", "icons"), { recursive: true });
writeFileSync(join(root, "public", "icons", "icon-192.png"), makeIcon(192));
writeFileSync(join(root, "public", "icons", "icon-512.png"), makeIcon(512));
writeFileSync(join(root, "public", "icons", "icon-512-maskable.png"), makeIcon(512, { fullBleed: true }));
console.log("icons written to public/icons/{icon-192,icon-512,icon-512-maskable}.png");
