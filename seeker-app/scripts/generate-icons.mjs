// Generates the PWA icons (no image libraries — raw PNG encoding).
// Brand: indigo rounded square + white check mark (verified shield look).
// Run: node scripts/generate-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- CRC32 -----------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// ---- PNG encode (RGBA, no interlace) ---------------------------------------
const encodePng = (width, height, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---- Drawing ---------------------------------------------------------------
const BG = [79, 70, 229];      // #4f46e5 (indigo-600, matches the UI)
const FG = [255, 255, 255];

const distToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx, ey = y1 + t * dy;
  return Math.hypot(px - ex, py - ey);
};

const renderIcon = (size, { padding = 0 } = {}) => {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.22;                 // corner radius
  const inner = size * 0.98;             // rounded-rect bounds (maskable: full bleed)
  const off = (size - inner) / 2;
  const checkScale = 1 - padding * 2;    // shrink mark for maskable safe zone
  const cx = size / 2, cy = size / 2;
  const pt = (fx, fy) => [
    cx + (fx - 0.5) * inner * checkScale,
    cy + (fy - 0.5) * inner * checkScale,
  ];
  const [ax, ay] = pt(0.27, 0.52);
  const [bx, by] = pt(0.44, 0.69);
  const [c2x, c2y] = pt(0.74, 0.33);
  const stroke = size * 0.085;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded rect inside-test
      const nx = Math.max(off + r - x, x - (off + inner - r), 0);
      const ny = Math.max(off + r - y, y - (off + inner - r), 0);
      const inside = !(nx > 0 && ny > 0 && Math.hypot(nx, ny) > r);

      const i = (y * size + x) * 4;
      if (!inside) { rgba[i + 3] = 0; continue; }

      const d = Math.min(
        distToSegment(x, y, ax, ay, bx, by),
        distToSegment(x, y, bx, by, c2x, c2y),
      );
      const col = d <= stroke ? FG : BG;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
};

const targets = [
  ['icon-192.png', renderIcon(192)],
  ['icon-512.png', renderIcon(512)],
  ['maskable-512.png', renderIcon(512, { padding: 0.12 })], // keep mark in 80% safe zone
  ['apple-touch-icon.png', renderIcon(180)],
];

for (const [name, buf] of targets) {
  fs.writeFileSync(path.join(OUT_DIR, name), buf);
  console.log(`✓ ${name} (${buf.length} bytes)`);
}
