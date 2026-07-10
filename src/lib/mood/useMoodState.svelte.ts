// src/lib/mood/useMoodState.svelte.ts
//
// Reativo de mood partilhado entre rotas — usado pelas sub-apps para
// reagirem a Sick / Soft / Love sem reinventar listeners. Lê o `MOOD_EVENT`
// que o `+layout` já dispara quando o mood muda, e expõe o `kind` actual
// como uma `$state` rune que pode ser derivada por qualquer componente.
//
// V8 fix: além do fallback síncrono em localStorage (moods manuais), agora
// hidrata também moods activados no servidor (cookie/blob do love-lock — ex.
// disparados noutro browser ou por um agente) chamando readActiveMood() no
// mount. Antes, uma rota montada num browser "novo" nunca via o Sick Mode.

import { browser } from '$app/environment';
import { onMount } from 'svelte';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import {
  MOOD_EVENT,
  moodPressure,
  readActiveMood,
  isMoodIntroAcknowledged,
  type ActiveMood,
  type MoodKind,
  type MoodPressure
} from '$lib/mood';

interface MoodStateRunes {
  mood: { readonly kind: MoodKind } | null;
  isSick: boolean;
  isSoft: boolean;
  isLove: boolean;
  hasMood: boolean;
  /** 'gentle' quando Sick/Soft — as sub-apps devem baixar a pressão. */
  pressure: MoodPressure;
}

export function useMoodState(): MoodStateRunes {
  let mood = $state<ActiveMood | null>(null);
  let initialised = $state(false);

  onMount(() => {
    if (!browser) return;

    // 1) Leitura síncrona imediata (fallback manual em localStorage) para a
    //    1ª frame não piscar. Cobre apenas moods activados via /definicoes.
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

    // 2) Hidratação autoritativa (async): moods server-side (love-lock
    //    cookie/blob) que este browser ainda não conhece.
    void readActiveMood()
      .then((active) => {
        if (active) mood = active;
      })
      .catch(() => {
        /* offline / função indisponível — o fallback síncrono já correu */
      });

    const handler = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as ActiveMood | null) : null;
      mood = detail;
    };
    window.addEventListener(MOOD_EVENT, handler);
    return () => window.removeEventListener(MOOD_EVENT, handler);
  });

  // Um mood só é "efetivo" (bloqueia inputs, baixa pressão, etc.) DEPOIS de o
  // utilizador reconhecer o intro — que é exatamente quando o +layout mostra a
  // MoodLayer com o botão de saída. Sem isto, um mood ativado mas não
  // reconhecido bloqueava as Finanças em read-only sem UI de saída visível.
  const effective = (): ActiveMood | null =>
    mood && isMoodIntroAcknowledged(mood) ? mood : null;

  return {
    get mood() {
      return effective();
    },
    get isSick() {
      return effective()?.kind === 'sick';
    },
    get isSoft() {
      return effective()?.kind === 'sad';
    },
    get isLove() {
      return effective()?.kind === 'love';
    },
    get hasMood() {
      return Boolean(effective()) && initialised;
    },
    get pressure() {
      return moodPressure(effective()?.kind ?? null);
    }
  };
}

/** Frase calma por omissão para usar no placeholder de inputs/read-only blocks. */
export function moodMicrocopyHint(kind: MoodKind | null): string | null {
  if (!kind) return null;
  const defaults: Record<MoodKind, string> = {
    sick: 'Modo cuidado activo — só uma coisinha de cada vez 🤍',
    sad: 'Modo calma — faz só o que for possível hoje 🫶',
    love: 'Vibe carinho ligada — a app está quentinha 💕'
  };
  try {
    const format = get(t);
    return format ? format(`mood.hint.${kind}`, { default: defaults[kind] }) : defaults[kind];
  } catch {
    return defaults[kind];
  }
}
