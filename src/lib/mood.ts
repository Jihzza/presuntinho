// src/lib/mood.ts
//
// Mood/Vibe System — the emotional layer behind the old LoveLock screens.
// Today the trigger is still the splash password. Later an agent can call
// activateMood(kind) directly after recognising Fatma's mood.

import { browser } from '$app/environment';
import {
  activateLoveLock,
  clearLoveLock,
  detectLoveLock,
  readLoveLock,
  type LoveLockKind,
  type LoveLockState,
} from '$lib/auth/loveLock';

export type MoodKind = LoveLockKind;
export type MoodTriggerSource = 'password' | 'agent' | 'manual';

export interface ActiveMood extends LoveLockState {
  kind: MoodKind;
}

const ACK_KEY = 'presuntinho:mood:intro-ack';
export const MOOD_EVENT = 'presuntinho:mood-changed';

type AckPayload = { kind: MoodKind; expiresAt: number; acknowledgedAt: number };

function readAck(): AckPayload | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AckPayload>;
    if (!parsed.kind || typeof parsed.expiresAt !== 'number') return null;
    return parsed as AckPayload;
  } catch {
    return null;
  }
}

export function detectMoodTrigger(rawPassword: string): MoodKind | null {
  return detectLoveLock(rawPassword);
}

export async function activateMood(kind: MoodKind, _source: MoodTriggerSource = 'password'): Promise<ActiveMood | null> {
  if (browser) localStorage.removeItem(ACK_KEY);
  const mood = await activateLoveLock(kind);
  if (browser) window.dispatchEvent(new CustomEvent(MOOD_EVENT, { detail: mood }));
  return mood;
}

export async function readActiveMood(): Promise<ActiveMood | null> {
  return readLoveLock();
}

export async function clearActiveMood(): Promise<void> {
  if (browser) localStorage.removeItem(ACK_KEY);
  await clearLoveLock();
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

export const MOOD_META: Record<MoodKind, {
  label: string;
  emoji: string;
  accent: string;
  body: string;
  action: string;
  microcopy: string[];
}> = {
  sick: {
    label: 'Sick Mode',
    emoji: '🤍',
    accent: '#60a5fa',
    body: 'Modo cuidado activo: água, mantinha, descanso e só uma coisa pequenina de cada vez.',
    action: 'Já me sinto melhor 🤍',
    microcopy: [
      'Pausa fofinha: bebe um bocadinho de água.',
      'Hoje produtividade também é descansar.',
      'Mantinha, comida leve e zero culpa.',
      'Uma tarefa pequena chega. O resto espera por ti.'
    ]
  },
  sad: {
    label: 'Soft Mood',
    emoji: '🥺',
    accent: '#f472b6',
    body: 'A app fica mais calma e lembra-te com carinho que fazer as pazes também conta.',
    action: 'Já estou melhor 🫶',
    microcopy: [
      'Respira. O fofinho está do teu lado.',
      'Uma mensagem fofinha pode resolver muita coisa.',
      'Sem pressa: primeiro acalmar, depois estudar.'
    ]
  },
  love: {
    label: 'Love Vibe',
    emoji: '💕',
    accent: '#ec4899',
    body: 'Vibe carinhosa activa: pequenos detalhes mais quentinhos pela app.',
    action: 'Guardar esta vibe ✨',
    microcopy: [
      'Fofinho tem saudades tuas.',
      'Hoje a app está em modo carinho.',
      'Vai com calma, princesa.'
    ]
  }
};

export function moodMicrocopy(kind: MoodKind, seed = Date.now()): string {
  const lines = MOOD_META[kind].microcopy;
  return lines[Math.abs(Math.floor(seed / 60_000)) % lines.length];
}
