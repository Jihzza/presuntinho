<!--
  Button — design-system action primitive (V8).

  * Variants: primary (accent fill), secondary (quiet surface),
    danger (error fill), ghost (transparent).
  * Sizes: sm / md / lg — md meets the 44px touch-target baseline.
  * Renders an <a> when `href` is provided (and not disabled),
    otherwise a <button type="button"> by default.
  * All extra attributes (onclick, aria-*, form, title, …) pass
    through via rest props.
  * Focus ring uses the global --focus-ring token; hover motion uses
    --motion-fast and is killed globally by prefers-reduced-motion.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Visual variant. */
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    /** Size: `md` (default) is the 44px touch baseline. */
    size?: 'sm' | 'md' | 'lg';
    /** Native button type (ignored when `href` is set). */
    type?: 'button' | 'submit' | 'reset';
    /** Renders an <a> instead of a <button>. */
    href?: string;
    disabled?: boolean;
    /** Stretch to the container's full width. */
    block?: boolean;
    /** Extra classes appended to the root element. */
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    href,
    disabled = false,
    block = false,
    class: extraClass = '',
    children,
    ...rest
  }: Props = $props();
</script>

{#if href && !disabled}
  <a
    {href}
    class="ui-btn ui-btn--{variant} ui-btn--{size} {extraClass}"
    class:ui-btn--block={block}
    {...rest}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    {type}
    {disabled}
    class="ui-btn ui-btn--{variant} ui-btn--{size} {extraClass}"
    class:ui-btn--block={block}
    {...rest}
  >
    {@render children?.()}
  </button>
{/if}

<style>
  .ui-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--motion-fast, 120ms) ease,
      color var(--motion-fast, 120ms) ease,
      border-color var(--motion-fast, 120ms) ease,
      transform var(--motion-fast, 120ms) ease;
  }
  .ui-btn:focus-visible {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: var(--focus-ring);
  }

  /* Sizes — md is the 44px WCAG touch baseline. */
  .ui-btn--sm {
    min-height: 38px;
    font-size: var(--fs-sm);
    padding: 0 var(--space-3);
  }
  .ui-btn--md {
    min-height: var(--touch-target, 44px);
    font-size: var(--fs-base);
  }
  .ui-btn--lg {
    min-height: 52px;
    font-size: var(--fs-md);
    padding: 0 var(--space-5);
  }
  .ui-btn--block {
    display: flex;
    width: 100%;
  }

  /* Variants */
  .ui-btn--primary {
    background: var(--accent);
    color: var(--on-accent, #fff);
  }
  .ui-btn--primary:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }
  .ui-btn--secondary {
    background: var(--card);
    color: var(--txt);
    border-color: var(--border-strong);
  }
  .ui-btn--secondary:hover:not(:disabled) {
    background: var(--card-hover);
  }
  .ui-btn--danger {
    background: var(--error);
    color: var(--on-accent, #fff);
  }
  .ui-btn--danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 82%, black);
    transform: translateY(-1px);
  }
  .ui-btn--ghost {
    background: transparent;
    color: var(--txt2);
  }
  .ui-btn--ghost:hover:not(:disabled) {
    background: var(--card-hover);
    color: var(--txt);
  }

  .ui-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }
</style>
