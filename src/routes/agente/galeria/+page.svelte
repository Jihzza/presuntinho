<script lang="ts">
  /**
   * /agente/galeria — everything ever shared in the agent chat, across
   * ALL conversations (V9).
   *
   *   - Imagens:   responsive thumbnail grid (object URLs, cached per
   *                message and revoked on destroy — no per-render leak).
   *   - Áudio:     list with inline players.
   *   - Ficheiros: list with download links (anchor + `download` attr).
   *   - Links:     every https?:// URL found in message TEXT, newest
   *                first, deduplicated, with domain + snippet, opening
   *                in a new tab.
   *
   * Data comes from src/lib/agent/db.ts (listAllAttachments /
   * listAllMessages) — loaded in onMount, browser-only.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import {
    listAllAttachments,
    listAllMessages,
    type AttachmentEntry
  } from '$lib/agent/db';
  import { initStores } from '$lib/state/stores';
  import { getSession } from '$lib/auth/session';

  type Tab = 'imagens' | 'videos' | 'audio' | 'ficheiros' | 'links';

  interface LinkEntry {
    url: string;
    domain: string;
    snippet: string;
    createdAt: number;
  }

  let tab = $state<Tab>('imagens');
  let attachments = $state<AttachmentEntry[]>([]);
  let links = $state<LinkEntry[]>([]);
  let loaded = $state(false);

  const dateLocale = $derived($locale || 'pt-PT');

  const images = $derived(attachments.filter((a) => a.message.attachment?.kind === 'image' && a.message.attachment.blob));
  const videos = $derived(attachments.filter((a) => a.message.attachment?.kind === 'video' && a.message.attachment.blob));
  const audios = $derived(attachments.filter((a) => a.message.attachment?.kind === 'audio' && a.message.attachment.blob));
  const files = $derived(attachments.filter((a) => a.message.attachment?.kind === 'file'));

  // Object-URL cache: one URL per message attachment, created lazily on
  // first render and revoked on destroy — avoids the caderno leak
  // pattern of calling URL.createObjectURL on every render pass.
  const objectUrls = new Map<number, string>();

  function urlFor(entry: AttachmentEntry): string | null {
    const id = entry.message.id;
    const blob = entry.message.attachment?.blob;
    if (id === undefined || !blob) return null;
    let url = objectUrls.get(id);
    if (!url) {
      url = URL.createObjectURL(blob);
      objectUrls.set(id, url);
    }
    return url;
  }

  onDestroy(() => {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
  });

  const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

  function extractLinks(msgs: { content: string; createdAt: number }[]): LinkEntry[] {
    // msgs arrive newest-first; dedupe by URL keeping the newest hit.
    const seen = new Set<string>();
    const out: LinkEntry[] = [];
    for (const m of msgs) {
      for (const raw of m.content.match(URL_RE) ?? []) {
        // Trim trailing punctuation that regularly ends sentences.
        const url = raw.replace(/[.,;:!?]+$/, '');
        if (seen.has(url)) continue;
        seen.add(url);
        let domain = '';
        try {
          domain = new URL(url).hostname;
        } catch {
          continue; // not a parseable URL after all
        }
        const snippet = m.content.length > 110 ? `${m.content.slice(0, 110)}…` : m.content;
        out.push({ url, domain, snippet, createdAt: m.createdAt });
      }
    }
    return out;
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString(dateLocale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onMount(() => {
    void (async () => {
      try {
        const session = getSession();
        if (session) await initStores(session.profile);
        const [atts, msgs] = await Promise.all([listAllAttachments(), listAllMessages()]);
        attachments = atts;
        links = extractLinks(msgs);
      } catch (e) {
        console.error('[galeria] failed to load media', e);
      } finally {
        loaded = true;
      }
    })();
  });

  const TABS: { id: Tab; icon: string; key: string; fallback: string }[] = [
    { id: 'imagens',   icon: '🖼️', key: 'agente.galeria.tab.imagens',   fallback: 'Imagens' },
    { id: 'videos',    icon: '🎬', key: 'agente.galeria.tab.videos',    fallback: 'Vídeos' },
    { id: 'audio',     icon: '🎤', key: 'agente.galeria.tab.audio',     fallback: 'Áudio' },
    { id: 'ficheiros', icon: '📄', key: 'agente.galeria.tab.ficheiros', fallback: 'Ficheiros' },
    { id: 'links',     icon: '🔗', key: 'agente.galeria.tab.links',     fallback: 'Links' }
  ];

  function countFor(id: Tab): number {
    if (id === 'imagens') return images.length;
    if (id === 'videos') return videos.length;
    if (id === 'audio') return audios.length;
    if (id === 'ficheiros') return files.length;
    return links.length;
  }
</script>

<svelte:head>
  <title>{$t('agente.galeria.title', { default: 'Galeria' })} — Presuntinho</title>
</svelte:head>

<div class="galeria-root">
  <header class="galeria-head">
    <a class="back" href="/agente">← {$t('agente.galeria.back', { default: 'Voltar ao agente' })}</a>
    <h1>🖼️ {$t('agente.galeria.title', { default: 'Galeria' })}</h1>
    <p class="subtitle">{$t('agente.galeria.subtitle', { default: 'Tudo o que já partilhaste no chat 💕' })}</p>
  </header>

  <div class="tabs" role="tablist" aria-label={$t('agente.galeria.title', { default: 'Galeria' })}>
    {#each TABS as tb (tb.id)}
      <button
        type="button"
        class="tab"
        class:active={tab === tb.id}
        role="tab"
        aria-selected={tab === tb.id}
        onclick={() => (tab = tb.id)}
      >
        {tb.icon} {$t(tb.key, { default: tb.fallback })}
        <span class="count">{countFor(tb.id)}</span>
      </button>
    {/each}
  </div>

  {#if !loaded}
    <p class="loading">{$t('agente.galeria.loading', { default: 'A carregar…' })}</p>
  {:else if tab === 'imagens'}
    {#if images.length === 0}
      <div class="empty card">
        <span class="empty-icon">🖼️</span>
        <p>{$t('agente.galeria.empty.imagens', { default: 'Ainda não há imagens no chat. Envia a primeira! 📎' })}</p>
      </div>
    {:else}
      <div class="img-grid">
        {#each images as entry (entry.message.id)}
          {@const url = urlFor(entry)}
          {#if url}
            <a class="thumb" href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt={entry.message.attachment?.name} loading="lazy" />
              <span class="thumb-caption">
                {#if entry.conversationTitle}
                  {$t('agente.galeria.em', { default: 'em {title}', values: { title: entry.conversationTitle } })} ·
                {/if}
                {formatDate(entry.message.createdAt)}
              </span>
            </a>
          {/if}
        {/each}
      </div>
    {/if}
  {:else if tab === 'videos'}
    {#if videos.length === 0}
      <div class="empty card">
        <span class="empty-icon">🎬</span>
        <p>{$t('agente.galeria.empty.videos', { default: 'Ainda não há vídeos no chat. Anexa um momento bonito! 🎬' })}</p>
      </div>
    {:else}
      <div class="video-grid">
        {#each videos as entry (entry.message.id)}
          {@const url = urlFor(entry)}
          {#if url}
            <article class="video-card card">
              <!-- Uploaded personal clips usually have no captions; keep controls + label. -->
              <!-- svelte-ignore a11y_media_has_caption -->
              <video controls src={url} aria-label={entry.message.attachment?.name}></video>
              <span class="media-name">🎬 {entry.message.attachment?.name}</span>
              <span class="media-sub">
                {#if entry.conversationTitle}
                  {$t('agente.galeria.em', { default: 'em {title}', values: { title: entry.conversationTitle } })} ·
                {/if}
                {formatDate(entry.message.createdAt)}
              </span>
            </article>
          {/if}
        {/each}
      </div>
    {/if}
  {:else if tab === 'audio'}
    {#if audios.length === 0}
      <div class="empty card">
        <span class="empty-icon">🎤</span>
        <p>{$t('agente.galeria.empty.audio', { default: 'Ainda não há áudios no chat. Grava uma mensagem! 🎙️' })}</p>
      </div>
    {:else}
      <ul class="media-list">
        {#each audios as entry (entry.message.id)}
          {@const url = urlFor(entry)}
          <li class="media-row card">
            <div class="media-meta">
              <span class="media-name">🎤 {entry.message.attachment?.name}</span>
              <span class="media-sub">
                {#if entry.conversationTitle}
                  {$t('agente.galeria.em', { default: 'em {title}', values: { title: entry.conversationTitle } })} ·
                {/if}
                {formatDate(entry.message.createdAt)}
              </span>
            </div>
            {#if url}
              <audio controls src={url}></audio>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === 'ficheiros'}
    {#if files.length === 0}
      <div class="empty card">
        <span class="empty-icon">📄</span>
        <p>{$t('agente.galeria.empty.ficheiros', { default: 'Ainda não há ficheiros no chat. Anexa um com o 📎!' })}</p>
      </div>
    {:else}
      <ul class="media-list">
        {#each files as entry (entry.message.id)}
          {@const url = urlFor(entry)}
          <li class="media-row card">
            <div class="media-meta">
              <span class="media-name">📄 {entry.message.attachment?.name}</span>
              <span class="media-sub">
                {#if entry.conversationTitle}
                  {$t('agente.galeria.em', { default: 'em {title}', values: { title: entry.conversationTitle } })} ·
                {/if}
                {formatDate(entry.message.createdAt)}
              </span>
            </div>
            {#if url}
              <a class="download" href={url} download={entry.message.attachment?.name}>
                ⬇ {$t('agente.galeria.download', { default: 'Descarregar' })}
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === 'links'}
    {#if links.length === 0}
      <div class="empty card">
        <span class="empty-icon">🔗</span>
        <p>{$t('agente.galeria.empty.links', { default: 'Ainda não há links no chat. Partilha um! 🌐' })}</p>
      </div>
    {:else}
      <ul class="media-list">
        {#each links as link (link.url)}
          <li class="media-row card link-row">
            <a
              class="link-main"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={$t('agente.galeria.open_link', { default: 'Abrir link' })}
            >
              <span class="link-domain">🔗 {link.domain}</span>
              <span class="link-url">{link.url}</span>
              <span class="media-sub">{link.snippet}</span>
              <span class="media-sub">{formatDate(link.createdAt)}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .galeria-root {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-4, 1rem) var(--space-4, 1rem) calc(6rem + env(safe-area-inset-bottom));
    color: var(--txt);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 1rem);
  }
  .galeria-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
  }
  .back {
    color: var(--accent);
    text-decoration: none;
    font-size: var(--fs-sm, 0.9rem);
    align-self: flex-start;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-sm, 0.5rem);
    padding-right: var(--space-2, 0.5rem);
  }
  .back:hover {
    text-decoration: underline;
  }
  .back:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .galeria-head h1 {
    margin: 0;
    font-size: var(--fs-xl, 1.4rem);
  }
  .subtitle {
    margin: 0;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.9rem);
  }
  .tabs {
    display: flex;
    gap: var(--space-2, 0.5rem);
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    flex: 0 0 auto;
    min-height: 44px;
    padding: 0 var(--space-3, 0.75rem);
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: var(--txt2);
    cursor: pointer;
    font-size: var(--fs-sm, 0.88rem);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
    transition: background var(--motion-fast, 120ms), border-color var(--motion-fast, 120ms);
  }
  .tab:hover {
    border-color: var(--accent);
  }
  .tab:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .tab.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent, #fff);
    font-weight: 600;
  }
  .count {
    font-size: var(--fs-xs, 0.72rem);
    opacity: 0.8;
  }
  .loading {
    color: var(--txt3);
    text-align: center;
    padding: var(--space-5, 1.5rem) 0;
  }
  .empty {
    text-align: center;
    padding: var(--space-6, 2rem) var(--space-4, 1rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 0.5rem);
  }
  .empty-icon {
    font-size: 2rem;
  }
  .empty p {
    margin: 0;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.92rem);
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 0.75rem);
  }
  .img-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-3, 0.75rem);
  }
  .thumb {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    text-decoration: none;
    color: var(--txt3);
    border-radius: var(--radius-md, 0.75rem);
  }
  .thumb:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .thumb img {
    width: 100%;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    border-radius: var(--radius-md, 0.75rem);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    display: block;
  }
  .thumb-caption {
    font-size: var(--fs-xs, 0.72rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .video-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3, 0.75rem);
  }
  .video-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-3, 0.75rem);
  }
  .video-card video {
    width: 100%;
    border-radius: var(--radius-md, 0.75rem);
    background: #000;
  }
  .media-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
  }
  .media-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-3, 0.75rem);
    flex-wrap: wrap;
  }
  .media-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
  }
  .media-name {
    font-weight: 600;
    font-size: var(--fs-sm, 0.92rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .media-sub {
    color: var(--txt3);
    font-size: var(--fs-xs, 0.76rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .media-row audio {
    max-width: 100%;
  }
  .download {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 var(--space-3, 0.75rem);
    border-radius: var(--radius-sm, 0.5rem);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    text-decoration: none;
    font-size: var(--fs-sm, 0.88rem);
    font-weight: 600;
  }
  .download:hover {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .download:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .link-row {
    padding: 0;
  }
  .link-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: var(--space-3, 0.75rem);
    color: var(--txt);
    text-decoration: none;
    border-radius: var(--radius-md, 0.75rem);
    min-height: 44px;
    justify-content: center;
  }
  .link-main:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .link-main:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .link-domain {
    font-weight: 600;
    font-size: var(--fs-sm, 0.92rem);
  }
  .link-url {
    color: var(--accent);
    font-size: var(--fs-xs, 0.78rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
</style>
