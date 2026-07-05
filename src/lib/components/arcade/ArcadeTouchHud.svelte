<script lang="ts">
  // Split touch HUD: whatever moves LEFT lives in the bottom-left corner,
  // whatever moves RIGHT (and the action) lives in the bottom-right corner —
  // so each thumb reaches the control it expects. Fixed to the viewport over
  // the footer (where the mascot + heart FABs normally sit). The overlay is
  // click-through; only the corner clusters catch pointers, each capturing its
  // own pointerId so both thumbs work at once (multi-touch). Hidden on desktop.
  import { t } from 'svelte-i18n';
  import type { Direction } from '$lib/arcade/engine';
  import type { HudLeft, HudRight } from '$lib/arcade/games';

  interface Props {
    left: HudLeft;
    right: HudRight;
    onTurn: (dir: Direction) => void;
    onHold: (dir: Direction, down: boolean) => void;
    onAction: (down: boolean) => void;
  }
  let { left, right, onTurn, onHold, onAction }: Props = $props();

  function hold(dir: Direction) {
    return {
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onHold(dir, true);
      },
      onpointerup: () => onHold(dir, false),
      onpointercancel: () => onHold(dir, false),
      onlostpointercapture: () => onHold(dir, false)
    };
  }
  function tap(dir: Direction) {
    return { onpointerdown: (e: PointerEvent) => { e.preventDefault(); onTurn(dir); } };
  }
  const actionHandlers = {
    onpointerdown: (e: PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onAction(true);
    },
    onpointerup: () => onAction(false),
    onpointercancel: () => onAction(false)
  };

  const jumpLabel = $derived($t('arcade.controls.jump', { default: 'Saltar' }));
  const launchLabel = $derived($t('arcade.controls.launch', { default: 'Lançar' }));
</script>

<div class="hud-overlay" aria-hidden="false">
  <!-- ── bottom-left ── -->
  {#if left !== 'none'}
    <div class="cluster move-cluster" role="group" aria-label={$t('arcade.hud.move_aria', { default: 'Movimento' })}>
      {#if left === 'dpad'}
        <div class="dpad">
          <span class="hub" aria-hidden="true"></span>
          <button type="button" class="d up" aria-label={$t('arcade.controls.up', { default: 'Cima' })} {...tap('up')}>▲</button>
          <button type="button" class="d left" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} {...tap('left')}>◀</button>
          <button type="button" class="d right" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...tap('right')}>▶</button>
          <button type="button" class="d down" aria-label={$t('arcade.controls.down', { default: 'Baixo' })} {...tap('down')}>▼</button>
        </div>
      {:else if left === 'move-lr'}
        <!-- both walk buttons on the left so the right thumb is free to JUMP -->
        <div class="lr-pair">
          <button type="button" class="side" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} {...hold('left')}>◀</button>
          <button type="button" class="side" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...hold('right')}>▶</button>
        </div>
      {:else}
        <button type="button" class="side" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} {...hold('left')}>◀</button>
      {/if}
    </div>
  {/if}

  <!-- ── bottom-right ── -->
  {#if right !== 'none'}
    <div class="cluster act-cluster" role="group" aria-label={$t('arcade.hud.action_aria', { default: 'Ação' })}>
      {#if right === 'jump' || right === 'launch'}
        <button type="button" class="action-btn" aria-label={right === 'jump' ? jumpLabel : launchLabel} {...actionHandlers}>
          <span class="a-icon" aria-hidden="true">{right === 'jump' ? '⤒' : '✦'}</span>
          <span class="a-label">{right === 'jump' ? jumpLabel : launchLabel}</span>
        </button>
      {:else if right === 'move-right-jump'}
        <button type="button" class="action-btn stacked" aria-label={jumpLabel} {...actionHandlers}>
          <span class="a-icon" aria-hidden="true">⤒</span>
          <span class="a-label">{jumpLabel}</span>
        </button>
        <button type="button" class="side" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...hold('right')}>▶</button>
      {:else}
        <button type="button" class="side" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...hold('right')}>▶</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .hud-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 45;
  }
  .cluster {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom) + 1.6rem);
    pointer-events: auto;
    touch-action: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
  }
  .move-cluster { left: max(0.9rem, env(safe-area-inset-left)); }
  .act-cluster { right: max(0.9rem, env(safe-area-inset-right)); align-items: flex-end; }

  button {
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    color: rgba(255, 255, 255, 0.92);
    font: inherit;
    font-weight: 900;
    cursor: pointer;
    /* Semi-transparent (Free Fire style): you can SEE the game through the
       button, but a bright accent ring keeps it clearly visible. */
    border: 1.5px solid color-mix(in srgb, var(--accent, #67e8f9) 66%, rgba(255, 255, 255, 0.3));
    background: color-mix(in srgb, var(--accent, #67e8f9) 12%, rgba(10, 16, 30, 0.3));
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    transition: transform 90ms ease, background 90ms ease, box-shadow 90ms ease;
  }
  button:active {
    transform: scale(0.9);
    background: color-mix(in srgb, var(--accent, #67e8f9) 48%, rgba(10, 16, 30, 0.4));
    box-shadow: 0 0 18px color-mix(in srgb, var(--accent, #67e8f9) 70%, transparent);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #67e8f9) 60%, transparent);
  }

  /* single side button (◀ / ▶) */
  .side {
    width: 74px;
    height: 74px;
    border-radius: 999px;
    font-size: 1.6rem;
    display: grid;
    place-items: center;
  }
  /* platformer: ◀ ▶ side by side on the left, freeing the right thumb to jump */
  .lr-pair {
    display: flex;
    gap: 0.6rem;
  }

  /* D-pad */
  .dpad {
    position: relative;
    width: 146px;
    height: 146px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.06), transparent 68%);
  }
  .hub {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 40px;
    height: 40px;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(10, 16, 30, 0.4);
  }
  .d {
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 0.8rem;
    font-size: 1.1rem;
    display: grid;
    place-items: center;
  }
  .d.up { left: 48px; top: 0; }
  .d.down { left: 48px; bottom: 0; }
  .d.left { left: 0; top: 48px; }
  .d.right { right: 0; top: 48px; }

  /* action button (jump / launch) — the largest, slightly more opaque than the
     move buttons since it is the primary press. */
  .action-btn {
    width: 86px;
    height: 86px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    gap: 0.05rem;
    background: color-mix(in srgb, var(--accent, #f472b6) 22%, rgba(10, 16, 30, 0.42));
  }
  .a-icon { font-size: 1.5rem; line-height: 1; }
  .a-label { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.02em; }

  /* Landscape (phone on its side): controls move to the vertical middle of the
     left/right edges so both thumbs rest there and the centred playfield is
     free above/below. */
  @media (orientation: landscape) and (max-height: 540px) {
    .cluster {
      bottom: auto;
      top: 50%;
      transform: translateY(-50%);
    }
  }

  /* touch-only: desktop plays with the keyboard */
  @media (pointer: fine) {
    .hud-overlay { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    button:active { transform: none; }
  }
</style>
