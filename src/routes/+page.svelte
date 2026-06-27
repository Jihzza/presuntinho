<script lang="ts">
  import HubCard from '$lib/components/HubCard.svelte';
  import { subApps, legacySubApp } from '$lib/registry';
</script>

<svelte:head>
  <title>Presuntinho — Hub</title>
</svelte:head>

<div class="hub">
  <header class="hub-hero">
    <h1>🐷 Olá, Fatma</h1>
    <p class="sub">Equivalenza Study Hub — escolhe por onde começar</p>
  </header>

  <section class="apps" aria-label="Sub-apps">
    <h2 class="section-title">Apps</h2>
    <div class="grid">
      {#each subApps as app (app.id)}
        <HubCard {app} />
      {/each}
    </div>
  </section>

  <section class="legacy-section" aria-label="Site V3 preservado">
    <h2 class="section-title">Site original</h2>
    <p class="legacy-desc">O site V3 está preservado e reachable. A migração para SvelteKit está em curso.</p>
    <HubCard app={legacySubApp} />
  </section>
</div>

<style>
  .hub {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .hub-hero {
    margin-bottom: 2rem;
    text-align: center;
  }
  .hub-hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #fff;
  }
  .sub {
    color: #cbd5e1;
    margin: 0;
    font-size: 1rem;
  }
  .apps,
  .legacy-section {
    margin-bottom: 2rem;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    margin: 0 0 0.75rem 0.25rem;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .legacy-desc {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0 0 0.75rem 0.25rem;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1024px) {
    .hub {
      padding: 2rem 1.5rem 3rem;
    }
    .hub-hero h1 {
      font-size: 2.5rem;
    }
  }
</style>