// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — "presence with personality"
//
// The Duolingo trick that needs no permissions: the app's own favicon and
// tab title react to the mascot's emotional state (sad pig when the streak
// broke, worried pig in the evening). Plus a once-per-day LOCAL notification
// (Notification API, permission requested only from /definicoes) when the
// streak is at risk in the evening.
// ─────────────────────────────────────────────────────────────────────────────

import type { UpdateSpec } from 'dexie';
import { db } from '$lib/state/db';
import type { SettingsRow } from '$lib/state/db';
import type { MascotEmotion } from './emotion';
import { showAppNotification } from '$lib/habitos/reminders';

type SettingsRowV10n = SettingsRow & { notifStreakEnabled?: boolean };

// ── dynamic favicon ──────────────────────────────────────────────────────────

const FAVICON_ID = 'presuntinho-dynamic-favicon';

const EMOTION_OVERLAYS: Record<MascotEmotion, string | null> = {
	happy: null,
	neutral: null,
	worried: '😰',
	sad: '💧',
	euphoric: '🎉'
};

function faviconSvg(overlay: string | null): string {
	const overlayText = overlay
		? `<text x="70" y="86" font-size="42">${overlay}</text>`
		: '';
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
		`<text x="50" y="72" font-size="72" text-anchor="middle">🐷</text>${overlayText}</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Swap the favicon to match the mascot's emotion (base pig when calm). */
export function applyMascotFavicon(emotion: MascotEmotion): void {
	if (typeof document === 'undefined') return;
	let link = document.getElementById(FAVICON_ID) as HTMLLinkElement | null;
	if (!link) {
		link = document.createElement('link');
		link.id = FAVICON_ID;
		link.rel = 'icon';
		link.type = 'image/svg+xml';
		document.head.appendChild(link);
	}
	link.href = faviconSvg(EMOTION_OVERLAYS[emotion]);
}

// ── title prefix ─────────────────────────────────────────────────────────────

const TITLE_PREFIXES: Record<MascotEmotion, string> = {
	happy: '',
	neutral: '',
	worried: '😰 ',
	sad: '😢 ',
	euphoric: '🎉 '
};

const ALL_PREFIXES = ['😰 ', '😢 ', '🎉 '];

/**
 * Prefix the tab title with the emotion emoji (worried/sad/euphoric).
 * Idempotent — safe to call from an interval and after navigation (route
 * changes rewrite the title via <svelte:head>, dropping the prefix).
 */
export function applyTitlePrefix(emotion: MascotEmotion): void {
	if (typeof document === 'undefined') return;
	let base = document.title;
	for (const p of ALL_PREFIXES) {
		if (base.startsWith(p)) base = base.slice(p.length);
	}
	const next = TITLE_PREFIXES[emotion] + base;
	if (document.title !== next) document.title = next;
}

// ── streak-risk local notification ───────────────────────────────────────────

/** Number of passive-aggressive copy variants available (i18n notif.streak.vN). */
export const STREAK_NOTIF_VARIANTS = 5;

export const STREAK_NOTIF_FALLBACKS: string[] = [
	'🐷 O Presuntinho está a olhar para a chama. Ela está a olhar de volta. Alguém que faça alguma coisa.',
	'🐷 Não é por nada, mas a tua streak apaga-se à meia-noite. Só a avisar. Casualmente.',
	'🐷 Lembras-te de mim? Da app? Dos teus hábitos? Pois. Nós lembramo-nos de ti.',
	'🐷 Dois minutinhos. Uma atividade. É literalmente tudo o que a chama pede.',
	'🐷 O Presuntinho prometeu não dramatizar. O Presuntinho mentiu: A STREAK ESTÁ EM RISCO!'
];

// Capability checks live in $lib/habitos/reminders (single home alongside
// showAppNotification); re-exported here under the historical names.
export { notificationsSupported as isNotifSupported, notificationPermission as notifPermission } from '$lib/habitos/reminders';

export async function readNotifStreakEnabled(): Promise<boolean> {
	if (typeof indexedDB === 'undefined') return false;
	try {
		const row = (await db().settings.get('main')) as SettingsRowV10n | undefined;
		return row?.notifStreakEnabled === true;
	} catch {
		return false;
	}
}

export async function setNotifStreakEnabled(value: boolean): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	try {
		await db().settings.update('main', {
			notifStreakEnabled: value
		} as unknown as UpdateSpec<SettingsRow>);
	} catch (e) {
		console.warn('[presence] notif pref persist failed', e);
	}
}

/** Fire the streak-risk notification (caller handles once-per-day claiming).
 *  Routed through the SW registration so it also fires on installed mobile PWAs,
 *  where the bare `new Notification()` constructor throws. */
export function showStreakRiskNotification(body: string): void {
	void showAppNotification('Presuntinho 🔥', { body, tag: 'presuntinho-streak-risk' });
}
