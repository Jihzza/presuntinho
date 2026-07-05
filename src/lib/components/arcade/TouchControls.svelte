<script lang="ts">
  // On-screen controls, shaped by the game's control scheme. Emits high-level
  // intents to the shell: onTurn (one-shot, snake/maze), onHold (continuous,
  // steer/jump/paddle) and onAction (jump / launch). Pointer events with
  // capture so a finger sliding off a button still releases cleanly.
  import { t } from 'svelte-i18n';
  import type { ControlScheme, Direction } from '$lib/arcade/engine';

  interface Props {
    control: ControlScheme;
    onTurn: (dir: Direction) => void;
    onHold: (dir: Direction, down: boolean) => void;
    onAction: (down: boolean) => void;
  }
  let { control, onTurn, onHold, onAction }: Props = $props();

  function hold(dir: Direction) {
    return {
      onpointerdown: (e: PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onHold(dir, true);
      },
      onpointerup: () => onHold(dir, false),
      onpointercancel: () => onHold(dir, false),
      onpointerleave: (e: PointerEvent) => {
        if (e.buttons) onHold(dir, false);
      }
    };
  }

  function actionHandlers() {
    return {
      onpointerdown: (e: PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onAction(true);
      },
      onpointerup: () => onAction(false),
      onpointercancel: () => onAction(false)
    };
  }
</script>

<div class="touch" data-scheme={control}>
  {#if control === 'turn'}
    <div class="dpad" role="group" aria-label={$t('arcade.controls.aria', { default: 'Controlos' })}>
      <button type="button" class="up" aria-label={$t('arcade.controls.up', { default: 'Cima' })} onpointerdown={() => onTurn('up')}>↑</button>
      <button type="button" class="left" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} onpointerdown={() => onTurn('left')}>←</button>
      <button type="button" class="right" aria-label={$t('arcade.controls.right', { default: 'Direita' })} onpointerdown={() => onTurn('right')}>→</button>
      <button type="button" class="down" aria-label={$t('arcade.controls.down', { default: 'Baixo' })} onpointerdown={() => onTurn('down')}>↓</button>
    </div>
    <p class="hint">{$t('arcade.controls.swipe_hint', { default: 'Também podes deslizar no ecrã.' })}</p>
  {:else}
    <div class="pad" role="group" aria-label={$t('arcade.controls.aria', { default: 'Controlos' })}>
      <button type="button" class="side" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} {...hold('left')}>←</button>
      {#if control === 'jump'}
        <button type="button" class="act" {...actionHandlers()}>{$t('arcade.controls.jump', { default: 'Saltar' })}</button>
      {:else if control === 'paddle'}
        <button type="button" class="act" {...actionHandlers()}>{$t('arcade.controls.launch', { default: 'Lançar' })}</button>
      {:else}
        <span class="act-spacer" aria-hidden="true"></span>
      {/if}
      <button type="button" class="side" aria-label={$t('arcade.controls.right', { default: 'Direita' })} {...hold('right')}>→</button>
    </div>
    <p class="hint">
      {#if control === 'paddle'}
        {$t('arcade.controls.drag_hint', { default: 'Arrasta o dedo no ecrã para mover a base.' })}
      {:else}
        {$t('arcade.controls.hold_hint', { default: 'Mantém premido para andar.' })}
      {/if}
    </p>
  {/if}
</div>

<style>
  .touch {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0 0;
  }
  .hint {
    margin: 0;
    color: var(--txt3, #94a3b8);
    font-size: 0.74rem;
    text-align: center;
  }
  button {
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
    user-select: none;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  button:active {
    background: rgba(103, 232, 249, 0.28);
    transform: scale(0.96);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.5);
  }
  /* D-pad (turn games) */
  .dpad {
    display: grid;
    grid-template-columns: repeat(3, 60px);
    grid-template-rows: repeat(3, 60px);
    gap: 0.3rem;
  }
  .dpad button {
    border-radius: 0.85rem;
    font-size: 1.5rem;
  }
  .dpad .up { grid-area: 1 / 2; }
  .dpad .left { grid-area: 2 / 1; }
  .dpad .right { grid-area: 2 / 3; }
  .dpad .down { grid-area: 3 / 2; }
  /* side + action (steer / jump / paddle) */
  .pad {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    max-width: 420px;
  }
  .side {
    height: 68px;
    border-radius: 1rem;
    font-size: 1.6rem;
  }
  .act {
    min-width: 108px;
    height: 68px;
    border-radius: 1rem;
    font-size: 1.05rem;
    background: linear-gradient(135deg, #fb7185, #a78bfa);
    border-color: transparent;
  }
  .act-spacer { width: 108px; }
  @media (min-width: 640px) {
    .dpad { grid-template-columns: repeat(3, 66px); grid-template-rows: repeat(3, 66px); }
  }
</style>
