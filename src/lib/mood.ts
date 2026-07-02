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
  detailTitle: string;
  detailLead: string;
  ambience: string[];
  careActions: Array<{ id: string; emoji: string; label: string; done: string }>;
  affirmations: string[];
  microcopy: string[];
}> = {
  sick: {
    label: 'Sick Mode',
    emoji: '🤍',
    accent: '#60a5fa',
    body: 'Modo cuidado activo: água, mantinha, descanso e só uma coisa pequenina de cada vez. A app fica mais macia até voltares ao normal.',
    action: 'Já estou recuperada 🤍',
    detailTitle: 'Plano de mimo sem pressão',
    detailLead: 'Marca coisinhas simples quando conseguires. Não é checklist de produtividade — é cuidado.',
    ambience: ['☁️', '🤍', '☕', '🫧', '🧸'],
    careActions: [
      { id: 'water', emoji: '💧', label: 'Bebi água', done: 'água feita' },
      { id: 'rest', emoji: '🛌', label: 'Vou descansar', done: 'descanso combinado' },
      { id: 'food', emoji: '🍲', label: 'Comi algo leve', done: 'comidinha leve' }
    ],
    affirmations: [
      'Hoje o mínimo bem feito já é muito.',
      'Se o corpo pediu pausa, a app abranda contigo.',
      'Não tens de ganhar o dia — só tens de ficar um bocadinho melhor.',
      'O Presuntinho fica de guarda. Tu recuperas.'
    ],
    microcopy: [
      'Pausa fofinha: bebe um bocadinho de água.',
      'Hoje produtividade também é descansar.',
      'Mantinha, comida leve e zero culpa.',
      'Uma tarefa pequena chega. O resto espera por ti.',
      'Modo cuidado ligado: a app está a falar baixinho contigo.'
    ]
  },
  sad: {
    label: 'Soft Mood',
    emoji: '🥺',
    accent: '#f472b6',
    body: 'A app fica mais calma e lembra-te com carinho que fazer as pazes também conta.',
    action: 'Já estou melhor 🫶',
    detailTitle: 'Modo calma e carinho',
    detailLead: 'Pequenos passos para baixar a intensidade sem bloquear o dia.',
    ambience: ['🌙', '🫶', '🕯️', '💌', '☁️'],
    careActions: [
      { id: 'breathe', emoji: '🌬️', label: 'Respirei fundo', done: 'respiração feita' },
      { id: 'soft-message', emoji: '💌', label: 'Mensagem fofinha', done: 'paz encaminhada' },
      { id: 'tiny-step', emoji: '✨', label: 'Só um passo', done: 'um passo chega' }
    ],
    affirmations: [
      'Não precisas resolver tudo de uma vez.',
      'Fazer as pazes também pode começar pequenino.',
      'Tu mereces calma antes de exigência.',
      'O dia pode continuar suave, mesmo que tenha começado pesado.'
    ],
    microcopy: [
      'Respira. O fofinho está do teu lado.',
      'Uma mensagem fofinha pode resolver muita coisa.',
      'Sem pressa: primeiro acalmar, depois estudar.',
      'Hoje a app tira os cantos afiados ao dia.'
    ]
  },
  love: {
    label: 'Love Vibe',
    emoji: '💕',
    accent: '#ec4899',
    body: 'Vibe carinhosa activa: pequenos detalhes mais quentinhos pela app.',
    action: 'Voltar ao normal ✨',
    detailTitle: 'Modo carinho ligado',
    detailLead: 'A app fica mais quente, mais cúmplice e com pequenos miminhos pelo caminho.',
    ambience: ['💕', '✨', '💗', '🐷', '🌸'],
    careActions: [
      { id: 'kiss', emoji: '😘', label: 'Mandar beijo', done: 'beijinho enviado' },
      { id: 'memory', emoji: '📸', label: 'Lembrar um momento', done: 'momento guardado' },
      { id: 'hug', emoji: '🫂', label: 'Abraço virtual', done: 'abraço apertado' }
    ],
    affirmations: [
      'Há carinho nos detalhes pequenos.',
      'O Presuntinho está em modo saudades boas.',
      'Hoje até as tarefas vêm com beijinho na testa.',
      'Vibe fofinha, mas ainda útil — prometido.'
    ],
    microcopy: [
      'Fofinho tem saudades tuas.',
      'Hoje a app está em modo carinho.',
      'Vai com calma, princesa.',
      'Pequenos detalhes, muito coração.'
    ]
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
