<script lang="ts">
  import '../app.css';
  let iframeLoaded = $state(false);
</script>

<svelte:head>
  <title>Presuntinho — Equivalenza Study Hub</title>
  <meta name="description" content="Interactive study hub for Fatma's BCOBM311 Mid-Term on Equivalenza. Quizzes, lessons, audio, and a few surprises.">
</svelte:head>

<div class="legacy-frame">
  {#if !iframeLoaded}
    <div class="loading">🐷 Loading Presuntinho…</div>
  {/if}
  <iframe
    src="/legacy/index.html"
    title="Presuntinho V3 — legacy site"
    onload={() => iframeLoaded = true}
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  ></iframe>
</div>

<style>
  .legacy-frame {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: var(--bg, #1f2e4a);
  }
  .legacy-frame iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--txt2, #cbd5e1);
    font-size: 1.25rem;
    z-index: 1;
    pointer-events: none;
  }
</style>