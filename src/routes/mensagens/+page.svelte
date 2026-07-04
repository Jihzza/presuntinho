<script lang="ts">
  /**
   * /mensagens — private WhatsApp-style chat between fatma and daniel.
   *
   * Session-native (push 6f5a4bb, 2026-07-04): identity comes from the app
   * session (httpOnly cookie via src/lib/auth/session.ts); no password UI.
   * The backend still validates a per-profile chat credential on every
   * request (CHAT_TOKEN_FATMA / CHAT_TOKEN_DANIEL), but the user never sees
   * a code prompt — that flow was removed.
   *
   * - Transport: netlify/functions/chat.js (Netlify Blobs), polled by
   *   ChatStore (src/lib/chat/store.svelte.ts) every 4s while visible.
   * - Auth: session first; secure_setup collapsed into a small <details>
   *   for ops only (line ~351) — never a user-facing barrier.
   * - Composer: fixed dock with the same geometry as /agente (bottom above
   *   the bottom-nav, width min(800px, 100vw - .75rem), z-index 65) so the
   *   layout's --page-bottom-inset clearance applies identically.
   * - Read receipts: ✓ = delivered to the server, ✓✓ (accent) = the other
   *   person's lastRead cursor passed the message. markRead fires when the
   *   page is visible AND focused.
   */
  import { onMount, tick } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { getSession } from '$lib/auth/session';
  import { showToast } from '$lib/components/events';
  import { playSfx } from '$lib/gamification/sound';
  import { ChatApiError, getChatToken, setChatToken, otherProfile, type ChatProfile } from '$lib/chat/client';
  import { ChatStore, type LocalChatMessage } from '$lib/chat/store.svelte';
  import { profileFor } from '$lib/profile/people';

  type ConversationPreset = {
    id: string;
    titleKey: string;
    icon: string;
    descKey: string;
  };

  type PanelMode = 'none' | 'conversations' | 'files';

  const CONVERSATIONS: ConversationPreset[] = [
    { id: 'main', titleKey: 'mensagens.conversations.main', icon: '💬', descKey: 'mensagens.conversations.main_desc' },
    { id: 'memories', titleKey: 'mensagens.conversations.memories', icon: '🗂️', descKey: 'mensagens.conversations.memories_desc' },
    { id: 'photos', titleKey: 'mensagens.conversations.photos', icon: '📷', descKey: 'mensagens.conversations.photos_desc' },
    { id: 'plans', titleKey: 'mensagens.conversations.plans', icon: '📝', descKey: 'mensagens.conversations.plans_desc' },
    { id: 'voice', titleKey: 'mensagens.conversations.voice', icon: '🎙️', descKey: 'mensagens.conversations.voice_desc' }
  ];

  const SELECTED_CONVERSATION_KEY = 'presuntinho-mensagens-selected-conversation';

  let profile = $state<ChatProfile | null>(null);
  let noSession = $state(false);
  let secureSetupNeeded = $state(false);
  let setupKeyInput = $state('');
  let setupOpen = $state(false);
  let store = $state<ChatStore | null>(null);
  let selectedConversationId = $state('main');
  let panelMode = $state<PanelMode>('none');

  let input = $state('');
  let recording = $state(false);
  let keyboardInset = $state(0);
  let pageActive = $state(true);
  let viewerSrc = $state<string | null>(null);

  let scrollEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let mediaRecorder: MediaRecorder | null = null;
  let recordingChunks: BlobPart[] = [];

  // ── day grouping ─────────────────────────────────────────────────────────

  type DayGroup = {
    key: string;
    kind: 'today' | 'yesterday' | 'date';
    date: Date;
    items: LocalChatMessage[];
  };

  function localDayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const groups = $derived.by<DayGroup[]>(() => {
    if (!store) return [];
    const now = new Date();
    const todayKey = localDayKey(now);
    const yesterdayKey = localDayKey(new Date(now.getTime() - 86_400_000));
    const out: DayGroup[] = [];
    for (const m of store.messages) {
      const date = new Date(m.ts);
      const key = localDayKey(date);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(m);
      } else {
        out.push({
          key,
          kind: key === todayKey ? 'today' : key === yesterdayKey ? 'yesterday' : 'date',
          date,
          items: [m]
        });
      }
    }
    return out;
  });

  const other = $derived(profile ? otherProfile(profile) : 'daniel');
  const meProfile = $derived(profileFor(profile));
  const otherPerson = $derived(profileFor(other));
  const syncBlocked = $derived(Boolean(secureSetupNeeded || store?.authError));
  const selectedConversation = $derived(CONVERSATIONS.find((c) => c.id === selectedConversationId) ?? CONVERSATIONS[0]);
  const fileMessages = $derived((store?.messages ?? []).filter((m) => Boolean(m.mediaType || m.mediaKey || m.localDataUrl)));

  function conversationPreview(id: string): string {
    const last = [...(store?.messages ?? [])].reverse().find((m) => (m.conversationId || 'main') === id);
    if (!last) return $t(CONVERSATIONS.find((c) => c.id === id)?.descKey ?? 'mensagens.conversations.empty_preview');
    if (last.text) return last.text.slice(0, 64);
    if (last.mediaType?.startsWith('audio/')) return $t('mensagens.files.audio', { default: 'Áudio' });
    if (last.mediaType?.startsWith('image/')) return $t('mensagens.files.image', { default: 'Imagem' });
    return $t('mensagens.files.file', { default: 'Ficheiro' });
  }

  function fmtDate(d: Date): string {
    try {
      return d.toLocaleDateString($locale || 'pt-PT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } catch {
      return localDayKey(d);
    }
  }

  function fmtTime(ts: number): string {
    try {
      return new Date(ts).toLocaleTimeString($locale || 'pt-PT', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    // The page body is the actual scroller on mobile (the list grows the
    // document) — keep the newest bubble above the fixed composer.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }

  function startChat() {
    if (!profile) return;
    store?.stop();
    store = new ChatStore(profile, selectedConversationId);
    secureSetupNeeded = !getChatToken(profile);
    store.start();
  }

  function selectConversation(id: string): void {
    selectedConversationId = id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(SELECTED_CONVERSATION_KEY, id);
    panelMode = 'none';
    startChat();
    void scrollToBottom();
  }

  function saveSecureKey() {
    if (!profile) return;
    const value = setupKeyInput.trim();
    if (!value) {
      showToast($t('mensagens.secure_setup.missing', { default: 'Falta a chave de ligação para activar a sincronização neste dispositivo.' }));
      return;
    }
    setChatToken(profile, value);
    setupKeyInput = '';
    setupOpen = false;
    startChat();
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

  function syncActive(): void {
    if (typeof document === 'undefined') return;
    pageActive = document.visibilityState === 'visible' && document.hasFocus();
  }

  onMount(() => {
    const session = getSession();
    if (!session) {
      noSession = true;
      return;
    }
    profile = session.profile as ChatProfile;
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(SELECTED_CONVERSATION_KEY);
      if (saved && CONVERSATIONS.some((c) => c.id === saved)) selectedConversationId = saved;
    }
    startChat();

    syncKeyboardInset();
    syncActive();
    window.visualViewport?.addEventListener('resize', syncKeyboardInset);
    window.visualViewport?.addEventListener('scroll', syncKeyboardInset);
    window.addEventListener('focus', syncActive);
    window.addEventListener('blur', syncActive);
    document.addEventListener('visibilitychange', syncActive);
    return () => {
      window.visualViewport?.removeEventListener('resize', syncKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', syncKeyboardInset);
      window.removeEventListener('focus', syncActive);
      window.removeEventListener('blur', syncActive);
      document.removeEventListener('visibilitychange', syncActive);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      store?.stop();
    };
  });

  // Auto-scroll when the conversation grows — but ONLY when the user was
  // already near the bottom (or on the initial load). Reading old messages
  // must never have the scroll stolen; the "ir para o fim" FAB appears
  // instead (V10.1).
  let lastCount = 0;
  let showJumpToEnd = $state(false);

  function isNearBottom(): boolean {
    // V10.2 — a lista é o scroller interno; a janela já não rola no chat.
    if (scrollEl) {
      return scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight) < 180;
    }
    if (typeof window === 'undefined') return true;
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight) < 180;
  }

  function onListScroll(): void {
    showJumpToEnd = !isNearBottom() && (store?.messages.length ?? 0) > 0;
  }

  $effect(() => {
    const count = store?.messages.length ?? 0;
    if (count !== lastCount) {
      const initialLoad = lastCount === 0;
      const follow = initialLoad || isNearBottom();
      lastCount = count;
      if (follow) {
        void scrollToBottom();
      } else {
        showJumpToEnd = true;
      }
    }
  });

  // Mark incoming messages as read while the page is visible AND focused.
  $effect(() => {
    if (!store || !pageActive) return;
    if (store.unreadCount > 0) void store.markReadUpTo(store.latestIncomingTs);
  });

  // ── sending ──────────────────────────────────────────────────────────────

  function autogrow(): void {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 132)}px`;
  }

  function afterSendFeedback(result: 'sent' | 'queued' | 'failed'): void {
    if (result === 'queued') {
      showToast($t('mensagens.queued', { default: 'Guardada neste dispositivo — sincroniza quando a ligação segura estiver activa.' }));
    } else if (result === 'failed') {
      showToast($t('mensagens.send_failed', { default: 'A mensagem não seguiu. Toca em «tentar de novo».' }));
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !store) return;
    input = '';
    if (inputEl) inputEl.style.height = 'auto';
    playSfx('send');
    const result = await store.sendTextMessage(text);
    afterSendFeedback(result);
    void scrollToBottom();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function mediaErrorToast(e: unknown): void {
    if (e instanceof ChatApiError && e.status === 413) {
      showToast($t('mensagens.media_too_big', { default: 'Esse ficheiro é grandinho demais (máx. 3 MB) 🐘' }));
    } else {
      showToast($t('mensagens.media_invalid', { default: 'Só consigo enviar imagens e áudios 🙈' }));
    }
  }

  async function onFileChosen(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file || !store) return;
    try {
      const result = await store.sendMediaMessage(file, file.name);
      afterSendFeedback(result);
    } catch (err) {
      mediaErrorToast(err);
    }
    void scrollToBottom();
  }

  // Audio recording — same getUserMedia/MediaRecorder pattern as /agente.
  async function toggleRecording() {
    if (recording) {
      try {
        mediaRecorder?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showToast($t('agente.chat.no_audio_support', { default: 'O teu browser não suporta gravação de áudio.' }));
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
        for (const track of stream.getTracks()) track.stop();
        // Strip codec params — the server validates the bare mime type.
        const mime = (mr.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(recordingChunks, { type: mime });
        recordingChunks = [];
        if (blob.size === 0 || !store) return;
        try {
          const result = await store.sendMediaMessage(blob, `voz-${Date.now()}.webm`);
          afterSendFeedback(result);
        } catch (err) {
          mediaErrorToast(err);
        }
        void scrollToBottom();
      };
      mr.start();
      mediaRecorder = mr;
      recording = true;
    } catch (e) {
      console.error('[mensagens] getUserMedia failed', e);
      showToast($t('agente.chat.mic_denied', { default: 'Não consegui aceder ao microfone. Verifica as permissões.' }));
    }
  }

  async function retry(localId: string) {
    if (!store) return;
    const result = await store.retryMessage(localId);
    afterSendFeedback(result);
  }

  function onViewerKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && viewerSrc) viewerSrc = null;
  }
</script>

<svelte:window onkeydown={onViewerKeydown} />

<svelte:head>
  <title>{$t('mensagens.title', { default: 'Mensagens' })} — Presuntinho</title>
</svelte:head>

<div class="chat-root">
  <header class="chat-header">
    <div class="header-text">
      <span class="chat-kicker">{$t('mensagens.header.kicker', { default: 'Chat privado' })}</span>
      <h1>
        <a class="person-link" href={`/perfil/${other}/`} aria-label={$t('mensagens.aria.open_partner_profile', { default: 'Abrir perfil de {name}', values: { name: $t(otherPerson.nameKey) } })}>
          {otherPerson.emoji} {$t(otherPerson.nameKey)}
        </a>
      </h1>
      <p class="subtitle">
        {#if syncBlocked}
          {$t('mensagens.status.local', { default: 'Modo local — a sincronização segura ainda não está activa neste dispositivo.' })}
        {:else if store?.offline}
          {$t('mensagens.status.offline', { default: 'Offline — guardado no dispositivo.' })}
        {:else}
          {$t('mensagens.status.secure', { default: 'Ligação segura activa.' })}
        {/if}
      </p>
      <p class="conversation-label">{selectedConversation.icon} {$t(selectedConversation.titleKey)}</p>
    </div>
    <a class="profile-link" href="/perfil/" aria-label={$t('mensagens.aria.open_own_profile', { default: 'Abrir o meu perfil' })} title={$t('mensagens.aria.open_own_profile', { default: 'Abrir o meu perfil' })}>
      {meProfile.emoji}
    </a>
  </header>

  {#if !noSession}
    <nav class="chat-tools" aria-label={$t('mensagens.tools.aria', { default: 'Ferramentas da conversa' })}>
      <button type="button" class:active={panelMode === 'conversations'} onclick={() => (panelMode = panelMode === 'conversations' ? 'none' : 'conversations')}>
        💬 {$t('mensagens.tools.conversations', { default: 'Conversas' })}
      </button>
      <button type="button" class:active={panelMode === 'files'} onclick={() => (panelMode = panelMode === 'files' ? 'none' : 'files')}>
        📎 {$t('mensagens.tools.files', { default: 'Ficheiros' })}
      </button>
      <a href={`/perfil/${other}/`}>{$t('mensagens.tools.partner_profile', { default: 'Perfil de {name}', values: { name: $t(otherPerson.nameKey) } })}</a>
    </nav>

    {#if panelMode === 'conversations'}
      <aside class="chat-panel" aria-label={$t('mensagens.conversations.title', { default: 'Conversas' })}>
        <div class="panel-head">
          <strong>{$t('mensagens.conversations.title', { default: 'Conversas' })}</strong>
          <button type="button" onclick={() => (panelMode = 'none')} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>×</button>
        </div>
        <div class="conversation-list">
          {#each CONVERSATIONS as c}
            <button type="button" class:active={selectedConversationId === c.id} onclick={() => selectConversation(c.id)}>
              <span class="conv-icon" aria-hidden="true">{c.icon}</span>
              <span>
                <strong>{$t(c.titleKey)}</strong>
                <small>{conversationPreview(c.id)}</small>
              </span>
            </button>
          {/each}
        </div>
      </aside>
    {:else if panelMode === 'files'}
      <aside class="chat-panel" aria-label={$t('mensagens.files.title', { default: 'Ficheiros' })}>
        <div class="panel-head">
          <strong>{$t('mensagens.files.title', { default: 'Ficheiros' })}</strong>
          <button type="button" onclick={() => (panelMode = 'none')} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>×</button>
        </div>
        {#if fileMessages.length === 0}
          <p class="panel-empty">{$t('mensagens.files.empty', { default: 'Ainda não há ficheiros nesta conversa.' })}</p>
        {:else}
          <div class="file-grid">
            {#each fileMessages as m (m.id)}
              {@const src = store?.mediaSrc(m)}
              <button type="button" class="file-card" onclick={() => (src ? (viewerSrc = src) : undefined)}>
                <span aria-hidden="true">{m.mediaType?.startsWith('audio/') ? '🎧' : '🖼️'}</span>
                <strong>{m.name || (m.mediaType?.startsWith('audio/') ? $t('mensagens.files.audio') : $t('mensagens.files.image'))}</strong>
                <small>{fmtTime(m.ts)}</small>
              </button>
            {/each}
          </div>
        {/if}
      </aside>
    {/if}
  {/if}

  {#if store?.offline && !syncBlocked}
    <div class="offline-banner" role="status">
      {$t('mensagens.offline', {
        default: 'Sem ligação — as mensagens ficam guardadas e seguem quando houver rede.'
      })}
    </div>
  {/if}

  {#if syncBlocked && !noSession}
    <div class="sync-banner" role="status">
      <div>
        <strong>{$t('mensagens.secure_setup.title', { default: 'Chat privado ainda não está sincronizado neste dispositivo' })}</strong>
        <p>{$t('mensagens.secure_setup.body', { default: 'Podes escrever já; fica guardado localmente. Para sincronizar entre telemóveis, é preciso activar a ligação segura uma vez.' })}</p>
      </div>
      <details bind:open={setupOpen}>
        <summary>{$t('mensagens.secure_setup.action', { default: 'Activar ligação segura' })}</summary>
        <div class="setup-form">
          <input
            type="text"
            bind:value={setupKeyInput}
            placeholder={$t('mensagens.secure_setup.placeholder', { default: 'Chave de ligação' })}
            autocomplete="off"
            onkeydown={(e) => {
              if (e.key === 'Enter') saveSecureKey();
            }}
          />
          <button type="button" class="gate-save" onclick={saveSecureKey}>
            {$t('mensagens.secure_setup.save', { default: 'Activar' })}
          </button>
        </div>
        <p class="setup-note">{$t('mensagens.secure_setup.note', { default: 'Esta chave é técnica. Não é uma barreira entre vocês; é só a protecção do endpoint privado.' })}</p>
      </details>
    </div>
  {/if}

  {#if noSession}
    <div class="gate card">
      <span class="gate-emoji" aria-hidden="true">🔐</span>
      <p>{$t('mensagens.no_session', { default: 'Abre primeiro a tua sessão no ecrã inicial para entrares no chat privado.' })}</p>
    </div>
  {:else if store}
    <div class="chat-scroll" bind:this={scrollEl} onscroll={onListScroll}>
      {#if store.ready && store.messages.length === 0}
        <div class="empty">
          <span class="empty-heart" aria-hidden="true">💌</span>
          <p class="empty-title">{$t('mensagens.empty', { default: 'Ainda não há mensagens aqui.' })}</p>
          <p class="empty-hint">{$t('mensagens.empty_hint', { default: 'Deixa uma nota, envia uma foto ou grava um áudio quando quiseres.' })}</p>
        </div>
      {/if}

      {#each groups as g (g.key)}
        <div class="day-sep" role="separator">
          <span>
            {#if g.kind === 'today'}{$t('mensagens.hoje', { default: 'Hoje' })}
            {:else if g.kind === 'yesterday'}{$t('mensagens.ontem', { default: 'Ontem' })}
            {:else}{fmtDate(g.date)}{/if}
          </span>
        </div>
        {#each g.items as m (m.id)}
          {@const own = m.from === store.profile}
          <div class="msg" class:msg-own={own} class:msg-other={!own}>
            <div class="bubble" class:bubble-own={own} class:pop={own}>
              {#if m.mediaType?.startsWith('image/')}
                {@const src = store.mediaSrc(m)}
                {#if src}
                  <button
                    type="button"
                    class="img-btn"
                    onclick={() => (viewerSrc = src)}
                    aria-label={$t('mensagens.aria.abrir_imagem', { default: 'Abrir imagem em ecrã inteiro' })}
                  >
                    <img {src} alt={m.name || $t('mensagens.image_alt', { default: 'Imagem enviada' })} loading="lazy" />
                  </button>
                {:else}
                  <div class="media-loading">📷 {$t('mensagens.media_loading', { default: 'a carregar…' })}</div>
                {/if}
              {:else if m.mediaType?.startsWith('audio/')}
                {@const src = store.mediaSrc(m)}
                {#if src}
                  <audio controls {src} aria-label={$t('mensagens.audio_label', { default: 'Mensagem de voz' })}></audio>
                {:else}
                  <div class="media-loading">🎧 {$t('mensagens.media_loading', { default: 'a carregar…' })}</div>
                {/if}
              {/if}
              {#if m.text}
                <div class="text">{m.text}</div>
              {/if}
              <div class="meta-row">
                <span class="time">{fmtTime(m.ts)}</span>
                {#if own}
                  {#if m.pending}
                    <span class="ticks" aria-label={$t('mensagens.aria.pendente', { default: 'A enviar…' })}>🕓</span>
                  {:else if m.queued}
                    <span class="ticks" aria-label={$t('mensagens.aria.na_fila', { default: 'Na fila para enviar' })}>🕓</span>
                  {:else if m.failed}
                    <button type="button" class="retry" onclick={() => retry(m.id)}>
                      ⚠️ {$t('mensagens.retry', { default: 'Tentar de novo' })}
                    </button>
                  {:else if store.otherLastRead >= m.ts}
                    <span class="ticks read" aria-label={$t('mensagens.aria.lida', { default: 'Lida' })}>✓✓</span>
                  {:else}
                    <span class="ticks" aria-label={$t('mensagens.aria.enviada', { default: 'Enviada' })}>✓</span>
                  {/if}
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/each}
    </div>

    {#if showJumpToEnd}
      <button
        type="button"
        class="jump-to-end"
        onclick={() => {
          showJumpToEnd = false;
          void scrollToBottom();
        }}
        aria-label={$t('chat.jump_to_end', { default: 'Ir para a última mensagem' })}
        title={$t('chat.jump_to_end', { default: 'Ir para a última mensagem' })}
      >
        <span aria-hidden="true">↓</span>
      </button>
    {/if}

    <div class="composer-dock" style={`--keyboard-inset: ${keyboardInset}px`}>
      {#if recording}
        <div class="recording-hint" role="status">
          {$t('mensagens.recording', { default: 'A gravar… toca no botão para parar 🎙️' })}
        </div>
      {/if}
      <div class="composer">
        <input type="file" bind:this={fileInput} onchange={onFileChosen} hidden accept="image/*,audio/*" />
        <div class="input-shell">
          <button
            type="button"
            class="attach-btn"
            onclick={() => fileInput?.click()}
            aria-label={$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}
            title={$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}
          >
            📎
          </button>
          <textarea
            bind:this={inputEl}
            bind:value={input}
            onkeydown={onKeydown}
            oninput={autogrow}
            placeholder={$t('mensagens.placeholder', { default: 'Escreve uma mensagem…' })}
            rows="1"
          ></textarea>
        </div>
        <button
          type="button"
          class="action-btn"
          class:recording
          onclick={() => (input.trim() ? void send() : void toggleRecording())}
          aria-label={input.trim()
            ? $t('a11y.aria.enviar', { default: 'Enviar' })
            : recording
              ? $t('agente.aria.parar_gravacao', { default: 'Parar gravação' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
          title={input.trim()
            ? $t('a11y.aria.enviar', { default: 'Enviar' })
            : recording
              ? $t('agente.aria.parar_gravacao', { default: 'Parar gravação' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
        >
          {#if input.trim()}➤{:else if recording}⏹️{:else}🎤{/if}
        </button>
      </div>
    </div>
  {/if}
</div>

{#if viewerSrc}
  <div class="viewer" role="dialog" aria-modal="true">
    <button
      type="button"
      class="viewer-backdrop"
      onclick={() => (viewerSrc = null)}
      aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
    ></button>
    <img class="viewer-img" src={viewerSrc} alt={$t('mensagens.image_alt', { default: 'Imagem enviada' })} />
    <button
      type="button"
      class="viewer-close"
      onclick={() => (viewerSrc = null)}
      aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
    >
      ✕
    </button>
  </div>
{/if}

<style>
  .chat-root {
    /* V10.2 — layout WhatsApp: altura FIXA ao viewport e overflow escondido,
       para a página nunca rolar. A lista (.chat-scroll) é o único scroller;
       o composer e o footer ficam sempre no sítio e a última mensagem está
       SEMPRE visível ao entrar, sem scroll manual. */
    display: flex;
    flex-direction: column;
    /* 64px header sticky + ~4.35rem bottom-nav em fluxo. */
    height: calc(100dvh - 64px - 4.75rem - env(safe-area-inset-bottom));
    overflow: hidden;
    max-width: 800px;
    margin: 0 auto;
    color: var(--txt);
  }
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .chat-header h1 {
    margin: 0;
    font-size: var(--fs-lg);
  }
  .person-link {
    color: inherit;
    text-decoration: none;
    border-radius: var(--radius-sm);
  }
  .person-link:hover,
  .person-link:focus-visible {
    color: var(--accent);
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .subtitle {
    margin: 0.15rem 0 0;
    font-size: var(--fs-xs);
    color: var(--txt3);
  }
  .conversation-label {
    margin: 0.25rem 0 0;
    color: var(--txt2);
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .chat-kicker {
    display: block;
    margin-bottom: 0.15rem;
    color: var(--txt3);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .profile-link {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: inherit;
    text-decoration: none;
    font-size: 1.35rem;
    flex-shrink: 0;
  }
  .profile-link:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .chat-tools {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding: var(--space-2) var(--space-4) 0;
  }
  .chat-tools button,
  .chat-tools a {
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--txt2);
    padding: 0.45rem 0.8rem;
    text-decoration: none;
    font: inherit;
    font-size: var(--fs-sm);
    white-space: nowrap;
    cursor: pointer;
  }
  .chat-tools .active,
  .chat-tools button:hover,
  .chat-tools a:hover,
  .chat-tools button:focus-visible,
  .chat-tools a:focus-visible {
    color: var(--txt);
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
    outline: none;
  }
  .chat-panel {
    margin: var(--space-2) var(--space-4) 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    box-shadow: var(--shadow-md);
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .panel-head button {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt);
    cursor: pointer;
  }
  .conversation-list {
    display: grid;
    gap: var(--space-2);
  }
  .conversation-list button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2);
    align-items: center;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    color: inherit;
    padding: var(--space-2);
    cursor: pointer;
  }
  .conversation-list button.active {
    border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-elev));
  }
  .conv-icon {
    width: 2.4rem;
    height: 2.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 1rem;
    background: var(--card);
  }
  .conversation-list small,
  .file-card small,
  .panel-empty {
    display: block;
    color: var(--txt3);
    line-height: 1.35;
  }
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-2);
  }
  .file-card {
    min-height: 7rem;
    display: grid;
    justify-items: start;
    align-content: space-between;
    gap: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    color: inherit;
    padding: var(--space-3);
    text-align: left;
    cursor: pointer;
  }
  .file-card span {
    font-size: 1.5rem;
  }
  .sync-banner,
  .offline-banner {
    margin: var(--space-2) var(--space-4) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--txt2);
    font-size: var(--fs-sm);
    text-align: center;
  }

  /* ── session / secure setup states ── */
  .gate {
    margin: var(--space-6) var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: var(--shadow-md);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
  }
  .gate-emoji {
    font-size: 2.4rem;
  }
  .gate p {
    margin: 0;
    color: var(--txt2);
    font-size: var(--fs-sm);
    line-height: 1.5;
    max-width: 34ch;
  }
  .setup-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    max-width: 320px;
  }
  .setup-form input {
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-strong);
    background: var(--bg-elev);
    color: var(--txt);
    font: inherit;
  }
  .setup-form input:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .gate-save {
    min-height: var(--touch-target);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: filter var(--motion-fast) ease, transform var(--motion-fast) ease;
  }
  .gate-save:hover {
    filter: brightness(1.08);
  }
  .gate-save:active {
    transform: scale(0.98);
  }
  .gate-save:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .sync-banner {
    display: grid;
    gap: var(--space-3);
    text-align: left;
  }
  .sync-banner p,
  .setup-note {
    margin: 0.25rem 0 0;
    line-height: 1.45;
  }
  .sync-banner details {
    width: 100%;
  }
  .sync-banner summary {
    cursor: pointer;
    color: var(--accent);
    font-weight: 700;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .setup-form {
    margin-top: var(--space-2);
  }

  /* ── messages ── */
  .chat-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-4);
    /* Espaço para as bolhas nunca ficarem atrás do composer fixo + footer. */
    padding-bottom: calc(9rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .empty {
    text-align: center;
    padding: var(--space-6) var(--space-4) var(--space-3);
    color: var(--txt2);
  }
  .empty-heart {
    font-size: 2.6rem;
    display: block;
    margin-bottom: var(--space-2);
  }
  .empty-title {
    margin: 0;
    font-size: var(--fs-md);
    color: var(--txt);
    font-weight: 600;
  }
  .empty-hint {
    margin: var(--space-1) 0 0;
    font-size: var(--fs-sm);
  }
  .day-sep {
    display: flex;
    justify-content: center;
    margin: var(--space-3) 0 var(--space-1);
  }
  .day-sep span {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--txt3);
    font-size: var(--fs-xs);
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
  }
  .msg {
    display: flex;
    width: 100%;
  }
  .msg-own {
    justify-content: flex-end;
  }
  .msg-other {
    justify-content: flex-start;
  }
  .bubble {
    max-width: 78%;
    padding: 0.55rem 0.8rem 0.4rem;
    border-radius: 14px;
    line-height: 1.45;
    font-size: var(--fs-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--txt);
    border-bottom-left-radius: 4px;
  }
  .bubble-own {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
    border-bottom-left-radius: 14px;
    border-bottom-right-radius: 4px;
  }
  /* Subtle pop on own bubbles. Runs only when the element mounts (keyed
     each) and is zeroed globally by the reduced-motion kill-switch. */
  @keyframes bubble-pop {
    from {
      transform: scale(0.92);
      opacity: 0.6;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .bubble.pop {
    animation: bubble-pop var(--motion-fast) ease-out;
    transform-origin: bottom right;
  }
  .meta-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    margin-top: 0.15rem;
  }
  .time {
    font-size: 0.68rem;
    opacity: 0.75;
  }
  .ticks {
    font-size: 0.72rem;
    opacity: 0.85;
    letter-spacing: -0.12em;
  }
  .bubble-own .ticks.read {
    color: var(--on-accent);
    opacity: 1;
    text-shadow: 0 0 6px currentColor;
  }
  .retry {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: 999px;
    font-size: var(--fs-xs);
    padding: 0.15rem 0.55rem;
    min-height: 28px;
    cursor: pointer;
  }
  .retry:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .img-btn {
    display: block;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
    border-radius: var(--radius-md);
    overflow: hidden;
    max-width: 100%;
  }
  .img-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .img-btn img {
    display: block;
    max-width: min(260px, 100%);
    max-height: 300px;
    border-radius: var(--radius-md);
  }
  .bubble audio {
    max-width: min(240px, 100%);
    display: block;
  }
  .media-loading {
    font-size: var(--fs-xs);
    opacity: 0.8;
    padding: var(--space-2) 0;
  }

  /* ── composer dock — same geometry as /agente ── */
  .composer-dock {
    position: fixed;
    left: 50%;
    right: auto;
    /* V10.2: encostado MESMO ao footer (bottom-nav ≈ 4.35rem) — a barra de
       escrever vive colada ao fundo, como no WhatsApp. O gradiente ancora-a
       visualmente e tapa as bolhas que passam por trás ao rolar. */
    bottom: max(
      calc(4.5rem + env(safe-area-inset-bottom)),
      calc(var(--keyboard-inset, 0px) + 0.55rem)
    );
    transform: translateX(-50%);
    width: min(800px, calc(100vw - 0.75rem));
    z-index: 65;
    padding-top: 0.45rem;
    background: linear-gradient(to top, var(--bg, #1f2e4a) 72%, transparent);
  }
  /* V10.1 — "ir para o fim" FAB, floats above the composer while reading
     history. Same fixed geometry as the dock so they never overlap. */
  .jump-to-end {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: max(
      calc(10.5rem + env(safe-area-inset-bottom)),
      calc(var(--keyboard-inset, 0px) + 8rem)
    );
    z-index: 66;
    min-width: 44px;
    min-height: 44px;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    background: var(--card, #22314f);
    color: var(--txt, #fff);
    font-size: 1.2rem;
    cursor: pointer;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.4));
    animation: jump-in var(--motion-base, 220ms) ease;
  }
  @keyframes jump-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  .recording-hint {
    text-align: center;
    font-size: var(--fs-xs);
    color: var(--txt2);
    background: color-mix(in srgb, var(--bg-elev) 85%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.8rem;
    margin: 0 auto 0.4rem;
    width: fit-content;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .input-shell {
    flex: 1;
    min-height: 52px;
    display: flex;
    align-items: flex-end;
    gap: var(--space-1);
    background: color-mix(in srgb, var(--bg-elev) 88%, transparent);
    border: 1px solid var(--border);
    border-radius: 1.25rem;
    padding: 0.3rem 0.4rem;
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    transition: border-color var(--motion-fast) ease, background var(--motion-fast) ease;
  }
  .input-shell:focus-within {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--bg-elev) 94%, var(--accent) 6%);
  }
  .attach-btn {
    background: transparent;
    border: 0;
    color: var(--txt2);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: 999px;
    font-size: 1.2rem;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .attach-btn:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--txt);
  }
  .attach-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .composer textarea {
    flex: 1;
    resize: none;
    background: transparent;
    border: 0;
    color: var(--txt);
    padding: 0.72rem 0.45rem 0.58rem 0.1rem;
    font: inherit;
    max-height: 132px;
    min-height: var(--touch-target);
    line-height: 1.4;
  }
  .composer textarea:focus {
    outline: none;
  }
  .action-btn {
    background: var(--accent);
    color: var(--on-accent);
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
    box-shadow: var(--shadow-md);
    transition: transform var(--motion-fast) ease, filter var(--motion-fast) ease;
  }
  .action-btn:hover {
    filter: brightness(1.1);
  }
  .action-btn:active {
    transform: scale(0.94);
  }
  .action-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .action-btn.recording {
    background: var(--error);
  }

  /* ── fullscreen image viewer ── */
  .viewer {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .viewer-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: color-mix(in srgb, var(--bg) 30%, rgb(0 0 0 / 0.72));
    cursor: zoom-out;
  }
  .viewer-img {
    position: relative;
    max-width: 94vw;
    max-height: 88dvh;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    pointer-events: none;
  }
  .viewer-close {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 0.75rem);
    right: 0.75rem;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .viewer-close:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
