// build-family-mascots.mjs — the 3 "special" family mascots (Fatma, Rafa, Hamy
// the cat) sliced from the ANIME master sheet's per-character panels. Each panel
// is a 3×2 grid of 6 poses; we map those onto the 9 mascot pose names (reusing
// the closest cell for names the source doesn't cover) and reuse the exact
// background-keying pipeline from build-mascots.mjs so the look matches.
//
// Source is NOT committed (the raw upload); only the optimized webp outputs are.
// Usage: node scripts/build-family-mascots.mjs --src <master.png> [--out static/mascotes]

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SRC = argOf('--src', null);
const OUT = argOf('--out', path.join(process.cwd(), 'static', 'mascotes'));
if (!SRC) { console.error('need --src <master png>'); process.exit(1); }

const OUT_HEIGHT = 480, WEBP_QUALITY = 82;

// Panel boxes in the 1536×1024 master (top row: Fatma, Eu, Gato).
const PANELS = {
  fatma: { left: 12, top: 40, width: 366, height: 378, cols: 3, rows: 2 },
  rafa:  { left: 390, top: 40, width: 366, height: 378, cols: 3, rows: 2 },
  hamy:  { left: 768, top: 40, width: 378, height: 378, cols: 3, rows: 2 }
};
// 9 mascot pose names → source cell index (0..5, L→R top→bottom).
const POSE_MAP = {
  fatma: { hero: 4, wave: 0, jump: 2, think: 5, sleep: 3, cheer: 4, point: 1, love: 5, sit: 3 },
  rafa:  { hero: 0, wave: 2, jump: 2, think: 4, sleep: 1, cheer: 2, point: 5, love: 1, sit: 3 },
  hamy:  { hero: 0, wave: 3, jump: 2, think: 0, sleep: 1, cheer: 2, point: 4, love: 5, sit: 0 }
};

// ── background keying (verbatim from build-mascots.mjs) ─────────────────────
function keyBackground(data, width, height, shadowRule = true) {
  const px = width * height;
  const visited = new Uint8Array(px), queue = new Int32Array(px);
  let qt = 0;
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (px - 1) * 4];
  const med = (v) => v.sort((a, b) => a - b)[1];
  const bgR = med(corners.map((o) => data[o])), bgG = med(corners.map((o) => data[o + 1])), bgB = med(corners.map((o) => data[o + 2]));
  function isBg(o) {
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    if (dr * dr + dg * dg + db * db < 900) return true;
    if (!shadowRule) return false;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    return sat < 0.14 && mn > 185;
  }
  function push(i) { if (visited[i]) return; visited[i] = 1; if (isBg(i * 4)) queue[qt++] = i; else visited[i] = 2; }
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  let qh = 0; qt = qt;
  // rebuild queue from bg-only margin seeds
  qh = 0; let end = qt;
  while (qh < end) {
    const i = queue[qh++]; data[i * 4 + 3] = 0;
    const x = i % width, y = (i / width) | 0;
    const tryp = (j) => { if (!visited[j]) { visited[j] = 1; if (isBg(j * 4)) { queue[end++] = j; } else visited[j] = 2; } };
    if (x > 0) tryp(i - 1); if (x < width - 1) tryp(i + 1); if (y > 0) tryp(i - width); if (y < height - 1) tryp(i + width);
  }
}
function dropEdgeFragments(data, width, height) {
  const px = width * height, label = new Int32Array(px), queue = new Int32Array(px), comps = [];
  let nextLabel = 1;
  for (let start = 0; start < px; start++) {
    if (label[start] || data[start * 4 + 3] <= 8) continue;
    const my = nextLabel++; let qh = 0, qt = 0; queue[qt++] = start; label[start] = my; let edge = false; const mem = [];
    while (qh < qt) { const i = queue[qh++]; mem.push(i); const x = i % width, y = (i / width) | 0;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
      const neigh = [i - 1, i + 1, i - width, i + width]; if (x === 0) neigh[0] = -1; if (x === width - 1) neigh[1] = -1;
      for (const n of neigh) { if (n < 0 || n >= px || label[n] || data[n * 4 + 3] <= 8) continue; label[n] = my; queue[qt++] = n; } }
    comps.push({ area: mem.length, edge, mem });
  }
  if (!comps.length) return;
  const maxA = Math.max(...comps.map((c) => c.area));
  for (const c of comps) if (c.edge && c.area < maxA * 0.15) for (const i of c.mem) data[i * 4 + 3] = 0;
}
function featherAlpha(data, width, height) {
  const a = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) a[i] = data[i * 4 + 3];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue; s += a[yy * width + xx]; n++; }
    data[(y * width + x) * 4 + 3] = Math.round(s / n);
  }
}
function contentBox(data, width, height, pad = 6) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) return null;
  return { left: Math.max(0, minX - pad), top: Math.max(0, minY - pad), width: Math.min(width - 1, maxX + pad) - Math.max(0, minX - pad) + 1, height: Math.min(height - 1, maxY + pad) - Math.max(0, minY - pad) + 1 };
}
async function processCell(buf, outFile) {
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
  const master = sharp(fs.readFileSync(SRC));
  for (const [id, panel] of Object.entries(PANELS)) {
    const outDir = path.join(OUT, id); fs.mkdirSync(outDir, { recursive: true });
    const cw = Math.floor(panel.width / panel.cols), ch = Math.floor(panel.height / panel.rows);
    // Pre-slice the 6 cells once.
    const cells = [];
    for (let r = 0; r < panel.rows; r++) for (let c = 0; c < panel.cols; c++) {
      const cell = await master.clone().extract({ left: panel.left + c * cw, top: panel.top + r * ch, width: cw, height: ch }).png().toBuffer();
      cells.push(cell);
    }
    for (const [pose, idx] of Object.entries(POSE_MAP[id])) {
      await processCell(cells[idx], path.join(outDir, `${pose}.webp`));
    }
    const files = fs.readdirSync(outDir);
    const bytes = files.reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
    console.log(`${id}: ${files.length} poses, ${(bytes / 1024).toFixed(0)} KB`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
