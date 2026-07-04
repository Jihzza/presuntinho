<script lang="ts">
  /**
   * /agente — in-app chat with an agent that knows the user's state.
   *
   * Chat-first UI (task-024):
   *   - Composer is the primary affordance, but does NOT autofocus on
   *     mobile: the soft keyboard only opens after the user taps the field.
   *   - 4 quick action chips sit **above** the composer, each chip
   *     fills the input AND auto-submits so the engine runs immediately.
   *   - No generic greeting — we show a one-line prompt + the chips.
   *   - History is loaded from Dexie (`chat_messages`) but the focus
   *     stays in the input even when there is prior context.
   *
   * V9 — multi-conversation support:
   *   - Conversations live in `chat_conversations`; every message row
   *     carries a `conversationId`. The 💬 header button opens a drawer
   *     (ConversationsDrawer) to switch / create / rename / delete.
   *   - Each conversation maps to its own Hermes session
   *     (`sessionIdFor`); '' is the legacy sentinel kept by the v9
   *     migration so the pre-V9 server transcript survives.
   *   - "Clear history" now clears only the ACTIVE conversation.
   *   - The 🖼️ header button opens /agente/galeria — all shared media.
   *
   * Brain: when a Hermes gateway is configured in /definicoes, every
   * message streams through it (src/lib/agent/hermes.ts) with a compact
   * app-data snapshot as system_message. The keyword engine
   * (src/lib/agent/engine.ts) stays as the offline/unreachable fallback,
   * keeping the page fully functional as a PWA without the gateway.
   */
  import { onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import { dispatch, type AgentReply } from '$lib/agent/engine';
  import {
    getHermesConfig,
    sessionIdFor,
    ensureHermesSession,
    deleteHermesSession,
    forgetHermesSession,
    streamHermesChat
  } from '$lib/agent/hermes';
  import { buildContextSummary } from '$lib/agent/context';
  import {
    listChatMessages,
    appendChatMessage,
    listConversations,
    createConversation,
    renameConversation,
    deleteConversation,
    clearConversation,
    getOrCreateActiveConversation,
    setActiveConversationId
  } from '$lib/agent/db';
  import type { ChatMessageRow, ChatConversationRow } from '$lib/state/db';
  import { initStores } from '$lib/state/stores';
  import { getSession } from '$lib/auth/session';
  import { showToast } from '$lib/components/events';
  import ConversationsDrawer from '$lib/components/agente/ConversationsDrawer.svelte';

  let messages = $state<ChatMessageRow[]>([]);
  let conversations = $state<ChatConversationRow[]>([]);
  let activeConv = $state<ChatConversationRow | null>(null);
  let drawerOpen = $state(false);
  let input = $state('');
  let busy = $state(false);
  // Non-null while a Hermes reply is streaming in ('' until first token).
  let streamingText = $state<string | null>(null);
  let abortCtrl: AbortController | null = null;
  let scrollEl: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);
  let recording = $state(false);
  let keyboardInset = $state(0);
  let mediaRecorder: MediaRecorder | null = null;
  let recordingChunks: BlobPart[] = [];

  // Quick action chips. Each entry exposes a `prompt` that is the
  // canonical form the engine matches against (case + accent
  // insensitive). The label is i18n-aware via `agente.chips.*`.
  type Chip = { key: string; prompt: string };
  const CHIPS: Chip[] = [
    { key: 'agente.chips.xp',            prompt: 'Quanto XP tenho?' },
    { key: 'agente.chips.habitos_hoje',  prompt: 'Hábitos de hoje' },
    { key: 'agente.chips.trabalhos',     prompt: 'Trabalhos pendentes' },
    { key: 'agente.chips.semana',        prompt: 'Resumo da semana' }
  ];

  // Object-URL cache: one URL per message attachment, created lazily on
  // first render and revoked on unmount. Avoids the leak of calling
  // URL.createObjectURL on every render pass (caderno had this bug).
  const objectUrls = new Map<number, string>();

  function attachmentUrl(m: ChatMessageRow): string | null {
    const blob = m.attachment?.blob;
    if (!blob || m.id === undefined) return null;
    let url = objectUrls.get(m.id);
    if (!url) {
      url = URL.createObjectURL(blob);
      objectUrls.set(m.id, url);
    }
    return url;
  }

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  async function refreshConversations() {
    conversations = await listConversations();
  }

  async function refreshHistory() {
    try {
      const session = getSession();
      if (!session) return;
      await initStores(session.profile);
      activeConv = await getOrCreateActiveConversation(
        session.profile,
        $t('agente.conv.default_title', { default: 'Conversa' })
      );
      await refreshConversations();
      if (activeConv?.id !== undefined) {
        messages = await listChatMessages(activeConv.id, 200);
      }
      await scrollToBottom();
    } catch (e) {
      console.error('[agente] failed to load history', e);
    }
  }

  /** Resolve the active conversation id, loading it if needed. */
  async function activeConvId(): Promise<number | null> {
    if (activeConv?.id !== undefined) return activeConv.id;
    await refreshHistory();
    return activeConv?.id ?? null;
  }

  function syncKeyboardInset(): void {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) {
      keyboardInset = 0;
      return;
    }
    keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  }

  function isAbortError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'AbortError';
  }

  /** Legacy path — local keyword engine (also the Hermes fallback). */
  async function replyWithEngine(convId: number, text: string, offlinePrefix = false): Promise<void> {
    const reply: AgentReply = await dispatch(text);
    const prefix = offlinePrefix ? `${$t('agente.hermes.offline_prefix')}\n` : '';
    await appendChatMessage(convId, 'assistant', prefix + reply.text);
  }

  async function replyWithHermes(conv: ChatConversationRow, text: string): Promise<void> {
    const convId = conv.id as number;
    const cfg = getHermesConfig();
    const session = getSession();
    if (!cfg || !session) {
      await replyWithEngine(convId, text);
      return;
    }
    abortCtrl = new AbortController();
    streamingText = '';
    try {
      const sid = sessionIdFor(session.profile, conv);
      await ensureHermesSession(cfg, sid, `Presuntinho ${session.profile} — ${conv.title}`);
      const system = await buildContextSummary(session.profile);
      const final = await streamHermesChat({
        cfg,
        sessionId: sid,
        message: text,
        systemMessage: system,
        signal: abortCtrl.signal,
        onDelta: (d) => {
          streamingText = (streamingText ?? '') + d;
          void scrollToBottom();
        }
      });
      await appendChatMessage(convId, 'assistant', final || streamingText || $t('agente.hermes.error_stream'));
    } catch (e) {
      if (isAbortError(e)) {
        // User pressed stop — keep whatever streamed in so far.
        const partial = streamingText?.trim();
        if (partial) await appendChatMessage(convId, 'assistant', `${partial}\n${$t('agente.hermes.stopped')}`);
      } else {
        console.error('[agente] hermes stream failed, falling back to engine', e);
        await replyWithEngine(convId, text, true);
      }
    } finally {
      streamingText = null;
      abortCtrl = null;
    }
  }

  function stopStreaming() {
    abortCtrl?.abort();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    // Set busy BEFORE any await so a double-tap can't double-send.
    busy = true;
    input = '';
    let cid: number | null = null;
    try {
      cid = await activeConvId();
      const conv = activeConv;
      if (cid === null || !conv) return;
      await appendChatMessage(cid, 'user', text);
      messages = await listChatMessages(cid, 200);
      await scrollToBottom();
      await replyWithHermes(conv, text);
      messages = await listChatMessages(cid, 200);
    } catch (e) {
      console.error('[agente] send failed', e);
      if (cid !== null) {
        await appendChatMessage(cid, 'assistant', $t('agente.error.send_failed', { default: 'Desculpa, tive um erro a processar a mensagem.' }));
        messages = await listChatMessages(cid, 200);
      }
    } finally {
      busy = false;
      await scrollToBottom();
      await refreshConversations();
      // Do not force-focus the composer here. On mobile that opens the
      // soft keyboard even when the user only tapped a chip or navigated
      // into the page; the keyboard must open only after a direct tap in
      // the textarea. If the textarea was already focused while typing,
      // the browser naturally keeps it focused.
    }
  }

  /**
   * Chip click: fill the input *and* auto-submit. We set `input` first
   * so the existing `send()` flow appends the user bubble and runs the
   * engine — same path as the user typing + pressing enter.
   */
  async function sendChip(prompt: string) {
    if (busy) return;
    input = prompt;
    await send();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function triggerFilePicker() {
    fileInput?.click();
  }

  async function onFileChosen(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const cid = await activeConvId();
    if (cid === null) return;
    busy = true;
    try {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const kind = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      const blob = file.slice(0, file.size, file.type);
      await appendChatMessage(cid, 'user', `📎 ${file.name}`, {
        kind,
        mimeType: file.type,
        name: file.name,
        blob
      });
      await appendChatMessage(
              cid,
              'assistant',
              $t('agente.chat.file_received', { values: { filename: file.name } })
            );
      messages = await listChatMessages(cid, 200);
      await refreshConversations();
    } catch (err) {
      console.error('[agente] file upload failed', err);
    } finally {
      busy = false;
      if (fileInput) fileInput.value = '';
      await scrollToBottom();
    }
  }

  async function toggleRecording() {
    if (recording) {
      // stop
      try {
        mediaRecorder?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    const cid = await activeConvId();
    if (cid === null) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      await appendChatMessage(cid, 'assistant', $t('agente.chat.no_audio_support', { default: 'O teu browser não suporta gravação de áudio.' }));
      messages = await listChatMessages(cid, 200);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordingChunks = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordingChunks.push(ev.data);
      };
      mr.onstop = async () => {
        recording = false;
        const blob = new Blob(recordingChunks, { type: mr.mimeType || 'audio/webm' });
        try {
          await appendChatMessage(cid, 'user', $t('agente.chat.audio_label', { default: '🎤 Áudio gravado' }), {
                      kind: 'audio',
                      mimeType: mr.mimeType || 'audio/webm',
                      name: `recording-${Date.now()}.webm`,
                      blob
                    });
                    await appendChatMessage(
                      cid,
                      'assistant',
                      $t('agente.chat.audio_received', { default: 'Recebi o áudio. Quando o agente tiver transcrição ativa, posso responder com base no que disseste. Por agora, escreve-me em texto.' })
                    );
          messages = await listChatMessages(cid, 200);
          await refreshConversations();
        } catch (e) {
          console.error('[agente] recording save failed', e);
        }
        for (const t of stream.getTracks()) t.stop();
      };
      mr.start();
      mediaRecorder = mr;
      recording = true;
    } catch (e) {
      console.error('[agente] getUserMedia failed', e);
      await appendChatMessage(cid, 'assistant', $t('agente.chat.mic_denied', { default: 'Não consegui aceder ao microfone. Verifica as permissões.' }));
      messages = await listChatMessages(cid, 200);
    }
  }

  /** Best-effort server-side session cleanup — never blocks local ops. */
  async function dropHermesSessionFor(conv: ChatConversationRow): Promise<void> {
    const cfg = getHermesConfig();
    const session = getSession();
    if (!cfg || !session) return;
    const sid = sessionIdFor(session.profile, conv);
    try {
      await deleteHermesSession(cfg, sid);
    } catch {
      forgetHermesSession(sid);
    }
  }

  /** Clear THIS conversation's messages (row survives, fresh session). */
  async function onClearConversation() {
    const conv = activeConv;
    if (!conv?.id) return;
    if (!confirm($t('agente.chat.clear_conversation_confirm', { default: 'Limpar as mensagens desta conversa?' }))) return;
    try {
      await clearConversation(conv.id);
      // Keep the Hermes transcript in sync — best-effort: a fresh
      // session is recreated on the next message.
      await dropHermesSessionFor(conv);
      messages = [];
      await appendChatMessage(
        conv.id,
        'assistant',
        $t('agente.chat.cleared', { default: 'Histórico limpo. Pergunta-me qualquer coisa sobre o que tens na app.' })
      );
      messages = await listChatMessages(conv.id, 200);
      await refreshConversations();
    } catch (e) {
      console.error('[agente] clear failed', e);
    }
  }

  async function switchConversation(conv: ChatConversationRow) {
    if (conv.id === undefined) return;
    drawerOpen = false;
    if (conv.id === activeConv?.id) return;
    // Abort any in-flight stream before the context changes.
    stopStreaming();
    const session = getSession();
    if (session) setActiveConversationId(session.profile, conv.id);
    activeConv = conv;
    try {
      messages = await listChatMessages(conv.id, 200);
      await scrollToBottom();
    } catch (e) {
      console.error('[agente] switch failed', e);
    }
  }

  async function onCreateConversation() {
    const session = getSession();
    if (!session) return;
    try {
      const id = await createConversation(
        session.profile,
        $t('agente.conv.default_title', { default: 'Conversa' })
      );
      await refreshConversations();
      const created = conversations.find((c) => c.id === id);
      if (created) await switchConversation(created);
      showToast($t('agente.conv.created', { default: 'Nova conversa criada 💬' }));
    } catch (e) {
      console.error('[agente] create conversation failed', e);
    }
  }

  async function onRenameConversation(conv: ChatConversationRow, title: string) {
    if (conv.id === undefined) return;
    try {
      await renameConversation(conv.id, title);
      await refreshConversations();
      if (activeConv && activeConv.id === conv.id) activeConv = { ...activeConv, title };
    } catch (e) {
      console.error('[agente] rename failed', e);
    }
  }

  async function onDeleteConversation(conv: ChatConversationRow) {
    if (conv.id === undefined) return;
    if (!confirm($t('agente.conv.delete_confirm', { default: 'Apagar esta conversa e todas as mensagens?' }))) return;
    try {
      if (conv.id === activeConv?.id) stopStreaming();
      // Best-effort server cleanup first (the local delete always wins).
      await dropHermesSessionFor(conv);
      await deleteConversation(conv.id);
      await refreshConversations();
      if (conv.id === activeConv?.id) {
        activeConv = null;
        messages = [];
        await refreshHistory();
      }
      showToast($t('agente.conv.deleted', { default: 'Conversa apagada.' }));
    } catch (e) {
      console.error('[agente] delete conversation failed', e);
    }
  }

  onMount(() => {
    syncKeyboardInset();
    window.visualViewport?.addEventListener('resize', syncKeyboardInset);
    window.visualViewport?.addEventListener('scroll', syncKeyboardInset);
    void refreshHistory();
    return () => {
      window.visualViewport?.removeEventListener('resize', syncKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', syncKeyboardInset);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      abortCtrl?.abort();
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
      objectUrls.clear();
    };
  });
</script>

<svelte:head>
  <title>{$t('agente.title', { default: 'Agente — Presuntinho' })}</title>
</svelte:head>

<div class="chat-root">
  <div class="chat-header">
    <h1>
      💬 {$t('agente.title', { default: 'Agente' })}
      {#if activeConv}
        <span class="conv-name" title={activeConv.title}>· {activeConv.title}</span>
      {/if}
    </h1>
    <div class="head-actions">
      <button
        class="head-btn"
        type="button"
        onclick={() => (drawerOpen = true)}
        aria-label={$t('agente.conv.open', { default: 'Conversas' })}
        title={$t('agente.conv.open', { default: 'Conversas' })}
      >
        💬
      </button>
      <a
        class="head-btn"
        href="/agente/galeria"
        aria-label={$t('agente.galeria.open', { default: 'Galeria de multimédia' })}
        title={$t('agente.galeria.open', { default: 'Galeria de multimédia' })}
      >
        🖼️
      </a>
      <button
        class="head-btn"
        type="button"
        onclick={onClearConversation}
        aria-label={$t('agente.chat.clear_conversation', { default: 'Limpar esta conversa' })}
        title={$t('agente.chat.clear_conversation', { default: 'Limpar esta conversa' })}
      >
        🗑️
      </button>
    </div>
  </div>

  <div class="chat-scroll" bind:this={scrollEl}>
    {#if messages.length === 0}
      <div class="empty">
        <p class="empty-prompt">{$t('agente.empty_prompt', { default: 'Pergunta qualquer coisa — eu leio da app.' })}</p>
      </div>
    {/if}
    {#each messages as m (m.id)}
      <div class="msg msg-{m.role}">
        <div class="bubble">
          {#if m.attachment}
            {@const url = attachmentUrl(m)}
            <div class="attach">
              {#if m.attachment.kind === 'image' && url}
                <img src={url} alt={m.attachment.name} />
              {:else if m.attachment.kind === 'video' && url}
                <!-- Uploaded personal clips usually have no captions; keep controls + label. -->
                <!-- svelte-ignore a11y_media_has_caption -->
                <video controls src={url} aria-label={m.attachment.name}></video>
              {:else if m.attachment.kind === 'audio' && url}
                <audio controls src={url}></audio>
              {:else}
                <span class="file-icon">📄</span>
              {/if}
              <span class="file-name">{m.attachment.name}</span>
            </div>
          {/if}
          <div class="text">{m.content}</div>
        </div>
      </div>
    {/each}
    {#if streamingText !== null}
          <div class="msg msg-assistant">
            {#if streamingText === ''}
              <div class="bubble thinking">{$t('agente.thinking')}</div>
            {:else}
              <div class="bubble"><div class="text">{streamingText}</div></div>
            {/if}
          </div>
        {:else if busy}
          <div class="msg msg-assistant">
            <div class="bubble thinking">{$t('agente.thinking')}</div>
          </div>
        {/if}
  </div>

  <!--
    Quick action chips — ABOVE the composer, auto-fill + auto-submit on
    tap. Always visible (both on first open and after history); keeps
    the chat-first mental model: anything you can type, you can also
    tap. Tap targets are ≥44px (mobile a11y baseline) and the strip
    honours `safe-area-inset-bottom` via the composer container.
  -->
  <div class="composer-dock" style={`--keyboard-inset: ${keyboardInset}px`}>
    <div class="chips-bar" role="group" aria-label={$t('agente.chips.label', { default: 'Sugestões rápidas' })}>
      {#each CHIPS as chip (chip.key)}
        <button
          type="button"
          class="chip"
          onclick={() => sendChip(chip.prompt)}
          disabled={busy}
        >
          {$t(chip.key, { default: chip.prompt })}
        </button>
      {/each}
    </div>

    <div class="composer">
      <input
        type="file"
        bind:this={fileInput}
        onchange={onFileChosen}
        hidden
        accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx"
      />
      <div class="input-shell">
        <button
          type="button"
          class="attach-btn"
          onclick={triggerFilePicker}
          aria-label="{$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}"
          title={$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}
        >
          📎
        </button>
        <textarea
          bind:this={inputEl}
          bind:value={input}
          onkeydown={onKeydown}
          placeholder={$t('agente.placeholder_chips', { default: 'ou escreve aqui a tua pergunta…' })}
          rows="1"
          disabled={busy}
        ></textarea>
      </div>
      <button
        type="button"
        class="action-btn"
        class:recording
        onclick={() => streamingText !== null ? stopStreaming() : input.trim() ? send() : toggleRecording()}
        disabled={busy && !recording && streamingText === null}
        aria-label={streamingText !== null
          ? $t('agente.hermes.stop', { default: 'Parar resposta' })
          : input.trim()
            ? $t('a11y.aria.enviar', { default: 'Enviar' })
            : recording
              ? $t('agente.aria.parar_gravacao', { default: 'Parar gravação' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
        title={streamingText !== null
          ? $t('agente.hermes.stop', { default: 'Parar resposta' })
          : input.trim()
            ? $t('a11y.aria.enviar', { default: 'Enviar' })
            : recording
              ? $t('agente.aria.parar_gravacao', { default: 'Parar gravação' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
      >
        {#if streamingText !== null}
          ⏹
        {:else if input.trim()}
          ➤
        {:else if recording}
          ⏹️
        {:else}
          🎤
        {/if}
      </button>
    </div>
  </div>
</div>

<ConversationsDrawer
  open={drawerOpen}
  {conversations}
  activeId={activeConv?.id ?? null}
  onclose={() => (drawerOpen = false)}
  onselect={switchConversation}
  oncreate={onCreateConversation}
  onrename={onRenameConversation}
  ondelete={onDeleteConversation}
/>

<style>
  .chat-root {
      display: flex;
      flex-direction: column;
      min-height: calc(100dvh - 64px);
      max-width: 800px;
      margin: 0 auto;
      padding-bottom: calc(9.25rem + env(safe-area-inset-bottom));
      background: var(--bg, #1f2e4a);
      color: var(--txt, #fff);
    }
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .chat-header h1 {
    margin: 0;
    font-size: 1.1rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-name {
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    font-weight: 400;
    font-size: 0.92rem;
  }
  .head-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex: 0 0 auto;
  }
  .head-btn {
    background: transparent;
    border: 0;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    font-size: 1.05rem;
    text-decoration: none;
  }
  .head-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .head-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .chat-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .empty {
    text-align: center;
    padding: 1.5rem 1rem 0.5rem;
    opacity: 0.85;
  }
  .empty-prompt {
    margin: 0;
    font-size: 0.95rem;
  }
  .msg {
    display: flex;
    width: 100%;
  }
  .msg-user {
    justify-content: flex-end;
  }
  .msg-assistant {
    justify-content: flex-start;
  }
  .bubble {
    max-width: 78%;
    padding: 0.6rem 0.9rem;
    border-radius: 14px;
    line-height: 1.45;
    font-size: 0.92rem;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .msg-user .bubble {
    background: var(--accent, #ec4899);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .msg-assistant .bubble {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-bottom-left-radius: 4px;
  }
  .bubble.thinking {
    opacity: 0.6;
    font-style: italic;
  }
  .attach {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.4rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }
  .attach img,
  .attach video {
    max-width: 220px;
    border-radius: 8px;
  }
  .attach audio {
    max-width: 220px;
  }
  .file-icon {
    font-size: 1.5rem;
  }
  .file-name {
    font-size: 0.78rem;
    opacity: 0.8;
  }
  /* Quick-action chip strip — sits between the message scroll and the
     composer. Horizontal scroll on narrow viewports so the 4 chips
     stay readable; tap-targets ≥44px per mobile a11y baseline. */
  .composer-dock {
    position: fixed;
    left: 50%;
    right: auto;
    bottom: max(
      calc(4.25rem + env(safe-area-inset-bottom)),
      calc(var(--keyboard-inset, 0px) + 0.55rem)
    );
    transform: translateX(-50%);
    width: min(800px, calc(100vw - 0.75rem));
    z-index: 65;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .chips-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0 0.25rem 0.42rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips-bar::-webkit-scrollbar { display: none; }
  .chip {
    flex: 0 0 auto;
    background: color-mix(in srgb, var(--bg-elev, #111827) 82%, transparent);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.16));
    color: var(--txt, #fff);
    padding: 0 0.9rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.88rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: background 0.15s, transform 0.05s, border-color 0.15s;
  }
  .chip:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent, #ec4899) 16%, var(--bg-elev, #111827));
    border-color: color-mix(in srgb, var(--accent, #ec4899) 36%, var(--border, rgba(255, 255, 255, 0.16)));
  }
  .chip:active:not(:disabled) {
    transform: scale(0.97);
  }
  .chip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .composer {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0;
    }
  .input-shell {
    flex: 1;
    min-height: 52px;
    display: flex;
    align-items: flex-end;
    gap: 0.25rem;
    background: color-mix(in srgb, var(--bg-elev, #111827) 88%, transparent);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.16));
    border-radius: 1.25rem;
    padding: 0.3rem 0.4rem;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
  }
  .input-shell:focus-within {
    border-color: var(--accent, #ec4899);
    background: color-mix(in srgb, var(--bg-elev, #111827) 94%, var(--accent, #ec4899) 6%);
    box-shadow: 0 14px 42px rgba(0, 0, 0, 0.26), 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 18%, transparent);
  }
  .attach-btn {
    background: transparent;
    border: 0;
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 999px;
    font-size: 1.2rem;
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .attach-btn:hover {
    background: color-mix(in srgb, var(--accent, #ec4899) 12%, transparent);
    color: var(--txt, #fff);
  }
  .composer textarea {
    flex: 1;
    resize: none;
    background: transparent;
    border: 0;
    color: var(--txt, #fff);
    padding: 0.72rem 0.45rem 0.58rem 0.1rem;
    border-radius: 0;
    font: inherit;
    max-height: 132px;
    min-height: 44px;
    line-height: 1.4;
  }
  .composer textarea:focus {
    outline: none;
  }
  .action-btn {
    background: var(--accent, #ec4899);
    color: #fff;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    font-weight: 700;
    min-width: 48px;
    min-height: 48px;
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.18rem;
    box-shadow: 0 8px 18px rgba(236, 72, 153, 0.32);
    transition: transform 120ms ease, filter 120ms ease, background 120ms ease;
  }
  .action-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .action-btn:active:not(:disabled) {
    transform: scale(0.94);
  }
  .action-btn.recording {
    background: #ef4444;
    box-shadow: 0 8px 18px rgba(239, 68, 68, 0.35);
  }
  .action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
