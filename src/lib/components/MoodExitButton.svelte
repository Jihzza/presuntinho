<script lang="ts">
  // src/lib/components/MoodExitButton.svelte
  //
  // V10.x MoodExitButton (task-125) — gives the "leave mood" CTA some carinho
  // visual instead of the generic dismiss pill used before. Each mood gets its
  // own emoji microcopy (sick → 🌱 "Voltar a brotar", sad → 🌤️ "Soltar devagar",
  // love → 💗 "Guardar o carinho"), a small hold-to-confirm gesture, an exit
  // ripple particle and a scale/fade animation. Respects
  // prefers-reduced-motion. Does NOT move FAB / HeartButton / footer (the
  // surrounding layout stays identical — the button keeps the same slot).
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ActiveMood } from '$lib/mood';

  type Props = {
    mood: ActiveMood;
    saving: boolean;
    onConfirm: () => void | Promise<void>;
  };
  let { mood, saving, onConfirm }: Props = $props();

  // Tiny visual micro-state: pressed (while user holds) and ripple ping
  // (after they release — drives the particle fade-out animation).
  let pressed = $state(false);
  let rippleKey = $state(0);
  let reducedMotion = $state(false);

  const meta = $derived({
    sick: { emoji: '🌱', key: 'sick' },
    sad: { emoji: '🌤️', key: 'sad' },
    love: { emoji: '💗', key: 'love' }
  } as const);

  // Hold-to-confirm: tap + hold ≈ 350ms or quick tap both fire onConfirm.
  // Pointer down sets `pressed`; release fires unless saving/disabled.
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  function startPress(): void {
    if (saving) return;
    pressed = true;
    holdTimer = setTimeout(() => {
      // Visual cue that the hold reached its sweet spot — no behaviour change.
      rippleKey += 1;
    }, 320);
  }

  function endPress(): void {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    pressed = false;
  }

  async function commit(): Promise<void> {
    if (saving) return;
    rippleKey += 1;
    await onConfirm();
  }

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const listener = (event: MediaQueryListEvent): void => {
      reducedMotion = event.matches;
    };
    mq.addEventListener('change', listener);
    return () => {
      mq.removeEventListener('change', listener);
      if (holdTimer) clearTimeout(holdTimer);
    };
  });
</script>

<button
  type="button"
  class="mood-exit"
  class:pressed
  class:busy={saving}
  class:rest={reducedMotion}
  onpointerdown={startPress}
  onpointerup={commit}
  onpointerleave={endPress}
  onpointercancel={endPress}
  disabled={saving}
  aria-label={$t(`mood.exit.${meta[mood.kind].key}.title`, {
    default:
      mood.kind === 'sick'
        ? 'Voltar a brotar'
        : mood.kind === 'sad'
        ? 'Soltar devagar'
        : 'Guardar o carinho'
  })}
>
  <span class="emoji" aria-hidden="true">{meta[mood.kind].emoji}</span>
  <span class="copy">
    <strong>
      {$t(`mood.exit.${meta[mood.kind].key}.title`, {
        default:
          mood.kind === 'sick'
            ? 'Voltar a brotar'
            : mood.kind === 'sad'
            ? 'Soltar devagar'
            : 'Guardar o carinho'
      })}
    </strong>
    <small>
      {#if saving}
        {$t('mood.layer.saving', { default: 'A guardar…' })}
      {:else}
        {$t(`mood.exit.${meta[mood.kind].key}.hint`, {
          default:
            mood.kind === 'sick'
              ? 'suave, no teu ritmo'
              : mood.kind === 'sad'
              ? 'sem largar o que ficou bom'
              : 'leva contigo o quentinho'
        })}
      {/if}
    </small>
  </span>
  {#key rippleKey}
    <span class="ripple" class:rest={reducedMotion} aria-hidden="true"></span>
  {/key}
</button>

<style>
  .mood-exit {
    /* Layout-stable: same footprint the .recover pill had, but with more
       carinho — emoji + title + small hint. No absolute positioning, so
       FAB / HeartButton / footer stay put. */
    position: relative;
    display: inline-grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    min-height: 46px;
    padding: 0.55rem 0.95rem 0.55rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--mood-accent) 36%, rgba(255, 255, 255, 0.4));
    border-radius: 999px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--mood-accent) 18%, rgba(255, 255, 255, 0.96)),
      color-mix(in srgb, var(--mood-accent) 6%, rgba(255, 255, 255, 0.78))
    );
    color: #172033;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    box-shadow:
      0 12px 26px color-mix(in srgb, var(--mood-accent) 28%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.55);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
  }
  .mood-exit:hover {
    transform: translateY(-1px);
    box-shadow:
      0 16px 32px color-mix(in srgb, var(--mood-accent) 32%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.65);
  }
  .mood-exit:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--mood-accent) 55%, white);
    outline-offset: 2px;
  }
  .mood-exit:disabled,
  .mood-exit.busy {
    opacity: 0.72;
    cursor: wait;
    transform: none;
  }
  .mood-exit.pressed {
    transform: scale(0.97);
    box-shadow:
      0 6px 14px color-mix(in srgb, var(--mood-accent) 22%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  }
  .emoji {
    font-size: 1.18rem;
    line-height: 1;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--mood-accent) 24%, white);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82);
  }
  .copy {
    display: grid;
    gap: 0.05rem;
    min-width: 0;
    text-align: left;
  }
  .copy strong {
    font-size: 0.84rem;
    letter-spacing: 0.01em;
    line-height: 1.15;
    color: #172033;
  }
  .copy small {
    font-size: 0.7rem;
    color: rgba(23, 32, 51, 0.62);
    font-weight: 500;
    line-height: 1.1;
  }
  .ripple {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(
      circle at 30% 50%,
      color-mix(in srgb, var(--mood-accent) 50%, transparent) 0%,
      transparent 60%
    );
    opacity: 0;
    pointer-events: none;
    z-index: -1;
    animation: exitRipple 720ms ease-out forwards;
  }
  .ripple.rest {
    animation: none;
    opacity: 0;
  }
  .mood-exit.rest,
  .mood-exit.rest.pressed {
    transition: none;
  }

  @keyframes exitRipple {
    0% {
      opacity: 0;
      transform: scale(0.85);
    }
    35% {
      opacity: 0.85;
      transform: scale(1.02);
    }
    100% {
      opacity: 0;
      transform: scale(1.18);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mood-exit,
    .mood-exit:hover,
    .mood-exit.pressed {
      transition: none;
      transform: none;
    }
    .ripple {
      animation: none;
    }
  }
</style>