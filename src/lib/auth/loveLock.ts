// src/lib/auth/loveLock.ts (REWRITTEN — cross-browser via Netlify Function)
//
// Love Lock — emotional gate that catches passwords of distress / affection.
// If the user types "Sad" or "I love you" (case-insensitive, flexible) on the
// splash screen, the app stays locked behind a cute Fofinho message until the
// Fatma taps the "I'm okay with fofinho" / "I said it again" button.
//
// Persistence: Netlify Function at /.netlify/functions/love-lock stores an
// HttpOnly cookie (domain-scoped → cross-browser). The previous localStorage
// implementation only worked within one browser.
//
// SECURITY NOTE: this is theatre, not a real auth bypass. The actual gate is
// PBKDF2 in src/lib/auth/hash.ts. Love Lock never grants access to the app on
// its own — it only REPLACES the splash screen with a friendly wall until the
// user clicks the confirmation button. A user who clears the cookie in
// DevTools can re-enter their normal password. That's intentional: the point
// is emotional, not technical.

import { browser } from '$app/environment';

export type LoveLockKind = 'sad' | 'love';

export interface LoveLockState {
  kind: LoveLockKind;
  startedAt: number; // ms epoch
  expiresAt: number; // ms epoch
}

const ENDPOINT = '/.netlify/functions/love-lock';

/**
 * Detect if the entered password matches a love-lock trigger.
 * Returns the kind, or null if this is a normal password attempt.
 */
export function detectLoveLock(rawPassword: string): LoveLockKind | null {
  if (!rawPassword) return null;
  const cleaned = rawPassword
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const sadTriggers = new Set(['sad', 'triste', 'estou triste', 'estou zangada']);
  if (sadTriggers.has(cleaned)) return 'sad';

  if (
    cleaned === 'i love you' ||
    cleaned.startsWith('i love you ') ||
    cleaned === 'i love him' ||
    cleaned === 'i love her' ||
    cleaned === 'i love fofinho' ||
    cleaned === 'love you' ||
    cleaned === 'love' ||
    cleaned === 'amo-te' ||
    cleaned.startsWith('amo-te ') ||
    cleaned === 'amo voce' ||
    cleaned === 'amo você' ||
    cleaned.startsWith('amo voce ') ||
    cleaned.startsWith('amo você ') ||
    cleaned === 'te amo' ||
    cleaned === 'eu amo-te' ||
    cleaned === 'eu te amo' ||
    cleaned === 'amor' ||
    cleaned === 'saudade' ||
    cleaned === 'saudades'
  ) {
    return 'love';
  }

  return null;
}

/** Activate a love lock — POSTs to the function which sets the blob + rotates the id cookie. */
export async function activateLoveLock(kind: LoveLockKind): Promise<LoveLockState | null> {
  if (!browser) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ kind }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.active) return null;
    const now = Date.now();
    return {
      kind: data.kind,
      startedAt: now,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : now + 60 * 60 * 1000,
    };
  } catch {
    // M2: No local fallback. The server (Netlify Blobs) is the source of
    // truth — if the POST fails, the lock does NOT exist server-side, so
    // inventing one in memory would just create a lock only this tab sees,
    // defeating the whole cross-browser fix. Returning null lets the splash
    // fall through to the normal error path instead of trapping the user
    // in a phantom lock.
    return null;
  }
}

/** Read the current lock state from the cookie, or null if absent/expired. */
export async function readLoveLock(): Promise<LoveLockState | null> {
  if (!browser) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.active) return null;
    return {
      kind: data.kind,
      startedAt: Date.now(),
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 60 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

/** Clear the lock — DELETEs the cookie via the function. */
export async function clearLoveLock(): Promise<void> {
  if (!browser) return;
  try {
    await fetch(ENDPOINT, { method: 'DELETE', credentials: 'include' });
  } catch {
    /* swallow — next GET will be the source of truth */
  }
}

/** Has the user been staring at the lock for >5 minutes? */
export function isLockStale(state: LoveLockState, thresholdMs = 5 * 60 * 1000): boolean {
  return Date.now() - state.startedAt > thresholdMs;
}

/**
 * i18n messages — bilingual copy for the lock screen.
 */
export const LOVE_LOCK_MESSAGES = {
  sad: {
    title: { en: 'Are you okay, sweetheart? 🥺', 'pt-PT': 'Estás bem, amor? 🥺' },
    body: {
      en: "It seems like you're upset with fofinho… but fofinho loves you so, so much. Sort things out with fofinho so you can focus on your studies. 📚💕",
      'pt-PT':
        'Parece que estás zangada com o fofinho… mas o fofinho adora-te imenso. Faz as pazes com o fofinho para pores a estudar com calma. 📚💕',
    },
    button: {
      en: "I'm great with fofinho. I love fofinho so much!",
      'pt-PT': 'Estou ótima com o fofinho. Adoro o fofinho!',
    },
    stale: {
      en: 'Still here? Fofinho is starting to miss your smile…',
      'pt-PT': 'Ainda aqui? O fofinho já começa a sentir falta do teu sorriso…',
    },
  },
  love: {
    title: { en: 'Fofinho misses you SO much 🥺💕', 'pt-PT': 'O fofinho tem muitas saudades tuas 🥺💕' },
    body: {
      en: "Go tell fofinho you love him. Just say it out loud, then tap the button below. He'll be waiting with a happy snort. 🐷✨",
      'pt-PT':
        'Vai dizer ao fofinho que o amas. Diz em voz alta, depois carrega no botão abaixo. Ele está à espera com um ronrom feliz. 🐷✨',
    },
    button: {
      en: "I said it and I'll say it again!",
      'pt-PT': 'Já disse e volto a dizer!',
    },
    stale: {
      en: "Fofinho is still waiting… he really, really misses you.",
      'pt-PT': 'O fofinho continua à espera… ele tem imensas saudades tuas.',
    },
  },
} as const;

export function loveLockMessage(
  kind: LoveLockKind,
  slot: 'title' | 'body' | 'button' | 'stale',
  locale: string
): string {
  const msgs = LOVE_LOCK_MESSAGES[kind][slot];
  if (locale in msgs) return msgs[locale as 'en' | 'pt-PT'];
  return msgs.en;
}