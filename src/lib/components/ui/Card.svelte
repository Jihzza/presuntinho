<!--
  Card — design-system surface primitive (V8).

  Always carries the global class "card" so the per-theme repair layer
  in app.css keeps applying (backgrounds, borders, shadows per theme).

  Variants:
    * default  — var(--card) surface + var(--border)
    * elevated — same surface + var(--shadow-md) lift
    * ghost    — transparent surface, border only (for quiet groupings)

  `as` lets callers keep semantic markup (section/article/li) without
  losing the shared styling. All extra attributes (aria-*, id, role,
  data-*) pass through via rest props.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Visual variant. */
    variant?: 'default' | 'elevated' | 'ghost';
    /** Element to render (keeps semantics without losing styling). */
    as?: 'div' | 'section' | 'article' | 'aside' | 'li';
    /** Disable the built-in padding (for media / list cards). */
    padded?: boolean;
    /** Extra classes appended to the root element. */
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  }

  let {
    variant = 'default',
    as = 'div',
    padded = true,
    class: extraClass = '',
    children,
    ...rest
  }: Props = $props();
</script>

<svelte:element
  this={as}
  class="card ui-card ui-card--{variant} {extraClass}"
  class:ui-card--flush={!padded}
  {...rest}
>
  {@render children?.()}
</svelte:element>

<style>
  .ui-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    color: var(--txt);
  }
  .ui-card--flush {
    padding: 0;
  }
  .ui-card--elevated {
    box-shadow: var(--shadow-md, 0 10px 30px rgba(2, 6, 23, 0.18));
  }
  .ui-card--ghost {
    background: transparent;
  }
</style>
