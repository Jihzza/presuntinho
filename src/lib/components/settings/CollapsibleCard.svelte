<script lang="ts">
  /**
   * CollapsibleCard — an expandable settings section.
   *
   * A settings group that shows only its title + a one-line preview of the
   * current value when collapsed, and expands on tap to reveal all its options.
   * Keeps the Definições page short when a group has many choices (themes, app
   * icon, mascot…) instead of laying every option out at once.
   *
   * Height animates with the pure-CSS grid-rows 0fr→1fr trick (no JS measuring),
   * and the collapsed body is `inert` so its controls are skipped by tab/AT.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** One-line summary shown while collapsed (e.g. the current theme name). */
    preview?: string;
    /** Start expanded. */
    open?: boolean;
    /** Icon snippet (a lucide component, usually). */
    icon?: Snippet;
    children?: Snippet;
    /** Stable id for aria-controls. */
    id?: string;
  }
  let { title, preview = '', open = $bindable(false), icon, children, id }: Props = $props();
  const bodyId = $derived(id ? `${id}-body` : undefined);
</script>

<section class="ccard card" class:open>
  <button
    type="button"
    class="ccard-head"
    aria-expanded={open}
    aria-controls={bodyId}
    onclick={() => (open = !open)}
  >
    {#if icon}<span class="icon-wrap">{@render icon()}</span>{/if}
    <span class="ccard-titles">
      <h2 {id}>{title}</h2>
      {#if preview}<small class="ccard-preview">{preview}</small>{/if}
    </span>
    <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>
  <div class="ccard-body" id={bodyId}>
    <div class="ccard-inner" inert={!open}>
      {@render children?.()}
    </div>
  </div>
</section>

<style>
  .ccard {
    padding: 0;
    overflow: clip;
  }
  .ccard-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: var(--space-4, 1rem);
    background: transparent;
    border: 0;
    color: var(--txt);
    font: inherit;
    text-align: start;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .ccard-head:hover {
    background: var(--card-hover, transparent);
  }
  .ccard-head:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt));
    outline-offset: -3px;
  }
  .icon-wrap {
    display: inline-flex;
    color: var(--accent);
    flex-shrink: 0;
  }
  .ccard-titles {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }
  .ccard-titles h2 {
    margin: 0;
    font-size: var(--fs-md, 1rem);
    font-weight: 700;
  }
  .ccard-preview {
    color: var(--txt3);
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    flex-shrink: 0;
    color: var(--txt3);
    transition: transform 0.24s ease;
  }
  .ccard.open .chevron {
    transform: rotate(180deg);
  }
  /* Pure-CSS height animation: 0fr → 1fr. */
  .ccard-body {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.28s ease;
  }
  .ccard.open .ccard-body {
    grid-template-rows: 1fr;
  }
  .ccard-inner {
    overflow: hidden;
    min-height: 0;
  }
  /* Padding lives on an inner wrapper so it collapses to zero cleanly. */
  .ccard-inner :global(.ccard-content) {
    padding: 0 var(--space-4, 1rem) var(--space-4, 1rem);
  }
  @media (prefers-reduced-motion: reduce) {
    .ccard-body { transition: none; }
    .chevron { transition: none; }
  }
</style>
