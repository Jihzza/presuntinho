<script lang="ts">
  /**
   * +error.svelte — friendly pt-PT error page (Phase 13).
   *
   * Shown by SvelteKit when a route errors (404, 500, etc.).
   * Uses Svelte 5 runes. Dark, centred card, link back to the Hub.
   */

  import { page } from '$app/state';

  // `page.status` and `page.error.message` are reactive in SvelteKit.
  let status = $derived(page.status ?? 500);
  let message = $derived(page.error?.message ?? 'Erro desconhecido.');

  // Pick a friendly title + subtitle per status range.
  let title = $derived(
    status === 404
      ? 'Página não encontrada'
      : status === 403
        ? 'Acesso negado'
        : status >= 500
          ? 'Erro no servidor'
          : 'Algo correu mal'
  );

  let subtitle = $derived(
    status === 404
      ? 'O caminho que procuraste não existe — mas o Hub continua aqui.'
      : status >= 500
        ? 'Tenta outra vez. Se persistir, exporta os teus dados em Definições.'
        : 'Pequeno tropeção. Clica abaixo para voltar.'
  );

  function goHub(): void {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }
</script>

<svelte:head>
  <title>{status} · {title} · Presuntinho</title>
  <meta name="description" content="Página de erro do Presuntinho." />
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="error-page">
  <div class="card">
    <p class="status" aria-label="Código de erro {status}">{status}</p>
    <h1>🐷 {title}</h1>
    <p class="subtitle">{subtitle}</p>
    <details class="detail">
      <summary>Detalhes técnicos</summary>
      <p class="msg">{message}</p>
    </details>
    <button type="button" class="cta" onclick={goHub} aria-label="Voltar ao Hub">
      ← Voltar ao Hub
    </button>
  </div>
</div>

<style>
  .error-page {
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg, #1f2e4a);
    color: var(--txt, #fff);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem;
  }
  .card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
    border-radius: 1rem;
    padding: 2rem 1.5rem;
    max-width: 480px;
    width: 100%;
    text-align: center;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }
  .status {
    display: inline-block;
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--accent, #ec4899);
    background: rgba(236, 72, 153, 0.12);
    border: 1px solid rgba(236, 72, 153, 0.4);
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    margin: 0 0 1rem 0;
  }
  h1 {
    font-size: var(--fs-xl, 1.5rem);
    margin: 0 0 0.5rem 0;
    color: var(--txt, #fff);
  }
  .subtitle {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1.25rem 0;
    font-size: var(--fs-base, 1rem);
  }
  .detail {
    text-align: left;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 0 0 1.5rem 0;
    color: var(--txt2, #cbd5e1);
    font-size: 0.875rem;
  }
  .detail summary {
    cursor: pointer;
    color: var(--txt, #fff);
    font-weight: 600;
    padding: 0.25rem 0;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .detail[open] summary {
    margin-bottom: 0.5rem;
  }
  .msg {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.8125rem;
    word-break: break-word;
    color: var(--txt3, #94a3b8);
  }
  .cta {
    background: var(--accent, #ec4899);
    color: #fff;
    border: 0;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: var(--fs-base, 1rem);
    cursor: pointer;
    min-height: 44px;
    min-width: 44px;
    transition: background 0.2s ease, transform 0.15s ease;
  }
  .cta:hover,
  .cta:focus-visible {
    background: var(--accent-hover, #db2777);
    outline: none;
  }
  .cta:focus-visible {
    box-shadow: 0 0 0 2px #fff;
  }
  .cta:active {
    transform: scale(0.97);
  }
  @media (prefers-reduced-motion: reduce) {
    .cta,
    .cta:active {
      transition: none;
      transform: none;
    }
  }
</style>
