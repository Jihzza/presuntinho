// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho Secret Arcade — procedural 8-bit / chiptune music engine
//
// Zero audio assets: every note is synthesized live with the Web Audio API and
// mixed through the SAME AudioContext as the SFX (src/lib/gamification/sound.ts),
// so there is a single output and one gesture-unlock. A lookahead scheduler (the
// classic "A Tale of Two Clocks" pattern) keeps timing tight while creating only
// a couple of dozen short-lived oscillators per second — cheap even on a phone.
//
// Rules honoured:
//   • Never plays unless the GLOBAL sound setting is on (isSoundEnabled) — and it
//     stops immediately when the user turns sound off (SOUND_PREFS_EVENT).
//   • A persisted per-user music toggle (additive `arcadeMusicEnabled` field on
//     the Dexie settings row — same pattern as soundEnabled, no schema bump) lets
//     a player silence the music while keeping SFX.
//   • Autoplay policy: the AudioContext only resumes inside a user gesture, so
//     callers start music from a tap (lobby coin button / pressing "play").
//   • Music pauses when the tab is hidden and resumes when it returns.
// ─────────────────────────────────────────────────────────────────────────────

import type { UpdateSpec } from 'dexie';
import { db } from '$lib/state/db';
import type { SettingsRow } from '$lib/state/db';
import { getAudioContext, isSoundEnabled, SOUND_PREFS_EVENT } from '$lib/gamification/sound';

type SettingsRowMusic = SettingsRow & { arcadeMusicEnabled?: boolean };

export type ArcadeMusicTheme =
  | 'lobby'
  | 'snake'
  | 'maze'
  | 'racing'
  | 'platformer'
  | 'breakout'
  | 'pong';

// ── note helpers ─────────────────────────────────────────────────────────────

const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11
};

/** 'C4' | 'F#5' → MIDI number. Falls back to middle C on a typo. */
function midi(note: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!match) return 60;
  const [, name, oct] = match;
  return 12 * (Number(oct) + 1) + NOTE_INDEX[name];
}

/** MIDI → frequency (Hz), A4 = 440. */
function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Parse a compact pattern string into per-step MIDI notes. Tokens are
 * space-separated; `_` or `.` is a rest. e.g. `seq('C4 E4 _ G4')`.
 */
function seq(pattern: string): (number | null)[] {
  return pattern
    .trim()
    .split(/\s+/)
    .map((tok) => (tok === '_' || tok === '.' ? null : midi(tok)));
}

// ── theme model ──────────────────────────────────────────────────────────────

interface Track {
  wave: OscillatorType;
  /** Relative loudness (0..1) within the music mix. */
  gain: number;
  /** Per-step MIDI notes; may be shorter than the loop and phase against it. */
  steps: (number | null)[];
  /** Note length as a fraction of one step (short = plucky, long = pad). */
  gate?: number;
}

interface Theme {
  bpm: number;
  /** Steps per beat (4 = sixteenth-notes). */
  stepsPerBeat: number;
  tracks: Track[];
}

