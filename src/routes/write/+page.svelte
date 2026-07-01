<script lang="ts">
  // Write — Writing Tips & Anti-AI Detection (V4 port of V3 #pg-write).
  // All 5 tip cards now i18n-driven via $t(); content lives in
  // src/lib/i18n/<locale>.json under write.tips.<slug>.* keys.

  import { t } from 'svelte-i18n';

  // Slugs must match the keys in the i18n JSON: write.tips.variation.*, etc.
  const TIP_SLUGS = ['variation', 'voice', 'buzzwords', 'examples', 'hedging'] as const;
</script>

<svelte:head>
  <title>{$t('write.head.title', { default: 'Writing · Tips Anti-AI' })} · Presuntinho</title>
</svelte:head>

<div class="write">
  <header class="write-head">
    <p class="breadcrumb">
      <a href="/">{$t('write.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('write.breadcrumb.current', { default: 'Writing' })}</span>
    </p>
    <span class="tag">{$t('routes.write.modulo_tag', { default: 'Módulo 5' })}</span>
    <h1>{$t('write.head.h1', { default: '✍️ Writing Tips & Anti-AI Detection' })}</h1>
    <p class="sub">{$t('routes.write.subtitle', { default: 'Como escrever Q3-Q5 que soem a ti, não a um bot.' })}</p>
  </header>

  <section class="grid" aria-label="{$t('a11y.aria.tips_de_escrita', { default: 'Tips de escrita' })}">
    {#each TIP_SLUGS as slug (slug)}
      {@const points = $t(`write.tips.${slug}.points`) as unknown as unknown[]}
      <article class="tip-card">
        <h2>
          <span class="icon" aria-hidden="true">{$t(`write.tips.${slug}.icon`)}</span>
          {$t(`write.tips.${slug}.title`)}
        </h2>
        {#if $t(`write.tips.${slug}.problem`, { default: '' })}
          <p class="problem">{$t(`write.tips.${slug}.problem`)}</p>
        {/if}
        {#if $t(`write.tips.${slug}.fix`, { default: '' })}
          <p class="fix-label"><strong>{$t(`write.tips.${slug}.fix`)}</strong></p>
        {/if}
        <ul>
          {#each Array.isArray(points) ? points : [points] as p, i (i)}
            <li>{p}</li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>

  <div class="cta">
    <a href="/pt/" class="btn primary">{$t('write.cta.next', { default: 'Seguinte: Lições em PT →' })}</a>
  </div>
</div>

<style>
  .write {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .write-head { margin-bottom: 1.5rem; }
  .write-head h1 {
    color: #fff;
    margin: 0.25rem 0 0.5rem;
    font-size: 2rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.5);
    color: #a7f3d0;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .tip-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--accent, #10b981);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .tip-card h2 {
    color: #fff;
    font-size: 1.15rem;
    margin: 0 0 0.5rem;
  }
  .icon { margin-right: 0.25rem; }
  .problem {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0;
    font-size: 0.92rem;
    line-height: 1.55;
  }
  .fix-label {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0 0.25rem;
  }
  .tip-card ul {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0 0 1.25rem;
    padding: 0;
  }
  .tip-card ul li {
    margin: 0.3rem 0;
    line-height: 1.5;
    font-size: 0.92rem;
  }

  .cta { text-align: center; margin-top: 1.5rem; }
  .btn {
    display: inline-block;
    padding: 0.65rem 1.4rem;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
    transition: background 0.15s;
  }
  .btn.primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn.primary:hover { background: #d63780; }
</style>
