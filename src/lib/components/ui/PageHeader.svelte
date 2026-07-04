<!--
  PageHeader — design-system page-top primitive (V8).

  Renders (in order):
    1. breadcrumbs — snippet with the caller's crumb links; falls back
       to a single "back" link when only `backHref` is given.
    2. title + optional subtitle (h1 — one per page).
    3. optional `actions` snippet aligned to the inline end (buttons).

  `align="center"` reproduces the centred hero look used by several
  existing routes so adoption doesn't shift their visual identity.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    /** Page title (rendered as <h1>). */
    title: string;
    /** Optional one-line subtitle under the title. */
    subtitle?: string;
    /** Simple back link — used when no `breadcrumbs` snippet is given. */
    backHref?: string;
    /** Label for the back link. Defaults to the shared "Voltar" string. */
    backLabel?: string;
    /** Title alignment. */
    align?: 'start' | 'center';
    /** Full breadcrumb trail (links + separators). */
    breadcrumbs?: Snippet;
    /** Action buttons rendered beside the title. */
    actions?: Snippet;
    /** Extra classes appended to the root element. */
    class?: string;
  }

  let {
    title,
    subtitle,
    backHref,
    backLabel,
    align = 'start',
    breadcrumbs,
    actions,
    class: extraClass = ''
  }: Props = $props();
</script>

<header class="ph ph--{align} {extraClass}">
  {#if breadcrumbs}
    <nav class="ph-crumbs" aria-label={$t('ui.breadcrumbs.aria', { default: 'Caminho de navegação' })}>
      {@render breadcrumbs()}
    </nav>
  {:else if backHref}
    <nav class="ph-crumbs" aria-label={$t('ui.breadcrumbs.aria', { default: 'Caminho de navegação' })}>
      <a href={backHref}>← {backLabel ?? $t('common.back', { default: 'Voltar' })}</a>
    </nav>
  {/if}

  <div class="ph-body">
    <div class="ph-copy">
      <h1 class="ph-title">{title}</h1>
      {#if subtitle}
        <p class="ph-subtitle">{subtitle}</p>
      {/if}
    </div>
    {#if actions}
      <div class="ph-actions">{@render actions()}</div>
    {/if}
  </div>
</header>

<style>
  .ph {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .ph-crumbs {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: var(--fs-sm);
    color: var(--txt3);
  }
  /* Crumb children come from the caller's snippet → style via :global. */
  .ph-crumbs > :global(a) {
    color: var(--accent);
    text-decoration: none;
    min-height: var(--touch-target, 44px);
    display: inline-flex;
    align-items: center;
  }
  .ph-crumbs > :global(a:hover),
  .ph-crumbs > :global(a:focus-visible) {
    text-decoration: underline;
  }
  .ph-crumbs > :global([aria-current='page']) {
    color: var(--txt2);
  }
  .ph-body {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  .ph-copy {
    min-width: 0;
  }
  .ph-title {
    margin: 0;
    font-size: var(--fs-2xl);
    line-height: 1.2;
    color: var(--txt);
    overflow-wrap: anywhere;
  }
  .ph-subtitle {
    margin: var(--space-2) 0 0;
    font-size: var(--fs-base);
    color: var(--txt2);
  }
  .ph-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  /* Centred hero variant (used by Biblioteca & friends). */
  .ph--center .ph-body {
    justify-content: center;
    text-align: center;
  }
  .ph--center .ph-crumbs {
    justify-content: flex-start;
  }
</style>
