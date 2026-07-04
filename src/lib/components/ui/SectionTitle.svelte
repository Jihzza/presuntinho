<!--
  SectionTitle — design-system section heading primitive (V8).

  Small icon chip (emoji string or an `icon` snippet for lucide icons)
  next to an h2/h3. Give it an `id` so the parent section can point
  `aria-labelledby` at it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Heading text. */
    title: string;
    /** Heading level element. */
    as?: 'h2' | 'h3';
    /** id for aria-labelledby wiring. */
    id?: string;
    /** Decorative emoji shown in the icon chip. */
    emoji?: string;
    /** Custom icon snippet (e.g. a lucide-svelte icon). Wins over `emoji`. */
    icon?: Snippet;
    /** Extra classes appended to the root element. */
    class?: string;
  }

  let { title, as = 'h2', id, emoji, icon, class: extraClass = '' }: Props = $props();
</script>

<div class="section-title {extraClass}">
  {#if icon}
    <span class="st-icon" aria-hidden="true">{@render icon()}</span>
  {:else if emoji}
    <span class="st-icon" aria-hidden="true">{emoji}</span>
  {/if}
  <svelte:element this={as} {id} class="st-heading">{title}</svelte:element>
</div>

<style>
  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .st-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    font-size: var(--fs-base);
    flex-shrink: 0;
  }
  .st-heading {
    margin: 0;
    font-size: var(--fs-lg);
    line-height: 1.25;
    color: var(--txt);
  }
</style>
