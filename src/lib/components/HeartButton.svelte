<script lang="ts">
  /**
   * HeartButton — fixed bottom-right love target.
   *
   * It never animates layout/position; only inner transform/opacity/glow.
   * Spam taps receive exponentially stronger feedback via easterEggs.ts.
   *
   * V8: because this component lives in the global layout, it is also the
   * boot hook for the date-aware easter eggs (checkSeasonalEggs) and warms
   * the easterEggs.json config cache so the first heart click resolves its
   * tier instantly.
   */

  import { onMount } from 'svelte';
  import { heartClick, checkSeasonalEggs } from '$lib/easterEggs';
  import { loadEasterEggs } from '$lib/easterEggsConfig';
  import { prefersReducedMotion } from './events';
  import { t } from 'svelte-i18n';

  let emoji = $state('❤️');
  let intensity = $state(0);
  let pulsing = $state(false);
  let burstLevel = $state(0);
  let burstText = $state('');
  let burstTimer: ReturnType<typeof setTimeout> | null = null;

  function onClick(): void {
    void heartClick();
  }

  onMount(() => {
    // Warm the config cache (single fetch, shared by all consumers) and run
    // the once-per-day seasonal easter-egg check shortly after boot so the
    // celebration toast doesn't collide with the splash/boot toasts.
    void loadEasterEggs();
    const seasonalTimer = setTimeout(() => {
      void checkSeasonalEggs();
    }, 2200);

    function onVisual(e: Event): void {
      const ce = e as CustomEvent<{
        clicks: number;
        intensity: number;
        emoji: string;
        burstLevel?: number;
        recentClicks?: number;
      }>;
      emoji = ce.detail.emoji ?? '❤️';
      intensity = Math.max(0, Math.min(4, ce.detail.intensity ?? 0));
      burstLevel = Math.max(0, Math.min(5, ce.detail.burstLevel ?? 0));
      burstText = burstLevel >= 5
        ? $t('components.heart.burst.max')
        : burstLevel >= 3
          ? $t('components.heart.burst.strong')
          : burstLevel >= 1
            ? $t('components.heart.burst.combo')
            : '';
      if (burstTimer) clearTimeout(burstTimer);
      burstTimer = setTimeout(() => {
        burstLevel = 0;
        burstText = '';
      }, 1500);
    }
    function onPulse(): void {
      if (prefersReducedMotion()) return;
      pulsing = true;
      setTimeout(() => (pulsing = false), 320);
    }
    window.addEventListener('presuntinho:heart-visual', onVisual as EventListener);
    window.addEventListener('presuntinho:heart-pulse', onPulse as EventListener);
    return () => {
      window.removeEventListener('presuntinho:heart-visual', onVisual as EventListener);
      window.removeEventListener('presuntinho:heart-pulse', onPulse as EventListener);
      if (burstTimer) clearTimeout(burstTimer);
      clearTimeout(seasonalTimer);
    };
  });
</script>

<button
  type="button"
  class="heart-btn intensity-{intensity} burst-{burstLevel}"
  class:pulse={pulsing}
  onclick={onClick}
  aria-label={$t('components.heart.aria', { default: 'Clica no coração — easter egg' })}
  title={$t('components.heart.title', { default: 'Clica — easter egg' })}
