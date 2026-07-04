// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — synthesized sound effects + haptics (no audio files)
//
// All tones are generated with the Web Audio API so the PWA ships zero mp3s.
// Preferences live as additive, non-indexed fields on the Dexie `settings`
// row (same convention as `activeMascot`) — no schema bump required:
//   soundEnabled?: boolean    (default: on, unless prefers-reduced-motion)
//   hapticsEnabled?: boolean  (default: on)
// ─────────────────────────────────────────────────────────────────────────────

import type { UpdateSpec } from 'dexie';
import { db } from '$lib/state/db';
import type { SettingsRow } from '$lib/state/db';
import { prefersReducedMotion } from '$lib/components/events';

type SettingsRowV10 = SettingsRow & {
	soundEnabled?: boolean;
	hapticsEnabled?: boolean;
};

export const SOUND_PREFS_EVENT = 'presuntinho:sound-changed';

export type SfxName =
	| 'correct'
	| 'wrong'
	| 'fanfare'
	| 'levelup'
	| 'whoosh'
	| 'ding'
	| 'chest'
	| 'milestone'
	| 'send';

export type HapticKind = 'tap' | 'success' | 'warning';

const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
	tap: 10,
	success: [40, 30, 40],
	warning: [15, 40, 15]
};

// ── preference cache ─────────────────────────────────────────────────────────

interface SoundPrefs {
	sound: boolean;
	haptics: boolean;
}

let prefs: SoundPrefs | null = null;
let hydrating: Promise<SoundPrefs> | null = null;

function defaultPrefs(): SoundPrefs {
	return { sound: !prefersReducedMotion(), haptics: true };
}

/**
 * Drop the cached prefs so the next read re-hydrates from Dexie. Called on
 * logout — the next login may be a different profile with its own DB.
 */
export function resetSoundPrefsCache(): void {
	prefs = null;
	hydrating = null;
}

/** Load persisted prefs into the module cache (idempotent, SSR-safe). */
export async function initSoundPrefs(): Promise<SoundPrefs> {
	if (prefs) return prefs;
	if (hydrating) return hydrating;
	hydrating = (async () => {
		const next = defaultPrefs();
		if (typeof indexedDB !== 'undefined') {
			try {
				const row = (await db().settings.get('main')) as SettingsRowV10 | undefined;
				if (typeof row?.soundEnabled === 'boolean') next.sound = row.soundEnabled;
				if (typeof row?.hapticsEnabled === 'boolean') next.haptics = row.hapticsEnabled;
			} catch (e) {
				console.warn('[sound] prefs hydration failed (using defaults):', e);
			}
		}
		prefs = next;
		return next;
	})();
	return hydrating;
}

export function isSoundEnabled(): boolean {
	return (prefs ?? defaultPrefs()).sound;
}

export function isHapticsEnabled(): boolean {
	return (prefs ?? defaultPrefs()).haptics;
}

async function persistPref(patch: Partial<Pick<SettingsRowV10, 'soundEnabled' | 'hapticsEnabled'>>): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	try {
		await db().settings.update('main', patch as unknown as UpdateSpec<SettingsRow>);
	} catch (e) {
		console.warn('[sound] failed to persist sound prefs:', e);
	}
}

export async function setSoundEnabled(value: boolean): Promise<void> {
	prefs = { ...(prefs ?? defaultPrefs()), sound: value };
	await persistPref({ soundEnabled: value });
	dispatchPrefsEvent();
	if (value) playSfx('ding'); // audible confirmation the toggle works
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
	prefs = { ...(prefs ?? defaultPrefs()), haptics: value };
	await persistPref({ hapticsEnabled: value });
	dispatchPrefsEvent();
	if (value) vibrate('tap');
}

function dispatchPrefsEvent(): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent(SOUND_PREFS_EVENT, {
			detail: { sound: isSoundEnabled(), haptics: isHapticsEnabled() }
		})
	);
}

// ── haptics ──────────────────────────────────────────────────────────────────

export function vibrate(kind: HapticKind): void {
	if (typeof navigator === 'undefined') return;
	if (!isHapticsEnabled()) return;
	try {
		navigator.vibrate?.(HAPTIC_PATTERNS[kind]);
	} catch {
		// Vibration unsupported — silently ignore.
	}
}

// ── synth engine ─────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	if (!ctx) {
		try {
			ctx = new Ctor();
		} catch {
			return null;
		}
	}
	if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
	return ctx;
}

const MASTER_GAIN = 0.18;

interface NoteSpec {
	/** Frequency in Hz. */
	freq: number;
	/** Offset from the sound start, seconds. */
	at: number;
	/** Note length, seconds. */
	dur: number;
	type?: OscillatorType;
	gain?: number;
	/** Optional frequency glide target (Hz) across the note. */
	glideTo?: number;
}

