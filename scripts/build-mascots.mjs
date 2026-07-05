// ─────────────────────────────────────────────────────────────────────────────
// build-mascots.mjs — corta as folhas de poses das mascotes e remove o fundo.
//
// Fontes: renders 1:1 (hero) + folhas 4×2 com 8 poses por mascote, geradas
// fora do repo (ver --src; não são commitadas — só os webp otimizados).
//
// Por imagem:
//   1. flood-fill a partir das 4 margens por píxeis "de fundo" (quase-brancos
//      E dessaturados) → alpha 0. Brancos INTERIORES (corpo da bola de
//      futebol, olhos) ficam intactos porque o fill não atravessa contornos.
//      As sombras suaves originais também saem — a app põe drop-shadow em CSS.
//   2. suavização do recorte (1 passagem de blur 3×3 só no canal alpha).
//   3. crop à bounding box do conteúdo + margem, resize e export webp.
//
// Uso: node scripts/build-mascots.mjs --src <pasta com <id>-hero.png e
//      <id>-sheet.png>  [--out static/mascotes]
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// id = id do catálogo (src/lib/gamification/mascots.ts); src = prefixo dos PNGs fonte.
// shadowRule: false desliga a remoção de sombras dessaturadas — obrigatório na
// bola de futebol, cujo corpo branco seria "comido" pelo fill através do rim.
const MASCOTS = [
	{ id: 'porquinho', src: 'porquinho' },
	{ id: 'coracao', src: 'coracao' },
	{ id: 'perfume', src: 'perfume' },
	{ id: 'gata-anime', src: 'gato' },
	{ id: 'falcao-tunisia', src: 'falcao' },
	{ id: 'moto', src: 'mota' },
	{ id: 'bola-barca', src: 'bola', shadowRule: false }
];
// Ordem das células nas folhas 4×2 (esquerda→direita, cima→baixo).
const POSES = ['wave', 'jump', 'think', 'sleep', 'cheer', 'point', 'love', 'sit'];
const OUT_HEIGHT = 480;
const WEBP_QUALITY = 82;

const args = process.argv.slice(2);
function argOf(flag, fallback) {
	const i = args.indexOf(flag);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const SRC = argOf('--src', null);
const OUT = argOf('--out', path.join(process.cwd(), 'static', 'mascotes'));
if (!SRC) {
	console.error('Uso: node scripts/build-mascots.mjs --src <pasta-fontes> [--out <pasta-destino>]');
	process.exit(1);
}

/** Remove o fundo por flood-fill a partir das margens. Muta `data` (RGBA). */
function keyBackground(data, width, height, shadowRule = true) {
	const px = width * height;
	const visited = new Uint8Array(px);
	const queue = new Int32Array(px);
	let qh = 0;
	let qt = 0;

	// Cor de fundo = mediana dos 4 cantos.
	const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (px - 1) * 4];
	const med = (vals) => vals.sort((a, b) => a - b)[1];
	const bgR = med(corners.map((o) => data[o]));
	const bgG = med(corners.map((o) => data[o + 1]));
	const bgB = med(corners.map((o) => data[o + 2]));

	// Fundo = perto da cor de fundo OU (claro E dessaturado — apanha as
	// sombras suaves originais para a app pôr a sua própria drop-shadow).
	function isBg(o) {
		const r = data[o];
		const g = data[o + 1];
		const b = data[o + 2];
		const dr = r - bgR;
		const dg = g - bgG;
		const db = b - bgB;
		if (dr * dr + dg * dg + db * db < 900) return true; // dist < 30
		if (!shadowRule) return false;
		const mx = Math.max(r, g, b);
		const mn = Math.min(r, g, b);
		const sat = mx === 0 ? 0 : (mx - mn) / mx;
		return sat < 0.14 && mn > 185; // sombra cinzenta clara
	}

	function push(i) {
		if (visited[i]) return;
		visited[i] = 1;
		if (isBg(i * 4)) queue[qt++] = i;
		else visited[i] = 2; // fronteira — fica opaco
	}

	for (let x = 0; x < width; x++) {
		push(x);
		push((height - 1) * width + x);
	}
	for (let y = 0; y < height; y++) {
		push(y * width);
		push(y * width + width - 1);
	}
	// Os push das margens marcaram visited; refazer a fila só com os de fundo.
	qh = 0;
	while (qh < qt) {
		const i = queue[qh++];
		data[i * 4 + 3] = 0;
		const x = i % width;
		const y = (i / width) | 0;
		if (x > 0) push(i - 1);
		if (x < width - 1) push(i + 1);
		if (y > 0) push(i - width);
		if (y < height - 1) push(i + width);
	}
}

