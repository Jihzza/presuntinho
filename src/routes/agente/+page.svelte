<script lang="ts">
  /**
   * /agente — in-app chat with an agent that knows the user's state.
   *
   * Chat-first UI (task-024):
   *   - Composer is the primary affordance: autofocus on mount + after
   *     every send while the conversation is still empty.
   *   - 4 quick action chips sit **above** the composer, each chip
   *     fills the input AND auto-submits so the engine runs immediately.
   *   - No generic greeting — we show a one-line prompt + the chips.
   *   - History is loaded from Dexie (`chat_messages`) but the focus
   *     stays in the input even when there is prior context.
   *
   * Engine is keyword-routed (no LLM API). See src/lib/agent/engine.ts.
   */
  import { onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import { dispatch, type AgentReply } from '$lib/agent/engine';
  import {
    listChatMessages,
    appendChatMessage,
    clearChatHistory
  } from '$lib/agent/db';
  import type { ChatMessageRow } from '$lib/state/db';
  import { initStores } from '$lib/state/stores';
  import { getSession } from '$lib/auth/session';

  let messages = $state<ChatMessageRow[]>([]);
  let input = $state('');
  let busy = $state(false);
  let scrollEl: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);
  let recording = $state(false);
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

  async function focusComposer() {
    await tick();
    inputEl?.focus({ preventScroll: true });
  }

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  async function refreshHistory() {
    try {
      const session = getSession();
      if (!session) return;
      await initStores(session.profile);
      messages = await listChatMessages(200);
      await scrollToBottom();
      await focusComposer();
    } catch (e) {
      console.error('[agente] failed to load history', e);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    busy = true;
    input = '';
    try {
      await appendChatMessage('user', text);
      const reply: AgentReply = await dispatch(text);
      await appendChatMessage('assistant', reply.text);
      messages = await listChatMessages(200);
    } catch (e) {
      console.error('[agente] send failed', e);
      await appendChatMessage('assistant', $t('agente.error.send_failed', { default: 'Desculpa, tive um erro a processar a mensagem.' }));
      messages = await listChatMessages(200);
    } finally {
      busy = false;
      await scrollToBottom();
      // Keep the composer focused so the user can keep typing or hit
      // another chip. We re-focus unless the (mobile) soft keyboard
      // is currently open — focusing inside a vendor UA can hide the
      // keyboard again. The `focus({ preventScroll: true })` plus the
      // brief `tick()` delay has proven reliable on iOS PWA + Android
      // Chrome during smoke tests.
      await focusComposer();
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
    busy = true;
    try {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const kind = isImage ? 'image' : isAudio ? 'audio' : 'file';
      const blob = file.slice(0, file.size, file.type);
      await appendChatMessage('user', `📎 ${file.name}`, {
        kind,
        mimeType: file.type,
        name: file.name,
        blob
      });
      await appendChatMessage(
              'assistant',
              $t('agente.chat.file_received', { values: { filename: file.name } })
            );
      messages = await listChatMessages(200);
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
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      await appendChatMessage('assistant', $t('agente.chat.no_audio_support', { default: 'O teu browser não suporta gravação de áudio.' }));
      messages = await listChatMessages(200);
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
        const blob = new Blob(recordingChunks, { type: mr.mimeType || 'audio/webm' });
        try {
          await appendChatMessage('user', $t('agente.chat.audio_label', { default: '🎤 Áudio gravado' }), {
                      kind: 'audio',
                      mimeType: mr.mimeType || 'audio/webm',
                      name: `recording-${Date.now()}.webm`,
                      blob
                    });
                    await appendChatMessage(
                      'assistant',
                      $t('agente.chat.audio_received', { default: 'Recebi o áudio. Quando o agente tiver transcrição ativa, posso responder com base no que disseste. Por agora, escreve-me em texto.' })
                    );
          messages = await listChatMessages(200);
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
      await appendChatMessage('assistant', $t('agente.chat.mic_denied', { default: 'Não consegui aceder ao microfone. Verifica as permissões.' }));
      messages = await listChatMessages(200);
    }
  }

  async function onClearHistory() {
    if (!confirm($t('agente.chat.clear_confirm', { default: 'Limpar todo o histórico do chat?' }))) return;
        try {
          await clearChatHistory();
          messages = [];
          await appendChatMessage(
            'assistant',
            $t('agente.chat.cleared', { default: 'Histórico limpo. Pergunta-me qualquer coisa sobre o que tens na app.' })
          );
      messages = await listChatMessages(200);
    } catch (e) {
      console.error('[agente] clear failed', e);
    }
  }

  onMount(() => {
    void refreshHistory();
  });
</script>

<svelte:head>
  <title>{$t('agente.title', { default: 'Agente — Presuntinho' })}</title>
</svelte:head>

<div class="chat-root">
  <div class="chat-header">
    <h1>💬 {$t('agente.title', { default: 'Agente' })}</h1>
    <button class="clear" type="button" onclick={onClearHistory} aria-label="{$t('a11y.aria.limpar_historico', { default: 'Limpar histórico' })}">
      🗑️
    </button>
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
            <div class="attach">
              {#if m.attachment.kind === 'image' && m.attachment.blob}
                <img src={URL.createObjectURL(m.attachment.blob)} alt={m.attachment.name} />
              {:else if m.attachment.kind === 'audio' && m.attachment.blob}
                <audio controls src={URL.createObjectURL(m.attachment.blob)}></audio>
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
    {#if busy}
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
  <div class="composer-dock">
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
      <button
        type="button"
        class="icon-btn"
        onclick={triggerFilePicker}
        aria-label="{$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}"
        title={$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}
      >
        📎
      </button>
      <input
        type="file"
        bind:this={fileInput}
        onchange={onFileChosen}
        hidden
        accept="image/*,audio/*,.pdf,.txt,.md,.doc,.docx"
      />
      <textarea
        bind:this={inputEl}
        bind:value={input}
        onkeydown={onKeydown}
        placeholder={$t('agente.placeholder_chips', { default: 'ou escreve aqui a tua pergunta…' })}
        rows="1"
        disabled={busy}
      ></textarea>
      <button
        type="button"
        class="action-btn"
        class:recording
        onclick={() => input.trim() ? send() : toggleRecording()}
        disabled={busy && !recording}
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
        {#if input.trim()}
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
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .chat-header h1 {
    margin: 0;
    font-size: 1.1rem;
  }
  .clear {
    background: transparent;
    border: 0;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 0.5rem;
  }
  .clear:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
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
  .attach img {
    max-width: 200px;
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
    bottom: calc(4.85rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(800px, 100vw);
    z-index: 55;
    background: rgba(12, 18, 32, 0.94);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .chips-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.55rem 0.8rem 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips-bar::-webkit-scrollbar { display: none; }
  .chip {
    flex: 0 0 auto;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    padding: 0 0.9rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.88rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    transition: background 0.15s, transform 0.05s;
  }
  .chip:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
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
      gap: 0.45rem;
      padding: 0.55rem 0.65rem 0.65rem;
    }
  .icon-btn {
    background: transparent;
    border: 0;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.5rem;
    font-size: 1.2rem;
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .icon-btn.recording {
    background: rgba(239, 68, 68, 0.25);
    color: #fca5a5;
  }
  .composer textarea {
    flex: 1;
    resize: none;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    padding: 0.6rem 0.8rem;
    border-radius: 14px;
    font: inherit;
    max-height: 120px;
    min-height: 44px;
    line-height: 1.4;
  }
  .composer textarea:focus {
    outline: none;
    border-color: var(--accent, #ec4899);
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