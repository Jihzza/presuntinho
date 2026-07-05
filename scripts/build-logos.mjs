// ─────────────────────────────────────────────────────────────────────────────
// build-logos.mjs — gera os ícones de app alternativos + manifests por logo.
//
// Fontes: PNGs quadrados ~1240px (fora do repo, ver --src) com o nome
// <id>.png. Para cada logo:
//   1. se os CANTOS forem enchimento (quase-branco ou preto puro), corta à
//      bounding box quadrada da arte — os designs full-bleed ficam intactos;
//   2. exporta static/logos/<id>/{icon-512.png, icon-192.png, icon-180.png,
//      preview.webp};
//   3. gera static/manifests/logo-<id>.webmanifest — cópia do manifest base
//      com o array `icons` a apontar para os PNGs do logo (any + maskable).
//
// A troca em runtime (link rel=manifest + apple-touch-icon) vive em
// src/lib/app-logo.ts; o Android atualiza o ícone instalado depois de a app
// ser aberta com o manifest novo, o iOS exige re-adicionar ao ecrã inicial.
//
// Uso: node scripts/build-logos.mjs --src <pasta com <id>.png>
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const APP_LOGO_IDS = [
	'sombra',
	'brilho',
	'gema',
	'abraco',
	'autocolante',
	'missoes',
	'neon',
	'docinho',
	'risinho',
	'cristal',
	'conversa',
	'lacinho',
	'planinho',
	'amorzinho'
];

const args = process.argv.slice(2);
function argOf(flag, fallback) {
	const i = args.indexOf(flag);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const SRC = argOf('--src', null);
const ROOT = process.cwd();
if (!SRC) {
	console.error('Uso: node scripts/build-logos.mjs --src <pasta-fontes>');
	process.exit(1);
}

/** Corta ao quadrado da arte quando os cantos são enchimento branco/preto. */
async function cropToArtwork(inputBuffer) {
	const img = sharp(inputBuffer);
	const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
	const ch = info.channels;
	const px = (x, y) => {
		const o = (y * info.width + x) * ch;
		return [data[o], data[o + 1], data[o + 2]];
	};
	const corners = [
		px(2, 2),
		px(info.width - 3, 2),
		px(2, info.height - 3),
		px(info.width - 3, info.height - 3)
	];
	const med = (i) => corners.map((c) => c[i]).sort((a, b) => a - b)[1];
	const bg = [med(0), med(1), med(2)];
	const lum = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000;
	const isPadding = lum > 240 || lum < 12; // branco ou preto puro = moldura a remover
	if (!isPadding) return inputBuffer; // design full-bleed — não tocar

	let minX = info.width;
	let minY = info.height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < info.height; y++) {
		for (let x = 0; x < info.width; x++) {
			const o = (y * info.width + x) * ch;
			const dr = data[o] - bg[0];
			const dg = data[o + 1] - bg[1];
			const db = data[o + 2] - bg[2];
			if (dr * dr + dg * dg + db * db > 2025) { // dist > 45
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return inputBuffer;
	// Quadrado centrado na bbox, limitado à imagem.
	const w = maxX - minX + 1;
	const h = maxY - minY + 1;
	const side = Math.min(Math.max(w, h), info.width, info.height);
	let left = Math.round(minX + w / 2 - side / 2);
	let top = Math.round(minY + h / 2 - side / 2);
	left = Math.max(0, Math.min(left, info.width - side));
	top = Math.max(0, Math.min(top, info.height - side));
	return sharp(inputBuffer).extract({ left, top, width: side, height: side }).png().toBuffer();
}

async function main() {
	const baseManifest = JSON.parse(
		fs.readFileSync(path.join(ROOT, 'static', 'manifest.webmanifest'), 'utf8')
	);
	const manifestsDir = path.join(ROOT, 'static', 'manifests');
	fs.mkdirSync(manifestsDir, { recursive: true });

	let totalBytes = 0;
	for (const id of APP_LOGO_IDS) {
		const srcFile = path.join(SRC, `${id}.png`);
		if (!fs.existsSync(srcFile)) {
			console.warn(`AVISO: falta ${srcFile}`);
			continue;
		}
		const outDir = path.join(ROOT, 'static', 'logos', id);
		fs.mkdirSync(outDir, { recursive: true });
		const cropped = await cropToArtwork(fs.readFileSync(srcFile));

		for (const [size, name] of [
			[512, 'icon-512.png'],
			[192, 'icon-192.png'],
			[180, 'icon-180.png']
		]) {
			await sharp(cropped)
				.resize(size, size, { fit: 'cover' })
				.png({ palette: true, quality: 90, compressionLevel: 9 })
				.toFile(path.join(outDir, name));
		}
		await sharp(cropped)
			.resize(160, 160, { fit: 'cover' })
			.webp({ quality: 82 })
			.toFile(path.join(outDir, 'preview.webp'));

		const manifest = {
			...baseManifest,
			icons: [
				{ src: `/logos/${id}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: `/logos/${id}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
				{ src: `/logos/${id}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
				{ src: `/logos/${id}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
			]
		};
		fs.writeFileSync(
			path.join(manifestsDir, `logo-${id}.webmanifest`),
			JSON.stringify(manifest, null, 2) + '\n',
			'utf8'
		);

		const bytes = fs
			.readdirSync(outDir)
			.reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
		totalBytes += bytes;
		console.log(`${id}: ${(bytes / 1024).toFixed(0)} KB`);
	}
	console.log(`TOTAL: ${(totalBytes / 1024).toFixed(0)} KB + ${APP_LOGO_IDS.length} manifests`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