function playNotes(notes: NoteSpec[]): void {
	const ac = audioCtx();
	if (!ac) return;
	const t0 = ac.currentTime + 0.01;
	for (const n of notes) {
		const osc = ac.createOscillator();
		const gain = ac.createGain();
		osc.type = n.type ?? 'sine';
		osc.frequency.setValueAtTime(n.freq, t0 + n.at);
		if (n.glideTo) {
			osc.frequency.exponentialRampToValueAtTime(Math.max(1, n.glideTo), t0 + n.at + n.dur);
		}
		const peak = MASTER_GAIN * (n.gain ?? 1);
		gain.gain.setValueAtTime(0, t0 + n.at);
		gain.gain.linearRampToValueAtTime(peak, t0 + n.at + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
		osc.connect(gain).connect(ac.destination);
		osc.start(t0 + n.at);
		osc.stop(t0 + n.at + n.dur + 0.02);
	}
}

/** Short filtered-noise sweep for the streak-flame "whoosh". */
function playWhooshNoise(): void {
	const ac = audioCtx();
	if (!ac) return;
	const dur = 0.42;
	const frames = Math.ceil(ac.sampleRate * dur);
	const buffer = ac.createBuffer(1, frames, ac.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
	const src = ac.createBufferSource();
	src.buffer = buffer;
	const filter = ac.createBiquadFilter();
	filter.type = 'bandpass';
	filter.Q.value = 1.1;
	const t0 = ac.currentTime + 0.01;
	filter.frequency.setValueAtTime(220, t0);
	filter.frequency.exponentialRampToValueAtTime(2400, t0 + dur * 0.7);
	const gain = ac.createGain();
	gain.gain.setValueAtTime(0, t0);
	gain.gain.linearRampToValueAtTime(MASTER_GAIN * 0.9, t0 + 0.05);
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
	src.connect(filter).connect(gain).connect(ac.destination);
	src.start(t0);
	src.stop(t0 + dur + 0.02);
}

// ── combo pitch escalation ───────────────────────────────────────────────────

const COMBO_RESET_MS = 30_000;
const COMBO_MAX = 10;
let comboCount = 0;
let comboLastAt = 0;

/** Consecutive rewards within 30s raise the "correct" chime by a semitone each. */
export function registerComboHit(): number {
	const now = Date.now();
	comboCount = now - comboLastAt <= COMBO_RESET_MS ? Math.min(comboCount + 1, COMBO_MAX) : 1;
	comboLastAt = now;
	return comboCount;
}

export function resetCombo(): void {
	comboCount = 0;
	comboLastAt = 0;
}

function comboPitchFactor(): number {
	return Math.pow(2, Math.max(0, comboCount - 1) / 12);
}

// ── public SFX API ───────────────────────────────────────────────────────────

export function playSfx(name: SfxName): void {
	if (!isSoundEnabled()) return;
	const p = comboPitchFactor();
	switch (name) {
		case 'correct':
			// Bright ascending two-note chime; pitch rises with the combo.
			playNotes([
				{ freq: 660 * p, at: 0, dur: 0.11, type: 'triangle' },
				{ freq: 880 * p, at: 0.09, dur: 0.16, type: 'triangle' }
			]);
			break;
		case 'wrong':
			// Deliberately soft, never punishing.
			playNotes([{ freq: 180, at: 0, dur: 0.22, type: 'sine', glideTo: 110, gain: 0.8 }]);
			break;
		case 'fanfare':
			// Triumphant 3-note major arpeggio (C5–E5–G5).
			playNotes([
				{ freq: 523.25, at: 0, dur: 0.14, type: 'triangle' },
				{ freq: 659.25, at: 0.12, dur: 0.14, type: 'triangle' },
				{ freq: 783.99, at: 0.24, dur: 0.34, type: 'triangle', gain: 1.15 }
			]);
			break;
		case 'levelup':
			// Bigger 4-note rise capped with an octave (C5–E5–G5–C6).
			playNotes([
				{ freq: 523.25, at: 0, dur: 0.12, type: 'triangle' },
				{ freq: 659.25, at: 0.1, dur: 0.12, type: 'triangle' },
				{ freq: 783.99, at: 0.2, dur: 0.12, type: 'triangle' },
				{ freq: 1046.5, at: 0.3, dur: 0.42, type: 'triangle', gain: 1.2 }
			]);
			break;
		case 'whoosh':
			playWhooshNoise();
			break;
		case 'ding':
			playNotes([{ freq: 987.77, at: 0, dur: 0.24, type: 'sine', gain: 0.9 }]);
			break;
		case 'chest':
			// Rattle then sparkle.
			playNotes([
				{ freq: 196, at: 0, dur: 0.08, type: 'square', gain: 0.45 },
				{ freq: 196, at: 0.1, dur: 0.08, type: 'square', gain: 0.45 },
				{ freq: 1318.5, at: 0.26, dur: 0.2, type: 'triangle' },
				{ freq: 1760, at: 0.38, dur: 0.28, type: 'triangle', gain: 1.1 }
			]);
			break;
		case 'send':
			// Quick upward swish for an outgoing chat message.
			playNotes([{ freq: 520, at: 0, dur: 0.13, type: 'sine', glideTo: 880, gain: 0.7 }]);
			break;
		case 'milestone':
			// Warm rising fifth + octave shimmer for streak milestones.
			playNotes([
				{ freq: 440, at: 0, dur: 0.16, type: 'triangle' },
				{ freq: 660, at: 0.14, dur: 0.18, type: 'triangle' },
				{ freq: 880, at: 0.3, dur: 0.4, type: 'sine', gain: 1.1 }
			]);
			break;
	}
}