// Each theme has a bass, a lead melody and a fast arpeggio; distinct tempo, key
// and mood per machine so the room feels like a real arcade of different games.
const THEMES: Record<ArcadeMusicTheme, Theme> = {
  // Bright, welcoming C-major shuffle — "insert coin".
  lobby: {
    bpm: 122,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'triangle', gain: 0.55, gate: 0.9, steps: seq('C2 _ G2 _ A2 _ E2 _ F2 _ C2 _ G2 _ G2 B2') },
      { wave: 'square', gain: 0.32, gate: 0.55, steps: seq('E4 G4 C5 _ A4 G4 E4 _ F4 A4 C5 _ G4 _ E4 D4') },
      { wave: 'triangle', gain: 0.18, gate: 0.4, steps: seq('C4 E4 G4 C5 A3 C4 E4 A4 F3 A3 C4 F4 G3 B3 D4 G4') }
    ]
  },
  // Playful green pentatonic bounce.
  snake: {
    bpm: 132,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'triangle', gain: 0.55, gate: 0.85, steps: seq('G2 _ G2 D3 E3 _ D3 _ C3 _ C3 G3 D3 _ D3 _') },
      { wave: 'square', gain: 0.3, gate: 0.5, steps: seq('G4 A4 D5 _ E5 D5 A4 _ C5 A4 G4 _ D5 _ E5 _') },
      { wave: 'square', gain: 0.14, gate: 0.35, steps: seq('D4 G4 A4 D5 D4 G4 A4 D5') }
    ]
  },
  // Mysterious A-minor maze crawl.
  maze: {
    bpm: 104,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'triangle', gain: 0.5, gate: 0.95, steps: seq('A2 _ _ E3 F2 _ _ C3 D2 _ _ A2 E2 _ E2 _') },
      { wave: 'square', gain: 0.28, gate: 0.6, steps: seq('A4 _ C5 B4 _ A4 _ E4 F4 _ A4 G4 _ E4 _ _') },
      { wave: 'triangle', gain: 0.13, gate: 0.3, steps: seq('A3 C4 E4 A3 F3 A3 C4 F3') }
    ]
  },
  // Fast, driving blue race.
  racing: {
    bpm: 150,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'square', gain: 0.5, gate: 0.5, steps: seq('E2 E2 E3 E2 E2 E2 E3 E2 D2 D2 D3 D2 G2 G2 G3 G2') },
      { wave: 'square', gain: 0.3, gate: 0.45, steps: seq('B4 _ E5 _ D5 B4 _ A4 B4 _ D5 _ E5 _ G5 _') },
      { wave: 'triangle', gain: 0.15, gate: 0.3, steps: seq('E4 G4 B4 E5 E4 G4 B4 E5 D4 G4 B4 D5 D4 G4 B4 D5') }
    ]
  },
  // Bouncy, sunny platformer.
  platformer: {
    bpm: 138,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'triangle', gain: 0.52, gate: 0.8, steps: seq('C3 _ G2 _ F2 _ G2 _ A2 _ E2 _ F2 _ G2 _') },
      { wave: 'square', gain: 0.3, gate: 0.5, steps: seq('G4 C5 E5 C5 F4 A4 C5 A4 A4 C5 E5 _ G4 B4 D5 _') },
      { wave: 'square', gain: 0.13, gate: 0.3, steps: seq('C4 E4 G4 C5 F4 A4 C5 F5') }
    ]
  },
  // Bright crystalline breakout.
  breakout: {
    bpm: 128,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'triangle', gain: 0.5, gate: 0.85, steps: seq('D3 _ A2 _ B2 _ F#3 _ G2 _ D3 _ A2 _ A2 _') },
      { wave: 'square', gain: 0.3, gate: 0.5, steps: seq('D5 _ F#5 A5 _ F#5 D5 _ B4 _ D5 F#5 _ A5 _ _') },
      { wave: 'triangle', gain: 0.14, gate: 0.3, steps: seq('D4 F#4 A4 D5 D4 F#4 A4 D5 G3 B3 D4 G4 A3 C#4 E4 A4') }
    ]
  },
  // Retro pink duel — syncopated.
  pong: {
    bpm: 118,
    stepsPerBeat: 4,
    tracks: [
      { wave: 'square', gain: 0.48, gate: 0.5, steps: seq('A2 _ A2 _ _ A2 _ E2 D3 _ D3 _ _ D3 _ E2') },
      { wave: 'square', gain: 0.28, gate: 0.45, steps: seq('E5 _ _ C5 _ E5 _ A4 D5 _ _ B4 _ D5 _ _') },
      { wave: 'triangle', gain: 0.13, gate: 0.3, steps: seq('A3 C4 E4 A4 D4 F4 A4 D5') }
    ]
  }
};

// ── engine state ─────────────────────────────────────────────────────────────

const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.12; // seconds of audio scheduled per wake
const MUSIC_MASTER = 0.5; // headroom under the SFX so music sits underneath

let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextTime = 0;
let current: ArcadeMusicTheme | null = null;
let enabled = true; // persisted per-user music toggle (SFX are independent)
let hydrated = false;
let wired = false;

function ensureMaster(ac: AudioContext): GainNode {
  if (!master) {
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
  }
  return master;
}

function scheduleStep(theme: Theme, atStep: number, when: number, ac: AudioContext): void {
  const secondsPerStep = 60 / (theme.bpm * theme.stepsPerBeat);
  const bus = ensureMaster(ac);
  for (const track of theme.tracks) {
    const note = track.steps[atStep % track.steps.length];
    if (note == null) continue;
    const dur = secondsPerStep * (track.gate ?? 0.6);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = track.wave;
    osc.frequency.setValueAtTime(mtof(note), when);
    const peak = track.gain;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain).connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }
}

