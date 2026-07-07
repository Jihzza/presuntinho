// src/lib/mood.ts
//
// Mood/Vibe System — the emotional layer behind the old LoveLock screens.
// Today the trigger is still the splash password. Later an agent can call
// activateMood(kind) directly after recognising Fatma's mood.
//
// V8: activateMood()/clearActiveMood() are the single choke points that also
// write mood history rows into the Dexie `mood_logs` table (via the domain
// helper $lib/mood/moodLogs). All user-visible MOOD_META copy is resolved
// through svelte-i18n keys (with pt-PT defaults inline).

import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import {
  activateLoveLock,
  clearLoveLock,
  detectLoveLock,
  readLoveLock,
  type LoveLockKind,
  type LoveLockState,
} from '$lib/auth/loveLock';
import {
  closeMoodEpisode,
  getEpisode,
  setEpisodeCare,
  startMoodEpisode,
} from '$lib/mood/moodLogs';

export type MoodKind = LoveLockKind;
export type MoodTriggerSource = 'password' | 'agent' | 'manual';

export interface ActiveMood extends LoveLockState {
  kind: MoodKind;
}

const ACK_KEY = 'presuntinho:mood:intro-ack';
const MANUAL_MOOD_KEY = 'presuntinho:mood:manual-fallback';
const EPISODE_LOG_KEY = 'presuntinho:mood:episode-log-id';
export const MOOD_EVENT = 'presuntinho:mood-changed';

type AckPayload = { kind: MoodKind; expiresAt: number; acknowledgedAt: number };

function isMoodKind(value: unknown): value is MoodKind {
  return value === 'sick' || value === 'sad' || value === 'love';
}

// ---------------------------------------------------------------------------
// i18n helper — safe translation with a pt-PT fallback baked in. Works from
// plain .ts modules (uses get(t) at call time, after $lib/i18n has init'd).
// ---------------------------------------------------------------------------
function tr(key: string, fallback: string): string {
  try {
    const format = get(t);
    return format ? format(key, { default: fallback }) : fallback;
  } catch {
    return fallback;
  }
}

function readAck(): AckPayload | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AckPayload>;
    if (!isMoodKind(parsed.kind) || typeof parsed.expiresAt !== 'number') return null;
    return parsed as AckPayload;
  } catch {
    return null;
  }
}