/**
 * Remove fragmentos "vazados" das células vizinhas da folha: componentes
 * ligados pequenos (< 15% do maior) que tocam numa borda da imagem.
 * Decorações intencionais (confetti, Zz, faíscas) vivem no interior e ficam.
 */
function dropEdgeFragments(data, width, height) {
	const px = width * height;
	const label = new Int32Array(px); // 0 = por visitar, senão id do componente
	const queue = new Int32Array(px);
	const comps = []; // {area, touchesEdge, pixels:[start,end) na ordem da fila}
	let nextLabel = 1;
	for (let start = 0; start < px; start++) {
		if (label[start] || data[start * 4 + 3] <= 8) continue;
		const myLabel = nextLabel++;
		let qh = 0;
		let qt = 0;
		queue[qt++] = start;
		label[start] = myLabel;
		let touchesEdge = false;
		const from = 0;
		const members = [];
		while (qh < qt) {
			const i = queue[qh++];
			members.push(i);
			const x = i % width;
			const y = (i / width) | 0;
			if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
			const neigh = [i - 1, i + 1, i - width, i + width];
			if (x === 0) neigh[0] = -1;
			if (x === width - 1) neigh[1] = -1;
			for (const n of neigh) {
				if (n < 0 || n >= px || label[n] || data[n * 4 + 3] <= 8) continue;
				label[n] = myLabel;
				queue[qt++] = n;
			}
		}
		comps.push({ area: members.length, touchesEdge, members, from });
	}
	if (!comps.length) return;
	const maxArea = Math.max(...comps.map((c) => c.area));
	for (const c of comps) {
		if (c.touchesEdge && c.area < maxArea * 0.15) {
			for (const i of c.members) data[i * 4 + 3] = 0;
		}
	}
}

/** Uma passagem de box-blur 3×3 só no alpha, para suavizar o recorte. */
function featherAlpha(data, width, height) {
	const alpha = new Uint8Array(width * height);
	for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			let sum = 0;
			let n = 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const yy = y + dy;
					const xx = x + dx;
					if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
					sum += alpha[yy * width + xx];
					n++;
				}
			}
			data[i * 4 + 3] = Math.round(sum / n);
		}
	}
}

/** Bounding box do conteúdo (alpha > 8) com margem. */
function contentBox(data, width, height, pad = 6) {
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 8) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return null;
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(width - 1, maxX + pad);
	maxY = Math.min(height - 1, maxY + pad);
	return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function processImage(inputBuffer, outFile, shadowRule = true) {
	const { data, info } = await sharp(inputBuffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	keyBackground(data, info.width, info.height, shadowRule);
	dropEdgeFragments(data, info.width, info.height);
	featherAlpha(data, info.width, info.height);
	const box = contentBox(data, info.width, info.height);
	if (!box) throw new Error(`sem conteúdo: ${outFile}`);
	await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
		.extract(box)
		.resize({ height: OUT_HEIGHT, withoutEnlargement: true })
		.webp({ quality: WEBP_QUALITY })
		.toFile(outFile);
}

async function main() {
	let totalBytes = 0;
	for (const { id, src, shadowRule = true } of MASCOTS) {
		const outDir = path.join(OUT, id);
		fs.mkdirSync(outDir, { recursive: true });

		const heroSrc = path.join(SRC, `${src}-hero.png`);
		if (fs.existsSync(heroSrc)) {
			await processImage(fs.readFileSync(heroSrc), path.join(outDir, 'hero.webp'), shadowRule);
		}

		const sheetSrc = path.join(SRC, `${src}-sheet.png`);
		if (!fs.existsSync(sheetSrc)) {
			console.warn(`AVISO: falta ${sheetSrc}`);
			continue;
		}
		const sheet = sharp(fs.readFileSync(sheetSrc));
		const meta = await sheet.metadata();
		const cw = Math.floor(meta.width / 4);
		const ch = Math.floor(meta.height / 2);
		for (let p = 0; p < POSES.length; p++) {
			const col = p % 4;
			const row = (p / 4) | 0;
			const cell = await sheet
				.clone()
				.extract({ left: col * cw, top: row * ch, width: cw, height: ch })
				.png()
				.toBuffer();
			await processImage(cell, path.join(outDir, `${POSES[p]}.webp`), shadowRule);
		}

		const files = fs.readdirSync(outDir);
		const bytes = files.reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
		totalBytes += bytes;
		console.log(`${id}: ${files.length} ficheiros, ${(bytes / 1024).toFixed(0)} KB`);
	}
	console.log(`TOTAL: ${(totalBytes / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
