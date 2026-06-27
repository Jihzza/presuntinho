// src/lib/auth/loveLock.ts
//
// Love Lock — emotional gate that catches passwords of distress / affection.
// If the user types "Sad" or "I love you" (case-insensitive, flexible) on the
// splash screen, the app stays locked behind a cute Fofinho message until the
// Fatma taps the "I'm okay with fofinho" / "I said it again" button.
//
// Persists in localStorage with a 1-hour TTL so a refresh doesn't break the
// romantic gesture, and exposes an "elapsed" callback so the lock screen can
// change copy after 5 minutes ("Are you still there? Fofinho is worried…").
//
// SECURITY NOTE: this is theatre, not a real auth bypass. The actual gate is
// PBKDF2 in src/lib/auth/hash.ts. Love Lock never grants access to the app on
// its own — it only REPLACES the splash screen with a friendly wall until the
// user clicks the confirmation button. A user who clears localStorage in
// DevTools can re-enter their normal password. That's intentional: the point
// is emotional, not technical.

import { browser } from '$app/environment';

export type LoveLockKind = 'sad' | 'love';

export interface LoveLockState {
  kind: LoveLockKind;
  startedAt: number; // ms epoch
  expiresAt: number; // ms epoch
}

const KEY = 'presuntinho.lovelock.v1';
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Detect if the entered password matches a love-lock trigger.
 * Returns the kind, or null if this is a normal password attempt.
 *
 * Matching rules:
 *   - "Sad" / "sad" / "SAD" / "estou triste" / "triste" → 'sad'
 *   - "I love you" / "i love you" / "amo-te" / "amo voce" → 'love'
 *
 * Whitespace-padded; quotation marks stripped ("I love you" with quotes works).
 */
export function detectLoveLock(rawPassword: string): LoveLockKind | null {
  if (!rawPassword) return null;
  // Strip outer quotes, lowercase, collapse internal whitespace.
  const cleaned = rawPassword
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // SAD triggers
  const sadTriggers = new Set(['sad', 'triste', 'estou triste', 'estou zangada']);
  if (sadTriggers.has(cleaned)) return 'sad';

  // LOVE triggers — "i love you" with optional trailing object
  // (e.g. "i love you fofinho" still counts as a love declaration)
  if (
    cleaned === 'i love you' ||
    cleaned.startsWith('i love you ') ||
    cleaned === 'amo-te' ||
    cleaned.startsWith('amo-te ') ||
    cleaned === 'amo voce' ||
    cleaned === 'amo você' ||
    cleaned.startsWith('amo voce ') ||
    cleaned.startsWith('amo você ')
  ) {
    return 'love';
  }

  return null;
}

/** Activate a love lock (called from splash on trigger). */
export function activateLoveLock(kind: LoveLockKind): LoveLockState {
  const now = Date.now();
  const state: LoveLockState = {
    kind,
    startedAt: now,
    expiresAt: now + ONE_HOUR_MS,
  };
  if (browser) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full / disabled — fail open, the lock is emotional not critical */
    }
  }
  return state;
}

/** Read the current lock state, or null if absent/expired. */
export function readLoveLock(): LoveLockState | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoveLockState;
    if (
      !parsed ||
      typeof parsed.startedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number' ||
      (parsed.kind !== 'sad' && parsed.kind !== 'love')
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Clear the lock (called when user clicks the confirmation button). */
export function clearLoveLock(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* swallow */
  }
}

/**
 * Has the user been staring at the lock for >5 minutes? Used by the UI to
 * escalate the copy ("Are you still there? Fofinho is worried…").
 */
export function isLockStale(state: LoveLockState, thresholdMs = 5 * 60 * 1000): boolean {
  return Date.now() - state.startedAt > thresholdMs;
}

/**
 * i18n messages. Keys are dot-namespaced so the splash page can pick them up
 * via $t('lovelock.sad.title'), etc.
 *
 * The two languages are co-located here rather than in pt-PT.json / en.json
 * because the copy is feature-specific and short. (Adding ~10 keys to the big
 * locale files for this one feature would dilute review focus.)
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

/**
 * Pick the right translation for a message slot based on the user's current
 * locale. Falls back to English if the requested locale isn't loaded yet.
 */
export function loveLockMessage(
  kind: LoveLockKind,
  slot: 'title' | 'body' | 'button' | 'stale',
  locale: string,
): string {
  const msgs = LOVE_LOCK_MESSAGES[kind][slot];
  if (locale in msgs) return msgs[locale as 'en' | 'pt-PT'];
  return msgs.en;
}