function readManualFallback(): ActiveMood | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(MANUAL_MOOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveMood>;
    if (!isMoodKind(parsed.kind) || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(MANUAL_MOOD_KEY);
      return null;
    }
    return {
      kind: parsed.kind,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now(),
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}

function writeManualFallback(mood: ActiveMood): void {
  if (!browser) return;
  localStorage.setItem(MANUAL_MOOD_KEY, JSON.stringify(mood));
}

// ---------------------------------------------------------------------------
// Episode-log bookkeeping (mood history in Dexie `mood_logs`)
// ---------------------------------------------------------------------------

function storeEpisodeLogId(id: number | null): void {
  if (!browser) return;
  try {
    if (id == null) localStorage.removeItem(EPISODE_LOG_KEY);
    else localStorage.setItem(EPISODE_LOG_KEY, String(id));
  } catch {
    /* localStorage can fail in private browsing — history stays best-effort */
  }
}

function readEpisodeLogId(): number | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(EPISODE_LOG_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Make sure the currently active mood has an open episode row. Covers moods
 * that were triggered elsewhere (server cookie/blob → another browser, or an
 * agent) and are only *hydrated* here via readActiveMood(). Idempotent.
 */
export async function ensureMoodEpisodeLogged(
  mood: ActiveMood,
  source: MoodTriggerSource = 'agent'
): Promise<number | null> {
  if (!browser) return null;
  const existing = readEpisodeLogId();
  if (existing != null) {
    const row = await getEpisode(existing);
    if (row && row.kind === mood.kind && row.clearedAt === undefined) return existing;
  }
  const id = await startMoodEpisode(mood.kind, source, mood.startedAt);
  storeEpisodeLogId(id);
  return id;
}

/**
 * Persist MoodLayer care ticks onto the active episode's history row
 * (careDone map + `care:<id>` tags). No-op when no episode row is tracked.
 */
export async function recordMoodCare(careDone: Record<string, boolean>): Promise<void> {
  const id = readEpisodeLogId();
  if (id == null) return;
  await setEpisodeCare(id, careDone);
}

// ---------------------------------------------------------------------------
// Mood lifecycle (single choke points)
// ---------------------------------------------------------------------------

export function detectMoodTrigger(rawPassword: string): MoodKind | null {
  return detectLoveLock(rawPassword);
}

export async function activateMood(kind: MoodKind, source: MoodTriggerSource = 'password'): Promise<ActiveMood | null> {
  if (browser) {
    localStorage.removeItem(ACK_KEY);
    localStorage.removeItem(MANUAL_MOOD_KEY);
  }
  let mood = await activateLoveLock(kind);
  if (!mood && source === 'manual') {
    const now = Date.now();
    mood = { kind, startedAt: now, expiresAt: now + 60 * 60 * 1000 };
    writeManualFallback(mood);
  }
  if (mood) {
    // Mood history (V8) — best-effort; never blocks the mood itself.
    try {
      const previous = readEpisodeLogId();
      if (previous != null) await closeMoodEpisode(previous, Date.now());
      const id = await startMoodEpisode(kind, source, mood.startedAt);
      storeEpisodeLogId(id);
    } catch {
      /* history write failed — the mood still activates */
    }
  }
  if (browser) window.dispatchEvent(new CustomEvent(MOOD_EVENT, { detail: mood }));
  return mood;
}

export async function readActiveMood(): Promise<ActiveMood | null> {
  return (await readLoveLock()) ?? readManualFallback();
}

export async function clearActiveMood(): Promise<void> {
  const logId = readEpisodeLogId();
  if (browser) {
    localStorage.removeItem(ACK_KEY);
    localStorage.removeItem(MANUAL_MOOD_KEY);
  }
  await clearLoveLock();
  // Mood history (V8): stamp clearedAt on the episode row (and any dangling
  // open episodes) — best-effort.
  try {
    await closeMoodEpisode(logId, Date.now());
  } catch {
    /* ignore — history is best-effort */
  }
  storeEpisodeLogId(null);
  if (browser) window.dispatchEvent(new CustomEvent(MOOD_EVENT, { detail: null }));
}

export function acknowledgeMoodIntro(mood: ActiveMood): void {
  if (!browser) return;
  const payload: AckPayload = { kind: mood.kind, expiresAt: mood.expiresAt, acknowledgedAt: Date.now() };
  localStorage.setItem(ACK_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(MOOD_EVENT, { detail: mood }));
}

export function isMoodIntroAcknowledged(mood: ActiveMood | null): boolean {
  if (!mood) return false;
  const ack = readAck();
  return !!ack && ack.kind === mood.kind && ack.expiresAt === mood.expiresAt;
}

// ---------------------------------------------------------------------------
// Mood-aware app pressure — tiny helper other sub-apps can consume to soften
// their tone/CTAs. 'gentle' = no nudging, no streak-guilt, softer copy.
// ---------------------------------------------------------------------------

export type MoodPressure = 'normal' | 'gentle';

/** Pure mapping: Sick and Soft moods ask the app to lower the pressure. */
export function moodPressure(kind?: MoodKind | null): MoodPressure {
  return kind === 'sick' || kind === 'sad' ? 'gentle' : 'normal';
}

/** Async convenience — reads the active mood first. */
export async function readMoodPressure(): Promise<MoodPressure> {
  const mood = await readActiveMood();
  return moodPressure(mood?.kind ?? null);
}

// ---------------------------------------------------------------------------
// MOOD_META — visual + copy metadata per mood. All copy is resolved lazily
// through i18n keys (pt-PT defaults inline) so consumers keep reading plain
// string fields while translations stay in the locale dictionaries.
// ---------------------------------------------------------------------------

export interface MoodCareAction {
  id: string;
  emoji: string;
  label: string;
  done: string;
}

export interface MoodMeta {
  label: string;
  emoji: string;
  accent: string;
  body: string;
  action: string;
  detailTitle: string;
  detailLead: string;
  ambience: string[];
  careActions: MoodCareAction[];
  affirmations: string[];
  microcopy: string[];
}

function careAction(kind: MoodKind, id: string, emoji: string, label: string, done: string): MoodCareAction {
  return {
    id,
    emoji,
    get label() { return tr(`mood.meta.${kind}.care.${id}.label`, label); },
    get done() { return tr(`mood.meta.${kind}.care.${id}.done`, done); }
  };
}

export const MOOD_META: Record<MoodKind, MoodMeta> = {
  sick: {
    get label() { return tr('mood.meta.sick.label', 'Sick Mode'); },
    emoji: '🤍',
    accent: '#60a5fa',
    get body() { return tr('mood.meta.sick.body', 'Modo cuidado activo: água, mantinha, descanso e só uma coisa pequenina de cada vez. A app fica mais macia até voltares ao normal.'); },
    get action() { return tr('mood.meta.sick.action', 'Já estou recuperada 🤍'); },
    get detailTitle() { return tr('mood.meta.sick.detail_title', 'Plano de mimo sem pressão'); },
    get detailLead() { return tr('mood.meta.sick.detail_lead', 'Marca coisinhas simples quando conseguires. Não é checklist de produtividade — é cuidado.'); },
    ambience: ['☁️', '🤍', '☕', '🫧', '🧸'],
    get careActions() {
      return [
        careAction('sick', 'water', '💧', 'Bebi água', 'água feita'),
        careAction('sick', 'rest', '🛌', 'Vou descansar', 'descanso combinado'),
        careAction('sick', 'food', '🍲', 'Comi algo leve', 'comidinha leve')
      ];
    },
    get affirmations() {
      return [
        tr('mood.meta.sick.affirmation.1', 'Hoje o mínimo bem feito já é muito.'),
        tr('mood.meta.sick.affirmation.2', 'Se o corpo pediu pausa, a app abranda contigo.'),
        tr('mood.meta.sick.affirmation.3', 'Não tens de ganhar o dia — só tens de ficar um bocadinho melhor.'),
        tr('mood.meta.sick.affirmation.4', 'O Presuntinho fica de guarda. Tu recuperas.')
      ];
    },
    get microcopy() {
      return [
        tr('mood.meta.sick.microcopy.1', 'Pausa fofinha: bebe um bocadinho de água.'),
        tr('mood.meta.sick.microcopy.2', 'Hoje produtividade também é descansar.'),
        tr('mood.meta.sick.microcopy.3', 'Mantinha, comida leve e zero culpa.'),
        tr('mood.meta.sick.microcopy.4', 'Uma tarefa pequena chega. O resto espera por ti.'),
        tr('mood.meta.sick.microcopy.5', 'Modo cuidado ligado: a app está a falar baixinho contigo.')
      ];
    }
  },
  sad: {
    get label() { return tr('mood.meta.sad.label', 'Soft Mood'); },
    emoji: '🥺',
    accent: '#f472b6',
    get body() { return tr('mood.meta.sad.body', 'A app fica mais calma e lembra-te com carinho que fazer as pazes também conta.'); },
    get action() { return tr('mood.meta.sad.action', 'Já estou melhor 🫶'); },
    get detailTitle() { return tr('mood.meta.sad.detail_title', 'Modo calma e carinho'); },
    get detailLead() { return tr('mood.meta.sad.detail_lead', 'Pequenos passos para baixar a intensidade sem bloquear o dia.'); },
    ambience: ['🌙', '🫶', '🕯️', '💌', '☁️'],
    get careActions() {
      return [
        careAction('sad', 'breathe', '🌬️', 'Respirei fundo', 'respiração feita'),
        careAction('sad', 'soft-message', '💌', 'Mensagem fofinha', 'paz encaminhada'),
        careAction('sad', 'tiny-step', '✨', 'Só um passo', 'um passo chega')
      ];
    },
    get affirmations() {
      return [
        tr('mood.meta.sad.affirmation.1', 'Não precisas resolver tudo de uma vez.'),
        tr('mood.meta.sad.affirmation.2', 'Fazer as pazes também pode começar pequenino.'),
        tr('mood.meta.sad.affirmation.3', 'Tu mereces calma antes de exigência.'),
        tr('mood.meta.sad.affirmation.4', 'O dia pode continuar suave, mesmo que tenha começado pesado.')
      ];
    },
    get microcopy() {
      return [
        tr('mood.meta.sad.microcopy.1', 'Respira. O Presuntinho está do teu lado.'),
        tr('mood.meta.sad.microcopy.2', 'Uma mensagem fofinha pode resolver muita coisa.'),
        tr('mood.meta.sad.microcopy.3', 'Sem pressa: primeiro acalmar, depois estudar.'),
        tr('mood.meta.sad.microcopy.4', 'Hoje a app tira os cantos afiados ao dia.')
      ];
    }
  },
  love: {
    get label() { return tr('mood.meta.love.label', 'Love Vibe'); },
    emoji: '💕',
    accent: 'var(--accent, #db2777)',
    get body() { return tr('mood.meta.love.body', 'Vibe carinhosa activa: pequenos detalhes mais quentinhos pela app.'); },
    get action() { return tr('mood.meta.love.action', 'Voltar ao normal ✨'); },
    get detailTitle() { return tr('mood.meta.love.detail_title', 'Modo carinho ligado'); },
    get detailLead() { return tr('mood.meta.love.detail_lead', 'A app fica mais quente, mais cúmplice e com pequenos miminhos pelo caminho.'); },
    ambience: ['💕', '✨', '💗', '🐷', '🌸'],
    get careActions() {
      return [
        careAction('love', 'kiss', '😘', 'Mandar beijo', 'beijinho enviado'),
        careAction('love', 'memory', '📸', 'Lembrar um momento', 'momento guardado'),
        careAction('love', 'hug', '🫂', 'Abraço virtual', 'abraço apertado')
      ];
    },
    get affirmations() {
      return [
        tr('mood.meta.love.affirmation.1', 'Há carinho nos detalhes pequenos.'),
        tr('mood.meta.love.affirmation.2', 'O Presuntinho está em modo saudades boas.'),
        tr('mood.meta.love.affirmation.3', 'Hoje até as tarefas vêm com beijinho na testa.'),
        tr('mood.meta.love.affirmation.4', 'Vibe fofinha, mas ainda útil — prometido.')
      ];
    },
    get microcopy() {
      return [
        tr('mood.meta.love.microcopy.1', 'O Presuntinho tem saudades tuas.'),
        tr('mood.meta.love.microcopy.2', 'Hoje a app está em modo carinho.'),
        tr('mood.meta.love.microcopy.3', 'Vai com calma. 🌸'),
        tr('mood.meta.love.microcopy.4', 'Pequenos detalhes, muito coração.')
      ];
    }
  }
};

export function moodAffirmation(kind: MoodKind, seed = Date.now()): string {
  const lines = MOOD_META[kind].affirmations;
  return lines[Math.abs(seed) % lines.length];
}

export function moodMicrocopy(kind: MoodKind, seed = Date.now()): string {
  const lines = MOOD_META[kind].microcopy;
  return lines[Math.abs(Math.floor(seed / 60_000)) % lines.length];
}
