// Génère les icônes PNG de l'application (192, 512, apple-touch-icon) sans dépendance externe.
import fs from 'node:fs';
import zlib from 'node:zlib';

const S = 512; // la plus grande taille sert de source
const px = new Uint8Array(S * S * 4);
const cx = S / 2, cy = S / 2, R = S * 0.42;

function star(x, y, rOut, rIn, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOut : rIn, a = rot + (i * Math.PI) / 5;
    pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
  }
  return pts;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
const body = star(cx, cy, R, R * 0.58);
const eyeL = [cx - R * 0.34, cy - R * 0.12], eyeR = [cx + R * 0.34, cy - R * 0.12], eyeRr = R * 0.11;
const smile = { a: [cx - R * 0.3, cy + R * 0.2], b: [cx, cy + R * 0.36], c: [cx + R * 0.3, cy + R * 0.2], w: R * 0.05 };
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = (y * S + x) * 4;
  if (!inPoly(x, y, body)) continue;
  // dégradé vertical du jaune vers l'orange
  const t = y / S;
  px[i] = 255; px[i + 1] = Math.round(224 - 60 * t); px[i + 2] = Math.round(106 - 80 * t); px[i + 3] = 255;
  const dL = Math.hypot(x - eyeL[0], y - eyeL[1]), dR = Math.hypot(x - eyeR[0], y - eyeR[1]);
  if (dL < eyeRr || dR < eyeRr) { px[i] = 26; px[i + 1] = 20; px[i + 2] = 46; px[i + 3] = 255; continue; }
  if (distSeg(x, y, ...smile.a, ...smile.b) < smile.w || distSeg(x, y, ...smile.b, ...smile.c) < smile.w) {
    px[i] = 26; px[i + 1] = 20; px[i + 2] = 46; px[i + 3] = 255;
  }
}
function png(size) {
  const k = size / S;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); row[0] = 0;
    for (let x = 0; x < size; x++) {
      const sx = Math.min(S - 1, Math.floor(x / k)), sy = Math.min(S - 1, Math.floor(y / k));
      const i = (sy * S + sx) * 4, o = 1 + x * 4;
      row[o] = px[i]; row[o + 1] = px[i + 1]; row[o + 2] = px[i + 2]; row[o + 3] = px[i + 3];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length >>> 0, 0); b.write(type, 4); data.copy(b, 8);
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    let crc = 0xffffffff; for (let i = 4; i < 8 + data.length; i++) crc = crcTable[(crc ^ b[i]) & 0xff] ^ (crc >>> 8);
    b.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length); return b;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) fs.writeFileSync(new URL(`../icons/${file}`, import.meta.url), png(size));
console.log('icônes générées :', fs.readdirSync(new URL('../icons/', import.meta.url)).join(', '));