>
  <span class="halo halo-a" aria-hidden="true"></span>
  <span class="halo halo-b" aria-hidden="true"></span>
  <span class="emoji" aria-hidden="true">{emoji}</span>
  {#if burstText}
    <span class="burst-label" aria-hidden="true">{burstText}</span>
  {/if}
</button>

<style>
  .heart-btn {
    width: 56px;
    height: 56px;
    min-width: 56px;
    min-height: 56px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--on-accent, #fff);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    position: relative;
    isolation: isolate;
    overflow: visible;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      transform var(--motion-fast, 120ms) ease,
      background var(--motion-base, 220ms) ease,
      border-color var(--motion-base, 220ms) ease,
      box-shadow var(--motion-base, 220ms) ease,
      filter var(--motion-base, 220ms) ease;
    align-self: center;
  }
  .heart-btn:hover,
  .heart-btn:focus-visible {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    outline: none;
  }
  .heart-btn:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 62%, white), 0 0 0 7px color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .heart-btn:active .emoji { transform: scale(0.92); }
  .emoji {
    font-size: 1.75rem;
    line-height: 1;
    display: inline-block;
    transition: transform var(--motion-base, 220ms) ease;
    user-select: none;
    -webkit-user-select: none;
    position: relative;
    z-index: 2;
  }
  .heart-btn:hover .emoji { transform: scale(1.1); }
  .halo {
    position: absolute;
    inset: -0.45rem;
    border-radius: 999px;
    background: radial-gradient(circle, color-mix(in srgb, var(--accent) 28%, transparent), transparent 58%);
    opacity: 0;
    transform: scale(.7);
    z-index: 0;
    pointer-events: none;
  }
  .halo-b { inset: -0.8rem; background: radial-gradient(circle, color-mix(in srgb, var(--warning) 18%, transparent), transparent 62%); }
  .burst-label {
    position: absolute;
    right: 0;
    bottom: calc(100% + .38rem);
    width: max-content;
    max-width: 10rem;
    padding: .25rem .48rem;
    border-radius: 999px;
    background: var(--bg-elev, rgba(15,23,42,.82));
    color: var(--txt, #fff);
    font-size: .64rem;
    font-weight: 900;
    letter-spacing: .02em;
    box-shadow: var(--shadow-md, 0 10px 24px rgba(15,23,42,.24));
    animation: label-pop .42s ease both;
    pointer-events: none;
  }
  .heart-btn.intensity-1 { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent); }
  .heart-btn.intensity-2 { background: color-mix(in srgb, var(--accent) 22%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent); }
  .heart-btn.intensity-3 { background: color-mix(in srgb, var(--accent) 32%, transparent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 40%, transparent); }
  .heart-btn.intensity-4 { background: linear-gradient(135deg, var(--accent) 0%, var(--warning) 100%); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 60%, transparent), 0 6px 18px color-mix(in srgb, var(--accent) 45%, transparent); }
  .heart-btn.pulse .emoji { animation: heart-pulse 0.3s ease; }
  .heart-btn[class*='burst-']:not(.burst-0) .halo-a { animation: halo-pop .72s ease both; }
  .heart-btn.burst-3 .halo-b,
  .heart-btn.burst-4 .halo-b,
  .heart-btn.burst-5 .halo-b { animation: halo-pop 1s ease .05s both; }
  .heart-btn.burst-4 .emoji,
  .heart-btn.burst-5 .emoji { animation: heart-rumble .38s ease both; }
  .heart-btn.burst-5 { filter: saturate(1.18) brightness(1.06); }
  @keyframes heart-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }
  @keyframes halo-pop { 0% { opacity: 0; transform: scale(.72); } 35% { opacity: 1; transform: scale(1.08); } 100% { opacity: 0; transform: scale(1.4); } }
  @keyframes heart-rumble { 0%, 100% { transform: translate3d(0,0,0) rotate(0) scale(1); } 20% { transform: translate3d(-2px,1px,0) rotate(-8deg) scale(1.08); } 45% { transform: translate3d(2px,-1px,0) rotate(8deg) scale(1.16); } 70% { transform: translate3d(-1px,0,0) rotate(-3deg) scale(1.08); } }
  @keyframes label-pop { from { opacity: 0; transform: translateY(4px) scale(.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (prefers-reduced-motion: reduce) {
    .heart-btn { transition: none; }
    .heart-btn:active .emoji,
    .heart-btn:hover .emoji { transform: none; }
    .heart-btn.pulse .emoji,
    .halo,
    .burst-label,
    .heart-btn.burst-4 .emoji,
    .heart-btn.burst-5 .emoji { animation: none; }
  }
</style>
