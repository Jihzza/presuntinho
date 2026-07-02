<script lang="ts">
  import { onMount } from 'svelte';
  import { clearActiveMood, moodMicrocopy, MOOD_META, type ActiveMood } from '$lib/mood';

  type Props = { mood: ActiveMood; onCleared: () => void };
  let { mood, onCleared }: Props = $props();
  let seed = $state(Date.now());
  let clearing = $state(false);
  let expanded = $state(false);

  const meta = $derived(MOOD_META[mood.kind]);
  const line = $derived(moodMicrocopy(mood.kind, seed));

  onMount(() => {
    const id = setInterval(() => (seed = Date.now()), 60_000);
    return () => clearInterval(id);
  });

  async function clearMood(): Promise<void> {
    clearing = true;
    try {
      await clearActiveMood();
      onCleared();
    } finally {
      clearing = false;
    }
  }
</script>

<div class="mood-root mood-{mood.kind}" style={`--mood-accent: ${meta.accent}`} aria-live="polite">
  {#if mood.kind === 'sick'}
    <div class="comfort-orbs" aria-hidden="true">
      <span>☁️</span><span>🤍</span><span>☕</span>
    </div>
  {/if}

  <aside class="mood-chip" class:expanded aria-label={`${meta.label}: ${line}`}>
    <button type="button" class="mood-main" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
      <span class="mood-emoji" aria-hidden="true">{meta.emoji}</span>
      <span>
        <strong>{meta.label}</strong>
        <small>{line}</small>
      </span>
    </button>

    {#if expanded}
      <div class="mood-panel">
        <p>{meta.body}</p>
        <button type="button" class="recover" onclick={clearMood} disabled={clearing}>
          {clearing ? 'A guardar…' : meta.action}
        </button>
      </div>
    {/if}
  </aside>
</div>

<style>
  .mood-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9600;
  }
  .comfort-orbs {
    position: absolute;
    inset: 0;
    overflow: hidden;
    opacity: 0.34;
  }
  .comfort-orbs span {
    position: absolute;
    font-size: 1.1rem;
    animation: comfortFloat 12s ease-in-out infinite;
  }
  .comfort-orbs span:nth-child(1) { left: 12%; top: 18%; animation-delay: 0s; }
  .comfort-orbs span:nth-child(2) { right: 14%; top: 34%; animation-delay: 2.8s; }
  .comfort-orbs span:nth-child(3) { left: 68%; bottom: 24%; animation-delay: 5.4s; }

  .mood-chip {
    position: absolute;
    left: max(1rem, env(safe-area-inset-left));
    right: max(1rem, env(safe-area-inset-right));
    bottom: calc(5.75rem + env(safe-area-inset-bottom));
    max-width: 420px;
    pointer-events: auto;
    border: 1px solid color-mix(in srgb, var(--mood-accent) 42%, rgba(255,255,255,.22));
    border-radius: 1.15rem;
    background: linear-gradient(135deg, color-mix(in srgb, var(--mood-accent) 16%, rgba(255,255,255,.9)), rgba(255,255,255,.72));
    color: #172033;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    overflow: hidden;
  }
  .mood-main {
    width: 100%;
    min-height: 58px;
    display: flex;
    align-items: center;
    gap: .7rem;
    padding: .7rem .82rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .mood-main:focus-visible, .recover:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--mood-accent) 55%, white);
    outline-offset: 2px;
  }
  .mood-emoji {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--mood-accent) 18%, white);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.75);
    flex: 0 0 auto;
  }
  strong, small { display: block; }
  strong { font-size: .86rem; letter-spacing: .01em; }
  small { margin-top: .12rem; color: rgba(23,32,51,.72); line-height: 1.25; }
  .mood-panel {
    padding: 0 .85rem .85rem 3.55rem;
    display: grid;
    gap: .65rem;
  }
  .mood-panel p { margin: 0; color: rgba(23,32,51,.78); font-size: .84rem; line-height: 1.4; }
  .recover {
    width: fit-content;
    min-height: 38px;
    padding: .52rem .8rem;
    border: 0;
    border-radius: 999px;
    background: var(--mood-accent);
    color: white;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 8px 20px color-mix(in srgb, var(--mood-accent) 34%, transparent);
  }
  .recover:disabled { opacity: .65; cursor: wait; }
  .mood-sick .mood-chip { background: linear-gradient(135deg, rgba(239,246,255,.94), rgba(255,247,237,.88)); }
  .mood-sad .mood-chip { background: linear-gradient(135deg, rgba(253,242,248,.94), rgba(255,255,255,.78)); }
  .mood-love .mood-chip { background: linear-gradient(135deg, rgba(255,228,230,.94), rgba(255,255,255,.78)); }

  @keyframes comfortFloat {
    0%, 100% { transform: translate3d(0, 0, 0) scale(.92); opacity: 0; }
    20% { opacity: .75; }
    50% { transform: translate3d(0, -22px, 0) scale(1.06); opacity: .65; }
    80% { opacity: 0; }
  }

  @media (min-width: 768px) {
    .mood-chip { left: max(1.25rem, env(safe-area-inset-left)); right: auto; bottom: calc(1.2rem + env(safe-area-inset-bottom)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .comfort-orbs span { animation: none; opacity: .35; }
  }
</style>
