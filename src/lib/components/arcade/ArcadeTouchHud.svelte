<script lang="ts">
  // Free-Fire-style touch HUD: a translucent movement pad pinned bottom-left
  // and an action button pinned bottom-right, floating OVER the canvas. The
  // container is pointer-events:none so bare taps fall through to the canvas
  // (swipe/drag stay alive); only the clusters capture pointers. Each button
  // captures its own pointerId, so left-thumb move + right-thumb action work
  // simultaneously (multi-touch). Layout is declared per game via move/action.
  import { t } from 'svelte-i18n';
  import type { Direction } from '$lib/arcade/engine';
  import type { HudAction, HudMove } from '$lib/arcade/games';

  interface Props {
    move: HudMove;
    action: HudAction;
    onTurn: (dir: Direction) => void;
    onHold: (dir: Direction, down: boolean) => void;
    onAction: (down: boolean) => void;
  }
  let { move, action, onTurn, onHold, onAction }: Props = $props();

  // held direction buttons (leftright): press-and-hold with clean release
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
  // one-shot direction (dpad turn games)
  function tap(dir: Direction) {
    return {
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault();
        onTurn(dir);
      }
    };
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

  const actionLabel = $derived(
    action === 'jump'
      ? $t('arcade.controls.jump', { default: 'Saltar' })
      : $t('arcade.controls.launch', { default: 'Lançar' })
  );
  const actionIcon = $derived(action === 'jump' ? '⤒' : '✦');
</script>

<div class="hud-overlay" aria-hidden="false">
  {#if move !== 'none'}
    <div class="cluster move" aria-label={$t('arcade.hud.move_aria', { default: 'Movimento' })} role="group">
      {#if move === 'dpad'}
        <div class="dpad">
          <span class="hub" aria-hidden="true"></span>
          <button type="button" class="d up" aria-label={$t('arcade.controls.up', { default: 'Cima' })} {...tap('up')}>▲</button>
          <button type="button" class="d left" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} {...tap('left')}>◀</button>
          <button type="button" class="d right" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...tap('right')}>▶</button>
          <button type="button" class="d down" aria-label={$t('arcade.controls.down', { default: 'Baixo' })} {...tap('down')}>▼</button>
        </div>
      {:else}
        <div class="rocker">
          <button type="button" class="r" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} {...hold('left')}>◀</button>
          <button type="button" class="r" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...hold('right')}>▶</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if action !== 'none'}
    <div class="cluster act" aria-label={$t('arcade.hud.action_aria', { default: 'Ação' })} role="group">
      <button type="button" class="action-btn" aria-label={actionLabel} {...actionHandlers}>
        <span class="a-icon" aria-hidden="true">{actionIcon}</span>
        <span class="a-label">{actionLabel}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  /* Fixed to the viewport: the clusters sit at the bottom corners over the
     footer, where the mascot (left) + heart (right) FABs normally live. The
     overlay itself is click-through; only the corner clusters catch pointers. */
  .hud-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 45;
  }
  .cluster {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom) + 4.5rem);
    pointer-events: auto;
    touch-action: none;
  }
  .cluster.move { left: max(0.8rem, env(safe-area-inset-left)); }
  .cluster.act { right: max(0.8rem, env(safe-area-inset-right)); }

  /* Touch-only: on real pointers we play with the keyboard + mini cluster. */
  @media (pointer: fine) {
    .hud-overlay { display: none; }
  }

  button {
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    color: #fff;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--accent, #67e8f9) 55%, rgba(255, 255, 255, 0.25));
    background: color-mix(in srgb, var(--accent, #67e8f9) 16%, rgba(10, 16, 30, 0.55));
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    transition: transform 90ms ease, background 90ms ease, box-shadow 90ms ease;
  }
  button:active {
    transform: scale(0.9);
    background: color-mix(in srgb, var(--accent, #67e8f9) 42%, rgba(10, 16, 30, 0.55));
    box-shadow: 0 0 18px color-mix(in srgb, var(--accent, #67e8f9) 70%, transparent);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #67e8f9) 60%, transparent);
  }

  /* ── D-pad (sized to fit the control deck) ── */
  .dpad {
    position: relative;
    width: 132px;
    height: 132px;
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
    width: 44px;
    height: 44px;
    border-radius: 0.8rem;
    font-size: 1rem;
    display: grid;
    place-items: center;
  }
  .d.up { left: 44px; top: 0; }
  .d.down { left: 44px; bottom: 0; }
  .d.left { left: 0; top: 44px; }
  .d.right { right: 0; top: 44px; }

  /* ── left/right rocker ── */
  .rocker { display: flex; gap: 0.7rem; }
  .rocker .r {
    width: 66px;
    height: 66px;
    border-radius: 999px;
    font-size: 1.5rem;
    display: grid;
    place-items: center;
  }

  /* ── action button ── */
  .action-btn {
    width: 78px;
    height: 78px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    gap: 0.05rem;
    background: color-mix(in srgb, var(--accent, #f472b6) 28%, rgba(10, 16, 30, 0.5));
  }
  .a-icon { font-size: 1.5rem; line-height: 1; }
  .a-label { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.02em; }

  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    button:active { transform: none; }
  }
</style>
