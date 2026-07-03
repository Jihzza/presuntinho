// src/lib/mood/useMoodState.ts
//
// Reativo de mood partilhado entre rotas — usado pelas sub-apps para
// reagirem a Sick / Soft / Love sem reinventar listeners. Lê o `MOOD_EVENT`
// que o `+layout` já dispara quando o mood muda, e expõe o `kind` actual
// como uma `$state` rune que pode ser derivada por qualquer componente.

import { browser } from '$app/environment';
import { onMount, onDestroy } from 'svelte';
import { MOOD_EVENT, type ActiveMood, type MoodKind } from '$lib/mood';

interface MoodStateRunes {
  mood: { readonly kind: MoodKind } | null;
  isSick: boolean;
  isSoft: boolean;
  isLove: boolean;
  hasMood: boolean;
}

export function useMoodState(): MoodStateRunes {
  let mood = $state<ActiveMood | null>(null);
  let initialised = false;

  onMount(() => {
    if (!browser) return;

    // Lê qualquer valor já gravado (caso a rota seja montada após o
    // mood estar activo). Mantém um fallback para manualFallback porque
    // o `readActiveMood()` é async e nós queremos reagir já na 1ª frame.
    try {
      const fallback = localStorage.getItem('presuntinho:mood:manual-fallback');
      if (fallback) {
        const parsed = JSON.parse(fallback) as Partial<ActiveMood>;
        if (
          (parsed.kind === 'sick' || parsed.kind === 'sad' || parsed.kind === 'love') &&
          typeof parsed.expiresAt === 'number' &&
          parsed.expiresAt > Date.now()
        ) {
          mood = parsed as ActiveMood;
        }
      }
    } catch {
      // ignore — fica null
    }
    initialised = true;

    const handler = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as ActiveMood | null) : null;
      mood = detail;
    };
    window.addEventListener(MOOD_EVENT, handler);
    onDestroy(() => window.removeEventListener(MOOD_EVENT, handler));
  });

  return {
    get mood() {
      return mood;
    },
    get isSick() {
      return mood?.kind === 'sick';
    },
    get isSoft() {
      return mood?.kind === 'sad';
    },
    get isLove() {
      return mood?.kind === 'love';
    },
    get hasMood() {
      return Boolean(mood) && initialised;
    }
  };
}

/** Frase calma por omissão para usar no placeholder de inputs/read-only blocks. */
export function moodMicrocopyHint(kind: MoodKind | null): string | null {
  if (!kind) return null;
  switch (kind) {
    case 'sick':
      return 'Modo cuidado activo — só uma coisinha de cada vez 🤍';
    case 'sad':
      return 'Modo calma — faz só o que for possível hoje 🫶';
    case 'love':
      return 'Vibe carinho ligada — a app está quentinha 💕';
  }
}