function scheduler(): void {
  const ac = getAudioContext();
  if (!ac || current == null) return;
  const theme = THEMES[current];
  while (nextTime < ac.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(theme, step, nextTime, ac);
    nextTime += 60 / (theme.bpm * theme.stepsPerBeat);
    step += 1;
  }
}

function wireOnce(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  // If the user turns global sound off, the music must go quiet at once; when
  // they turn it back on (and a theme is active) it resumes on its own.
  window.addEventListener(SOUND_PREFS_EVENT, () => {
    if (!isSoundEnabled()) stopScheduler();
    else if (enabled && current) startScheduler();
  });
  // Don't keep looping into a hidden tab; pick it back up on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScheduler();
    else if (enabled && current && isSoundEnabled()) startScheduler();
  });
}

function startScheduler(): void {
  const ac = getAudioContext();
  if (!ac || current == null || timer != null) return;
  const bus = ensureMaster(ac);
  // Fade in so it never clicks on.
  bus.gain.cancelScheduledValues(ac.currentTime);
  bus.gain.setValueAtTime(bus.gain.value, ac.currentTime);
  bus.gain.linearRampToValueAtTime(MUSIC_MASTER, ac.currentTime + 0.35);
  step = 0;
  nextTime = ac.currentTime + 0.06;
  timer = setInterval(scheduler, LOOKAHEAD_MS);
}

function stopScheduler(): void {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
  const ac = getAudioContext();
  if (ac && master) {
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setValueAtTime(master.gain.value, ac.currentTime);
    master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.18);
  }
}

// ── preference (persisted, additive settings field) ──────────────────────────

/** Hydrate the persisted music toggle from Dexie (idempotent, SSR-safe). */
export async function initArcadeMusicPrefs(): Promise<void> {
  if (hydrated || typeof indexedDB === 'undefined') return;
  try {
    const row = (await db().settings.get('main')) as SettingsRowMusic | undefined;
    if (typeof row?.arcadeMusicEnabled === 'boolean') enabled = row.arcadeMusicEnabled;
  } catch (e) {
    console.warn('[arcade-audio] prefs hydration failed (using default on):', e);
  }
  hydrated = true;
}

async function persistEnabled(value: boolean): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await db().settings.update('main', { arcadeMusicEnabled: value } as unknown as UpdateSpec<SettingsRow>);
  } catch (e) {
    console.warn('[arcade-audio] failed to persist music pref:', e);
  }
}

/** Forget the cached pref (called on logout — the next profile has its own DB). */
export function resetArcadeMusicCache(): void {
  stopArcadeMusic();
  enabled = true;
  hydrated = false;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Start (or switch to) a theme. Must be called from a user gesture the first
 * time so the AudioContext can unlock. No-ops silently when sound is off or the
 * music toggle is off — the theme is remembered so it can resume.
 */
export function startArcadeMusic(theme: ArcadeMusicTheme): void {
  wireOnce();
  const switching = current !== theme;
  current = theme;
  if (!enabled || !isSoundEnabled()) return;
  if (switching && timer != null) {
    // Switch cleanly: restart the loop on the new theme.
    stopScheduler();
  }
  startScheduler();
}

/** Stop the music and forget the active theme (e.g. leaving the arcade). */
export function stopArcadeMusic(): void {
  current = null;
  stopScheduler();
}

/** Whether the persisted music toggle is on (independent of global sound). */
export function isArcadeMusicEnabled(): boolean {
  return enabled;
}

/** Set + persist the music toggle. Resumes the active theme when turned on. */
export function setArcadeMusicEnabled(value: boolean): void {
  enabled = value;
  hydrated = true;
  void persistEnabled(value);
  if (!value) stopScheduler();
  else if (current && isSoundEnabled()) startScheduler();
}

/**
 * Flip the music toggle. Returns the new state. Turning it on resumes the active
 * theme (this call is itself a gesture, so it can unlock).
 */
export function toggleArcadeMusic(): boolean {
  setArcadeMusicEnabled(!enabled);
  return enabled;
}
