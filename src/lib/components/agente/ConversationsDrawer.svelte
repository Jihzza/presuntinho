<script lang="ts">
  /**
   * ConversationsDrawer — V9 multi-conversation switcher for /agente.
   *
   * Side drawer on desktop, bottom sheet on narrow viewports. Lists all
   * conversations (title, last-message preview, relative date), keeps
   * the active one highlighted, and offers create / inline-rename /
   * delete. All persistence lives in the parent (+page.svelte) — this
   * component only renders and emits callbacks.
   */
  import { t } from 'svelte-i18n';
  import type { ChatConversationRow } from '$lib/state/db';

  interface Props {
    open: boolean;
    conversations: ChatConversationRow[];
    activeId: number | null;
    onclose: () => void;
    onselect: (conv: ChatConversationRow) => void;
    oncreate: () => void;
    onrename: (conv: ChatConversationRow, title: string) => void;
    ondelete: (conv: ChatConversationRow) => void;
  }

  let { open, conversations, activeId, onclose, onselect, oncreate, onrename, ondelete }: Props = $props();

  // Inline rename state — one row at a time.
  let editingId = $state<number | null>(null);
  let editTitle = $state('');
  let editInput: HTMLInputElement | null = $state(null);

  $effect(() => {
    // Reset any in-progress rename whenever the drawer closes.
    if (!open) editingId = null;
  });

  $effect(() => {
    if (editingId !== null && editInput) editInput.focus();
  });

  function startRename(conv: ChatConversationRow) {
    editingId = conv.id ?? null;
    editTitle = conv.title;
  }

  function commitRename(conv: ChatConversationRow) {
    const title = editTitle.trim();
    editingId = null;
    if (title && title !== conv.title) onrename(conv, title);
  }

  function onRenameKeydown(e: KeyboardEvent, conv: ChatConversationRow) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename(conv);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      editingId = null;
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onclose();
  }

  /** Compact relative timestamp for the conversation list. */
  function relativeDate(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return $t('agente.conv.rel.agora', { default: 'agora mesmo' });
    if (min < 60) return $t('agente.conv.rel.min', { default: 'há {n} min', values: { n: min } });
    const hours = Math.floor(min / 60);
    if (hours < 24) return $t('agente.conv.rel.horas', { default: 'há {n} h', values: { n: hours } });
    const days = Math.floor(hours / 24);
    return $t('agente.conv.rel.dias', { default: 'há {n} d', values: { n: days } });
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- Backdrop is a real (invisible) button — same a11y pattern as the
       definicoes modals: keyboard/AT users get a labelled "close". -->
  <button
    type="button"
    class="drawer-overlay"
    onclick={onclose}
    aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
  ></button>
  <div
    class="drawer"
    role="dialog"
    aria-modal="true"
    aria-label={$t('agente.conv.drawer_title', { default: 'Conversas' })}
  >
    <header class="drawer-head">
      <h2>💬 {$t('agente.conv.drawer_title', { default: 'Conversas' })}</h2>
      <button
        type="button"
        class="icon-btn"
        onclick={onclose}
        aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
        title={$t('a11y.aria.fechar', { default: 'Fechar' })}
      >
        ✕
      </button>
    </header>

    <button type="button" class="new-conv" onclick={oncreate}>
      ＋ {$t('agente.conv.nova', { default: 'Nova conversa' })}
    </button>

    <div class="conv-list" role="list">
      {#if conversations.length === 0}
        <p class="empty">{$t('agente.conv.empty', { default: 'Ainda não há conversas — começa uma! 💕' })}</p>
      {/if}
      {#each conversations as conv (conv.id)}
        <div class="conv-row" class:active={conv.id === activeId} role="listitem">
          {#if editingId === conv.id}
            <div class="rename-shell">
              <input
                bind:this={editInput}
                bind:value={editTitle}
                type="text"
                maxlength="60"
                placeholder={$t('agente.conv.rename_placeholder', { default: 'Nome da conversa' })}
                onkeydown={(e) => onRenameKeydown(e, conv)}
                onblur={() => commitRename(conv)}
              />
              <button
                type="button"
                class="icon-btn"
                onclick={() => commitRename(conv)}
                aria-label={$t('agente.conv.save', { default: 'Guardar' })}
                title={$t('agente.conv.save', { default: 'Guardar' })}
              >
                ✓
              </button>
            </div>
          {:else}
            <button type="button" class="conv-main" onclick={() => onselect(conv)}>
              <span class="conv-title">{conv.title}</span>
              <span class="conv-preview">
                {conv.lastPreview || $t('agente.conv.no_preview', { default: 'Sem mensagens ainda' })}
              </span>
              <span class="conv-date">{relativeDate(conv.updatedAt)}</span>
            </button>
            <div class="conv-actions">
              <button
                type="button"
                class="icon-btn"
                onclick={() => startRename(conv)}
                aria-label={$t('agente.conv.rename', { default: 'Mudar o nome' })}
                title={$t('agente.conv.rename', { default: 'Mudar o nome' })}
              >
                ✏️
              </button>
              <button
                type="button"
                class="icon-btn danger"
                onclick={() => ondelete(conv)}
                aria-label={$t('agente.conv.delete', { default: 'Apagar conversa' })}
                title={$t('agente.conv.delete', { default: 'Apagar conversa' })}
              >
                🗑️
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    cursor: default;
    background: rgba(0, 0, 0, 0.45);
    /* Above the composer dock (65) so the drawer owns the screen. */
    z-index: 70;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(340px, 92vw);
    display: flex;
    flex-direction: column;
    background: var(--card, var(--bg-elev));
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg, 0 12px 40px rgba(0, 0, 0, 0.4));
    z-index: 71;
    padding: var(--space-3, 0.75rem);
    gap: var(--space-3, 0.75rem);
    animation: drawer-in var(--motion-base, 200ms) ease both;
  }
  @keyframes drawer-in {
    from { transform: translateX(24px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .drawer-head h2 {
    margin: 0;
    font-size: var(--fs-md, 1.05rem);
    color: var(--txt);
  }
  .icon-btn {
    background: transparent;
    border: 0;
    color: var(--txt2);
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    border-radius: var(--radius-sm, 0.5rem);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
  }
  .icon-btn:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--txt);
  }
  .icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .icon-btn.danger:hover {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .new-conv {
    min-height: 44px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-md, 0.75rem);
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    font-size: var(--fs-sm, 0.9rem);
  }
  .new-conv:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: var(--accent);
  }
  .new-conv:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .conv-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .empty {
    color: var(--txt3);
    font-size: var(--fs-sm, 0.9rem);
    text-align: center;
    padding: var(--space-4, 1rem) 0;
    margin: 0;
  }
  .conv-row {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--bg-elev);
  }
  .conv-row.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg-elev));
  }
  .conv-main {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: flex-start;
    text-align: start;
    background: transparent;
    border: 0;
    color: var(--txt);
    cursor: pointer;
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    border-radius: var(--radius-md, 0.75rem);
  }
  .conv-main:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .conv-title {
    font-weight: 600;
    font-size: var(--fs-sm, 0.92rem);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-preview {
    color: var(--txt2);
    font-size: var(--fs-xs, 0.78rem);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-date {
    color: var(--txt3);
    font-size: var(--fs-xs, 0.72rem);
  }
  .conv-actions {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .rename-shell {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: var(--space-2, 0.5rem);
  }
  .rename-shell input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    background: var(--bg-elev);
    color: var(--txt);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    padding: 0 var(--space-2, 0.5rem);
    font: inherit;
    font-size: var(--fs-sm, 0.9rem);
  }
  .rename-shell input:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--focus-ring);
  }

  /* Bottom sheet on narrow viewports. */
  @media (max-width: 640px) {
    .drawer {
      top: auto;
      left: 0;
      right: 0;
      width: 100%;
      max-height: 78dvh;
      border-left: 0;
      border-top: 1px solid var(--border);
      border-radius: var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0;
      animation-name: sheet-in;
    }
    @keyframes sheet-in {
      from { transform: translateY(24px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  }
</style>
