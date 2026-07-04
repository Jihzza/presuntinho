<script lang="ts">
  import type { SubApp, V3ContentEntry } from '$lib/registry';
  import { t } from 'svelte-i18n';

  interface Props {
    app: SubApp;
    /** Optional V3 content override (alternative shape used by the 7 native
     *  content routes — `href`/`title`/`accent`/`description` + `tagline`). */
    v3?: V3ContentEntry;
    /** Optional href/title override when not using either registry shape. */
    href?: string;
    title?: string;
    description?: string;
    tagline?: string;
  }
  let { app, v3, href, title, description, tagline }: Props = $props();

  // Resolve display values: prefer v3 entry, fall back to app, then to props.
  let resolvedHref = $derived(
    v3?.href ?? app.route ?? href ?? '#'
  );
  // Resolve i18n-aware title/description from `hub.app.<id>.name/description`
  // (defaults to the registry value if the key is missing).
  let resolvedTitle = $derived(
    v3?.title ??
    $t(`hub.app.${app.id}.name`, { default: app.name }) ??
    title ??
    ''
  );
  let resolvedDesc = $derived(
    v3?.description ??
    $t(`hub.app.${app.id}.description`, { default: app.description }) ??
    description ??
    ''
  );
  let resolvedTagline = $derived(v3?.tagline ?? tagline ?? '');
  let resolvedIcon = $derived(v3?.icon ?? app.icon ?? '🔗');
  // Only override the accent when the registry provides one — otherwise the
  // card inherits the theme's global --accent token (setting
  // `--accent: var(--accent)` would be an invalid circular reference).
  let resolvedAccent = $derived(v3?.accent ?? app.color ?? null);
</script>

<a class="card" href={resolvedHref} style={resolvedAccent ? `--accent: ${resolvedAccent}` : undefined}>
  <div class="icon">{resolvedIcon}</div>
  <div class="content">
    <h2>{resolvedTitle}</h2>
    {#if resolvedTagline}
      <p class="tagline">{resolvedTagline}</p>
    {/if}
    <p>{resolvedDesc}</p>
  </div>
  <div class="arrow" aria-hidden="true">→</div>
</a>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 1.25rem var(--space-4);
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius-lg, 0.75rem);
    color: var(--txt);
    text-decoration: none;
    transition: transform var(--motion-fast, 150ms), background var(--motion-base, 200ms), border-color var(--motion-base, 200ms);
    min-height: 88px;
  }
  .card:hover,
  .card:focus-visible {
    background: var(--card-hover);
    transform: translateY(-2px);
  }
  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .icon {
    font-size: 2.5rem;
    line-height: 1;
    flex-shrink: 0;
    width: 3rem;
    text-align: center;
  }
  .content {
    flex: 1;
    min-width: 0;
  }
  .content h2 {
    font-size: var(--fs-md, 1.125rem);
    margin: 0 0 0.25rem 0;
    color: var(--txt);
  }
  .content p {
    font-size: var(--fs-sm, 0.875rem);
    margin: 0;
    color: var(--txt2);
  }
  .arrow {
    color: var(--accent);
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:hover { transform: none; }
  }
</style>