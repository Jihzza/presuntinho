// ─────────────────────────────────────────────────────────────────────────────
// app-logo.ts — ícone da app personalizável (V10.5).
//
// A Fatma escolhe em /definicoes qual dos logos gerados quer como ícone da
// PWA no telemóvel. A escolha vive como campo ADITIVO e não-indexado na
// linha singleton `settings` do Dexie (`appLogo` — mesmo padrão do
// activeMascot, zero schema bump) e é aplicada trocando em runtime:
//   * <link rel="manifest">        → /manifests/logo-<id>.webmanifest
//   * <link rel="apple-touch-icon"> → /logos/<id>/icon-180.png
//
// Realidade das plataformas (explicada no hint da UI):
//   * Android/Chrome: o ícone instalado atualiza sozinho pouco depois de a
//     app ser aberta com o manifest novo (verificação de update do Chrome).
//   * iOS/Safari: o ícone é fixado ao adicionar ao ecrã inicial — para mudar
//     é preciso remover e voltar a adicionar.
//
// Assets + manifests gerados por scripts/build-logos.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import type { UpdateSpec } from 'dexie';
import { db } from '$lib/state/db';
import type { SettingsRow } from '$lib/state/db';

/** 'classico' = ícone original de static/icons/ (manifest base). */
export const APP_LOGOS = [
	'classico',
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
] as const;

export type AppLogoId = (typeof APP_LOGOS)[number];

export const DEFAULT_APP_LOGO: AppLogoId = 'classico';

/** Evento de janela disparado quando o logo ativo muda. */
export const APP_LOGO_CHANGED_EVENT = 'presuntinho:app-logo-changed';

/**
 * Espelho em localStorage (padrão do 'fat-theme'): o fetcher de updates do
 * Chrome/WebAPK lê o <link rel="manifest"> no fim do page-load e NÃO volta a
 * ler se o href mudar depois — trocar só no onMount (depois do Dexie abrir)
 * perdia essa corrida e o ícone escolhido podia nunca aplicar, ou até
 * reverter um ícone já instalado. O script inline em app.html lê esta chave
 * e troca os links ANTES do primeiro paint; o Dexie continua a ser a fonte
 * de verdade e o espelho cura-se em applyAppLogo.
 */
export const APP_LOGO_LS_KEY = 'fat-app-logo';

type SettingsRowV10_5 = SettingsRow & { appLogo?: string };

export function isAppLogoId(id: string | undefined): id is AppLogoId {
	return typeof id === 'string' && (APP_LOGOS as readonly string[]).includes(id);
}

/** Miniatura para o seletor em /definicoes. */
export function appLogoPreview(id: AppLogoId): string {
	return id === 'classico' ? '/icons/icon-192.png' : `/logos/${id}/preview.webp`;
}

export function appLogoManifest(id: AppLogoId): string {
	return id === 'classico' ? '/manifest.webmanifest' : `/manifests/logo-${id}.webmanifest`;
}

export function appLogoTouchIcon(id: AppLogoId): string {
	return id === 'classico' ? '/apple-touch-icon.png' : `/logos/${id}/icon-180.png`;
}

/** Logo guardado (ids desconhecidos/legados caem no clássico). */
export async function getAppLogo(): Promise<AppLogoId> {
	if (typeof indexedDB === 'undefined') return DEFAULT_APP_LOGO;
	try {
		const row = (await db().settings.get('main')) as SettingsRowV10_5 | undefined;
		return isAppLogoId(row?.appLogo) ? row.appLogo : DEFAULT_APP_LOGO;
	} catch (err) {
		console.warn('[app-logo] read failed (non-fatal):', err);
		return DEFAULT_APP_LOGO;
	}
}

/**
 * Troca os <link> do documento para o logo pedido. Idempotente e segura em
 * SSR (no-op sem document). Chamada no arranque (+layout) e ao escolher.
 */
export function applyAppLogo(id: AppLogoId): void {
	if (typeof document === 'undefined') return;
	try {
		localStorage.setItem(APP_LOGO_LS_KEY, id);
	} catch {
		// localStorage indisponível — fica só a troca tardia dos links.
	}
	const manifest = document.querySelector('link[rel="manifest"]');
	if (manifest instanceof HTMLLinkElement) {
		const target = appLogoManifest(id);
		// O build injeta ?v=<build-id> no href base — preservar o default.
		if (id !== 'classico') manifest.href = target;
		else if (!manifest.href.includes('/manifest.webmanifest')) manifest.href = target;
	}
	const touch = document.querySelector('link[rel="apple-touch-icon"]');
	if (touch instanceof HTMLLinkElement) {
		touch.href = appLogoTouchIcon(id);
	}
}

/** Persiste + aplica + notifica. */
export async function setAppLogo(id: AppLogoId): Promise<void> {
	if (!isAppLogoId(id) || typeof indexedDB === 'undefined') return;
	await db().settings.update('main', { appLogo: id } as unknown as UpdateSpec<SettingsRow>);
	applyAppLogo(id);
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(APP_LOGO_CHANGED_EVENT, { detail: { id } }));
	}
}
