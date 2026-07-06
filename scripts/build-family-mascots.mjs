// build-family-mascots.mjs — the 3 special "família" mascots (Fatma, Rafa,
// Hamy the cat), built from the PRETTY full-body high-res sources (not the tiny
// bust panels). Fatma has a full 4×2 pose sheet; Rafa and Hamy are single
// full-body renders reused across the 9 poses. Reuses the exact background-key
// pipeline as build-mascots.mjs so cutouts match the roster.
//
// Sources are the raw uploads (NOT committed); only the optimized webp ship.
// Usage: node scripts/build-family-mascots.mjs --dir <folder-with-source-pngs>

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DIR = argOf('--dir', null);
const OUT = argOf('--out', path.join(process.cwd(), 'static', 'mascotes'));
if (!DIR) { console.error('need --dir <folder>'); process.exit(1); }

const OUT_HEIGHT = 620, WEBP_QUALITY = 88;
const POSE_NAMES = ['hero', 'wave', 'jump', 'think', 'sleep', 'cheer', 'point', 'love', 'sit'];

// Fatma: full-body 4×2 sheet. Cells L→R,T→B: 0 wave, 1 jump, 2 think, 3 love,
// 4 point, 5 phone(sit), 6 sleep, 7 sunglasses(cheer). Map each pose name → cell.
const MASCOTS = [
  {
    id: 'fatma', kind: 'sheet', file: '213fcadc-50518.png', cols: 4, rows: 2,
    map: { hero: 0, wave: 0, jump: 1, think: 2, sleep: 6, cheer: 7, point: 4, love: 3, sit: 5 }
  },
  { id: 'rafa', kind: 'single', file: '088f83c7-50527.png' },
  { id: 'hamy', kind: 'single', file: '2da09900-50529.png' }
];

// ── background keying (same algorithm as build-mascots.mjs) ─────────────────
function keyBackground(data, w, h, shadowRule = true) {
  const px = w * h, visited = new Uint8Array(px), queue = new Int32Array(px);
  let qt = 0;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (px - 1) * 4];
  const med = (v) => v.sort((a, b) => a - b)[1];
  const bgR = med(corners.map((o) => data[o])), bgG = med(corners.map((o) => data[o + 1])), bgB = med(corners.map((o) => data[o + 2]));
  const isBg = (o) => {
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    if (dr * dr + dg * dg + db * db < 900) return true;
    if (!shadowRule) return false;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return (mx === 0 ? 0 : (mx - mn) / mx) < 0.14 && mn > 185;
  };
  const seed = [];
  for (let x = 0; x < w; x++) { seed.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed.push(y * w, y * w + w - 1); }
  for (const i of seed) { if (!visited[i]) { visited[i] = 1; if (isBg(i * 4)) queue[qt++] = i; else visited[i] = 2; } }
  let qh = 0, end = qt;
  while (qh < end) {
    const i = queue[qh++]; data[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    const t = (j) => { if (!visited[j]) { visited[j] = 1; if (isBg(j * 4)) queue[end++] = j; else visited[j] = 2; } };
    if (x > 0) t(i - 1); if (x < w - 1) t(i + 1); if (y > 0) t(i - w); if (y < h - 1) t(i + w);
  }
}
function dropEdgeFragments(data, w, h) {
  const px = w * h, label = new Int32Array(px), queue = new Int32Array(px), comps = [];
  let nl = 1;
  for (let s = 0; s < px; s++) {
    if (label[s] || data[s * 4 + 3] <= 8) continue;
    const my = nl++; let qh = 0, qt = 0; queue[qt++] = s; label[s] = my; let edge = false; const mem = [];
    while (qh < qt) { const i = queue[qh++]; mem.push(i); const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      const nb = [i - 1, i + 1, i - w, i + w]; if (x === 0) nb[0] = -1; if (x === w - 1) nb[1] = -1;
      for (const n of nb) { if (n < 0 || n >= px || label[n] || data[n * 4 + 3] <= 8) continue; label[n] = my; queue[qt++] = n; } }
    comps.push({ area: mem.length, edge, mem });
  }
  if (!comps.length) return;
  const mx = Math.max(...comps.map((c) => c.area));
  for (const c of comps) if (c.edge && c.area < mx * 0.12) for (const i of c.mem) data[i * 4 + 3] = 0;
}
function featherAlpha(data, w, h) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue; s += a[yy * w + xx]; n++; }
    data[(y * w + x) * 4 + 3] = Math.round(s / n); }
}
function contentBox(data, w, h, pad = 8) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) return null;
  const l = Math.max(0, minX - pad), t = Math.max(0, minY - pad);
  return { left: l, top: t, width: Math.min(w - 1, maxX + pad) - l + 1, height: Math.min(h - 1, maxY + pad) - t + 1 };
}
async function processBuf(buf, outFile) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  keyBackground(data, info.width, info.height);
  dropEdgeFragments(data, info.width, info.height);
  featherAlpha(data, info.width, info.height);
  const box = contentBox(data, info.width, info.height);
  if (!box) throw new Error('empty ' + outFile);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box).resize({ height: OUT_HEIGHT, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toFile(outFile);
}

async function main() {
  for (const m of MASCOTS) {
    const outDir = path.join(OUT, m.id); fs.mkdirSync(outDir, { recursive: true });
    if (m.kind === 'single') {
      const tmp = path.join(outDir, 'hero.webp');
      await processBuf(fs.readFileSync(path.join(DIR, m.file)), tmp);
      for (const p of POSE_NAMES) if (p !== 'hero') fs.copyFileSync(tmp, path.join(outDir, `${p}.webp`));
    } else {
      const sheet = sharp(fs.readFileSync(path.join(DIR, m.file)));
      const meta = await sheet.metadata();
      const cw = Math.floor(meta.width / m.cols), ch = Math.floor(meta.height / m.rows);
      const cellBuf = {};
      const need = new Set(Object.values(m.map));
      for (const idx of need) { const col = idx % m.cols, row = (idx / m.cols) | 0;
        cellBuf[idx] = await sheet.clone().extract({ left: col * cw, top: row * ch, width: cw, height: ch }).png().toBuffer(); }
      for (const [pose, idx] of Object.entries(m.map)) await processBuf(cellBuf[idx], path.join(outDir, `${pose}.webp`));
    }
    const files = fs.readdirSync(outDir);
    const bytes = files.reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
    console.log(`${m.id}: ${files.length} poses, ${(bytes / 1024).toFixed(0)} KB`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
