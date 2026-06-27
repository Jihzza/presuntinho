<script lang="ts">
  // src/lib/components/LoveLock.svelte
  //
  // Full-screen modal that replaces the splash card when an emotional password
  // is detected ("Sad" → sad lock, "I love you" → love lock). Renders a
  // message from src/lib/auth/loveLock.ts plus a giant clickable button.
  //
  // Two visual variants:
  //   - sad  → pink pastel gradient, droopy Fofinho SVG, soft pulse
  //   - love → warm red gradient, hearts-emit Fofinho SVG, faster pulse
  //
  // The component owns its own countdown timer for the "stale" copy escalation
  // and calls `onUnlock` when the user taps the confirmation button. The
  // parent (splash) is responsible for clearing the lock + redirecting.

  import { onMount, onDestroy } from 'svelte';
  import {
    type LoveLockState,
    isLockStale,
    loveLockMessage,
  } from '$lib/auth/loveLock';

  type Props = {
    lockState: LoveLockState;
    locale: string; // 'pt-PT' | 'en' | anything else (falls back to en)
    onUnlock: () => void;
  };

  let { lockState, locale, onUnlock }: Props = $props();

  let stale = $state(false);
  let pulse = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  // Reactive title/body/button/stale strings. Recompute if locale or kind changes.
  const msgs = $derived({
    title: loveLockMessage(lockState.kind, 'title', locale),
    body: loveLockMessage(lockState.kind, 'body', locale),
    button: loveLockMessage(lockState.kind, 'button', locale),
    stale: loveLockMessage(lockState.kind, 'stale', locale),
  });

  onMount(() => {
    // Check stale immediately, then every 30s.
    stale = isLockStale(lockState);
    timer = setInterval(() => {
      stale = isLockStale(lockState);
      pulse++; // bumps key to retrigger button pulse animation
    }, 30_000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function handleClick() {
    onUnlock();
  }

  // Keyboard accessibility: pressing Enter / Space when the button is focused
  // already fires click — Svelte's default behaviour. We also accept Escape
  // for parity with the modal pattern, but Escape only emits unlock if the
  // user has read the message (held ≥3s). This prevents Fatma dismissing the
  // lock by muscle memory while grumpy.
  let mountedAt = Date.now();
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && Date.now() - mountedAt > 3000) {
      onUnlock();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="lock"
  class:sad={lockState.kind === 'sad'}
  class:love={lockState.kind === 'love'}
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="lovelock-title"
  aria-describedby="lovelock-body"
>
  <div class="card">
    <!-- Animated Fofinho SVG. Two variants chosen by the lock kind. -->
    {#if lockState.kind === 'sad'}
      <div class="mascot sad-mascot" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <!-- Fofinho body -->
          <ellipse cx="60" cy="78" rx="42" ry="32" fill="#f9c5d1" />
          <!-- Snout -->
          <ellipse cx="60" cy="80" rx="22" ry="14" fill="#fbb6ce" />
          <!-- Snout nostrils -->
          <circle cx="52" cy="80" r="2" fill="#7a3b4f" />
          <circle cx="68" cy="80" r="2" fill="#7a3b4f" />
          <!-- Ears (droopy for sad) -->
          <ellipse cx="32" cy="50" rx="10" ry="18" fill="#f9c5d1" transform="rotate(-25 32 50)" />
          <ellipse cx="88" cy="50" rx="10" ry="18" fill="#f9c5d1" transform="rotate(25 88 50)" />
          <!-- Eyes (closed, sad arcs) -->
          <path d="M 42 60 Q 48 66 54 60" stroke="#3d2a3a" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <path d="M 66 60 Q 72 66 78 60" stroke="#3d2a3a" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <!-- Tear drop -->
          <path d="M 48 70 Q 47 76 48 80 Q 49 76 48 70 Z" fill="#7ec5ff" class="tear" />
          <!-- Mouth (small frown) -->
          <path d="M 50 92 Q 60 88 70 92" stroke="#3d2a3a" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
      </div>
    {:else}
      <div class="mascot love-mascot" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <!-- Fofinho body (heart-shaped) -->
          <path
            d="M 60 100 C 60 100, 20 75, 20 50 C 20 35, 32 25, 45 25 C 52 25, 60 32, 60 40 C 60 32, 68 25, 75 25 C 88 25, 100 35, 100 50 C 100 75, 60 100, 60 100 Z"
            fill="#ff7aa2"
          />
          <!-- Snout -->
          <ellipse cx="60" cy="60" rx="16" ry="11" fill="#ffa6c0" />
          <!-- Nostrils (heart-shaped) -->
          <circle cx="54" cy="60" r="1.8" fill="#5a2740" />
          <circle cx="66" cy="60" r="1.8" fill="#5a2740" />
          <!-- Ears (perky) -->
          <path d="M 30 35 L 25 15 L 45 28 Z" fill="#ff7aa2" />
          <path d="M 90 35 L 95 15 L 75 28 Z" fill="#ff7aa2" />
          <!-- Eyes (sparkly) -->
          <ellipse cx="48" cy="48" rx="4" ry="6" fill="#3d2a3a" />
          <ellipse cx="72" cy="48" rx="4" ry="6" fill="#3d2a3a" />
          <circle cx="49" cy="46" r="1.5" fill="#fff" />
          <circle cx="73" cy="46" r="1.5" fill="#fff" />
          <!-- Happy mouth -->
          <path d="M 50 70 Q 60 80 70 70" stroke="#5a2740" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <!-- Floating hearts -->
          <text x="15" y="30" font-size="14" class="float-heart h1">💕</text>
          <text x="95" y="25" font-size="11" class="float-heart h2">💗</text>
          <text x="10" y="90" font-size="10" class="float-heart h3">💖</text>
        </svg>
      </div>
    {/if}

    <h1 id="lovelock-title">{msgs.title}</h1>
    <p id="lovelock-body" class="body">{msgs.body}</p>

    {#if stale}
      <p class="stale">{msgs.stale}</p>
    {/if}

    <!-- svelte-ignore a11y_autofocus -->
    <button
      type="button"
      class="cta"
      onclick={handleClick}
      aria-label={msgs.button}
      autofocus
    >
      {#key pulse}
        <span class="pulse">{msgs.button}</span>
      {/key}
    </button>

    <p class="hint">
      {#if lockState.kind === 'sad'}
        ✨ {locale === 'pt-PT' ? 'Fofinho perdoa tudo.' : 'Fofinho forgives everything.'}
      {:else}
        ✨ {locale === 'pt-PT' ? 'Fofinho acredita em ti.' : 'Fofinho believes you.'}
      {/if}
    </p>
  </div>
</div>

<style>
  .lock {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    z-index: 9999;
    overflow: hidden;
  }

  .lock.sad {
    background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 60%, #f9a8d4 100%);
  }

  .lock.love {
    background: linear-gradient(135deg, #ffe4e6 0%, #fecdd3 60%, #fb7185 100%);
  }

  .card {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 1.75rem;
    padding: 2.5rem 1.75rem;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow:
      0 20px 60px rgba(190, 24, 93, 0.18),
      0 4px 14px rgba(190, 24, 93, 0.08);
    animation: cardIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes cardIn {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .mascot {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .sad-mascot {
    animation: droop 3s ease-in-out infinite;
  }

  .love-mascot {
    animation: bounce 1.2s ease-in-out infinite;
  }

  @keyframes droop {
    0%, 100% {
      transform: translateY(0) rotate(-1deg);
    }
    50% {
      transform: translateY(2px) rotate(1deg);
    }
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-6px) scale(1.04);
    }
  }

  /* Sad tear animation */
  .tear {
    animation: tear 2s ease-in infinite;
    transform-origin: center;
  }

  @keyframes tear {
    0%, 100% {
      opacity: 0;
      transform: translateY(0);
    }
    20% {
      opacity: 1;
    }
    80% {
      opacity: 0.5;
    }
    100% {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  /* Love floating hearts */
  .float-heart {
    opacity: 0;
  }

  .h1 {
    animation: floatUp 3s ease-out infinite;
  }
  .h2 {
    animation: floatUp 3s ease-out infinite 0.7s;
  }
  .h3 {
    animation: floatUp 3s ease-out infinite 1.4s;
  }

  @keyframes floatUp {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0.6);
    }
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-20px) scale(1);
    }
  }

  h1 {
    margin: 0 0 0.75rem 0;
    font-size: 1.4rem;
    color: #831843;
    line-height: 1.3;
  }

  .body {
    margin: 0 0 1.25rem 0;
    color: #500724;
    font-size: 1rem;
    line-height: 1.55;
  }

  .stale {
    margin: -0.5rem 0 1.25rem 0;
    color: #9f1239;
    font-size: 0.9rem;
    font-style: italic;
  }

  .cta {
    display: block;
    width: 100%;
    padding: 1rem 1.25rem;
    font-size: 1.05rem;
    font-weight: 700;
    border: 0;
    border-radius: 1rem;
    background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(236, 72, 153, 0.4);
    transition:
      transform 0.15s,
      box-shadow 0.2s;
    /* 44×44 minimum hit area for a11y — already satisfied by padding. */
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(236, 72, 153, 0.5);
  }

  .cta:active {
    transform: translateY(0);
  }

  .cta:focus-visible {
    outline: 3px solid #fbcfe8;
    outline-offset: 3px;
  }

  .pulse {
    display: inline-block;
    animation: pulse 1.6s ease-in-out;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.03);
    }
  }

  .hint {
    margin: 1.25rem 0 0 0;
    color: #9d174d;
    font-size: 0.85rem;
    font-style: italic;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .sad-mascot,
    .love-mascot,
    .tear,
    .float-heart,
    .pulse {
      animation: none;
    }
  }

  @media (max-width: 480px) {
    .card {
      padding: 2rem 1.25rem;
    }
    h1 {
      font-size: 1.2rem;
    }
    .body {
      font-size: 0.95rem;
    }
  }
</style>
