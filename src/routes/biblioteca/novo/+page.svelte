<!--
  /biblioteca/novo — create bookmark form.

  Fields:
    - title       (required, max 120 chars)
    - url         (required, must be a parseable URL with http/https scheme)
    - description (optional, max 500 chars)
    - tags        (comma-separated string, parsed via parseTagsInput())

  Submit → addItem() → navigate back to the biblioteca list.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
    import { addItem, parseTagsInput } from '$lib/biblioteca';
    import { showToast } from '$lib/components/events';
    import { t } from 'svelte-i18n';

  let title = $state('');
  let url = $state('');
  let description = $state('');
  let tagsInput = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  /**
   * Lightweight URL validator.  We require:
   *   - the URL constructor parses successfully
   *   - the protocol is http or https (no file://, javascript:, etc.)
   *
   * This is intentionally permissive about query strings, fragments,
   * ports, IDN hosts, etc. — the user knows what they're pasting.
   */
  function isValidUrl(value: string): boolean {
    if (!value) return false;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    error = null;

    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    const trimmedDesc = description.trim();

    if (!trimmedTitle) {
      error = $t('error.o_titulo_obrigatorio', { default: 'O título é obrigatório.' });
      return;
    }
    if (trimmedTitle.length > 120) {
      error = $t('error.titulo_demasiado_longo_max_120', { default: 'Título demasiado longo (máx. 120 caracteres).' });
      return;
    }
    if (!isValidUrl(trimmedUrl)) {
      error = $t('error.o_url_tem_de_comecar_por_http', { default: 'O URL tem de começar por http:// ou https://.' });
      return;
    }
    if (trimmedDesc.length > 500) {
      error = $t('error.descricao_demasiado_longa_max_500', { default: 'Descrição demasiado longa (máx. 500 caracteres).' });
      return;
    }

    const parsedTags = parseTagsInput(tagsInput);
    if (parsedTags.length > 10) {
      error = $t('error.maximo_de_10_tags_por_marcador', { default: 'Máximo de 10 tags por marcador.' });
      return;
    }

    submitting = true;
    try {
      await addItem({
        title: trimmedTitle,
        url: trimmedUrl,
        description: trimmedDesc,
        tags: parsedTags
      });
      showToast('Marcador criado');
      goto('/biblioteca/');
    } catch (e) {
      console.error('[biblioteca] addItem failed', e);
      error = e instanceof Error ? e.message : 'Erro a criar marcador';
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t('routes.biblioteca.new.title', { default: 'Novo Marcador' })} · {$t('routes.biblioteca.title', { default: 'Biblioteca' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.biblioteca.new.metaDescription', { default: 'Adicionar novo marcador' })} />
  <meta property="og:title" content={`${$t('routes.biblioteca.new.title', { default: 'Novo Marcador' })} · ${$t('routes.biblioteca.title', { default: 'Biblioteca' })}`} />
  <meta property="og:description" content={$t('routes.biblioteca.new.metaDescription', { default: 'Adicionar novo marcador' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/biblioteca/novo/" />
  <meta name="twitter:title" content={`${$t('routes.biblioteca.new.title', { default: 'Novo Marcador' })} · ${$t('routes.biblioteca.title', { default: 'Biblioteca' })}`} />
  <meta name="twitter:description" content={$t('routes.biblioteca.new.metaDescription', { default: 'Adicionar novo marcador' })} />
</svelte:head>

<div class="novo">
  <header class="hero">
    <h1>➕ Novo marcador</h1>
    <p class="sub">{$t('biblioteca.novo.hero.sub', { default: 'Guarda um link com título, descrição e tags.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('biblioteca.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('biblioteca.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/biblioteca/">{$t('biblioteca.novo.breadcrumb.home', { default: '← Biblioteca' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('biblioteca.novo.breadcrumb.current', { default: 'Novo' })}</span>
  </nav>

  <form class="form" onsubmit={handleSubmit} novalidate>
    <div class="field">
      <label for="bm-title">
        Título <span aria-hidden="true">*</span>
      </label>
      <input
        id="bm-title"
        type="text"
        bind:value={title}
        maxlength="120"
        required
        placeholder={$t('biblioteca.novo.placeholder.title', { default: 'Ex.: Python — functools.lru_cache' })}
        autocomplete="off"
      />
      <span class="hint">{$t('biblioteca.new.name.hint', { default: 'Como queres identificar este link?' })}</span>
    </div>

    <div class="field">
      <label for="bm-url">
        URL <span aria-hidden="true">*</span>
      </label>
      <input
        id="bm-url"
        type="url"
        bind:value={url}
        required
        placeholder={$t('biblioteca.novo.placeholder.url', { default: 'https://docs.python.org/3/library/functools.html' })}
        autocomplete="off"
        inputmode="url"
      />
      <span class="hint">{$t('biblioteca.novo.url.hint', { default: 'Tem de começar por http:// ou https://.' })}</span>
    </div>

    <div class="field">
      <label for="bm-desc">{$t('biblioteca.novo.label.description', { default: 'Descrição' })}</label>
      <textarea
        id="bm-desc"
        bind:value={description}
        maxlength="500"
        rows="4"
        placeholder={$t('biblioteca.novo.notes.placeholder', { default: 'Notas pessoais, porquê que guardaste, capítulos a ler…' })}
      ></textarea>
      <span class="hint">{description.length}/500</span>
    </div>

    <div class="field">
      <label for="bm-tags">{$t('biblioteca.novo.label.tags', { default: 'Tags' })}</label>
      <input
        id="bm-tags"
        type="text"
        bind:value={tagsInput}
        placeholder={$t('biblioteca.novo.placeholder.tags', { default: 'python, docs, performance' })}
        autocomplete="off"
      />
      <span class="hint">{$t('biblioteca.new.tags.hint', { default: 'Separa com vírgulas. Até 10 tags por marcador.' })}</span>
    </div>

    {#if error}
      <p class="error" role="alert">⚠️ {error}</p>
    {/if}

    <div class="actions">
      <a class="btn-secondary" href="/biblioteca/">{$t('biblioteca.novo.action.cancel', { default: 'Cancelar' })}</a>
      <button type="submit" class="btn-primary" disabled={submitting}>
        {submitting ? 'A criar…' : 'Criar marcador'}
      </button>
    </div>
  </form>
</div>

<style>
  .novo {
    max-width: 560px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .hero {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: var(--txt, #fff);
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .form {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    border: 0;
    padding: 0;
    margin: 0;
  }
  .field label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--txt, #fff);
  }
  .field input[type='text'],
  .field input[type='url'],
  .field textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
    box-sizing: border-box;
  }
  .field textarea {
    resize: vertical;
    min-height: 5rem;
    line-height: 1.5;
  }
  .field input:focus-visible,
  .field textarea:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.25);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
  }
  .error {
    margin: 0;
    padding: 0.625rem 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--error, #ef4444);
    border-radius: 0.5rem;
    color: var(--error, #ef4444);
    font-size: 0.875rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-secondary {
    display: inline-block;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    border: 0;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
  }
  .btn-primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    background: #d63384;
    outline: none;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .btn-secondary {
    background: transparent;
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt, #fff);
    outline: none;
  }
  @media (min-width: 640px) {
    .novo {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .btn-primary,
    .btn-secondary { transition: none; }
  }
</style>