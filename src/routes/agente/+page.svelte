<script lang="ts">
  /**
   * /agente — in-app chat with an agent that knows the user's state.
   *
   * UI is ChatGPT-style: messages scroll from bottom, input is fixed at
   * the bottom with audio + upload + send buttons. History persists in
   * Dexie `chat_messages` table (per profile).
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

  let messages = $state<ChatMessageRow[]>([]);
  let input = $state('');
  let busy = $state(false);
  let scrollEl: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let recording = $state(false);
  let mediaRecorder: MediaRecorder | null = null;
  let recordingChunks: BlobPart[] = [];

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  async function refreshHistory() {
    try {
      await initStores();
      messages = await listChatMessages(200);
      await scrollToBottom();
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
      await appendChatMessage('assistant', 'Desculpa, tive um erro a processar a mensagem.');
      messages = await listChatMessages(200);
    } finally {
      busy = false;
      await scrollToBottom();
    }
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
        `Recebi o ficheiro "${file.name}". Quando o agente tiver indexação de ficheiros ativa, posso processá-lo. Por agora, descreve-me em texto o que queres saber sobre ele.`
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
      await appendChatMessage('assistant', 'O teu browser não suporta gravação de áudio.');
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
          await appendChatMessage('user', '🎤 Áudio gravado', {
            kind: 'audio',
            mimeType: mr.mimeType || 'audio/webm',
            name: `recording-${Date.now()}.webm`,
            blob
          });
          await appendChatMessage(
            'assistant',
            'Recebi o áudio. Quando o agente tiver transcrição ativa, posso responder com base no que disseste. Por agora, escreve-me em texto.'
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
      await appendChatMessage('assistant', 'Não consegui aceder ao microfone. Verifica as permissões.');
      messages = await listChatMessages(200);
    }
  }

  async function onClearHistory() {
    if (!confirm('Limpar todo o histórico do chat?')) return;
    try {
      await clearChatHistory();
      messages = [];
      await appendChatMessage(
        'assistant',
        'Histórico limpo. Pergunta-me qualquer coisa sobre o que tens na app.'
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
        <p>{$t('agente.empty', { default: 'Pergunta-me o que quiseres saber sobre a app.' })}</p>
        <div class="suggestions">
          <button type="button" onclick={() => (input = 'o que falta?')}>o que falta?</button>
          <button type="button" onclick={() => (input = 'resumo financeiro')}>resumo financeiro</button>
          <button type="button" onclick={() => (input = 'hábitos')}>hábitos</button>
          <button type="button" onclick={() => (input = 'progresso')}>progresso</button>
        </div>
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
        <div class="bubble thinking">a pensar…</div>
      </div>
    {/if}
  </div>

  <div class="composer">
    <button
      type="button"
      class="icon-btn"
      onclick={toggleRecording}
      aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
      title={recording ? 'Parar gravação' : 'Gravar áudio'}
      class:recording
    >
      {recording ? '⏹️' : '🎤'}
    </button>
    <button
      type="button"
      class="icon-btn"
      onclick={triggerFilePicker}
      aria-label="{$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}"
      title="Anexar ficheiro"
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
      bind:value={input}
      onkeydown={onKeydown}
      placeholder={$t('agente.placeholder', { default: 'Pergunta qualquer coisa…' })}
      rows="1"
      disabled={busy}
    ></textarea>
    <button
      type="button"
      class="send"
      onclick={send}
      disabled={busy || !input.trim()}
      aria-label="{$t('a11y.aria.enviar', { default: 'Enviar' })}"
    >
      ➤
    </button>
  </div>
</div>

<style>
  .chat-root {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px - 64px); /* header + bottom-nav */
    max-width: 800px;
    margin: 0 auto;
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
    padding: 2rem 1rem;
    opacity: 0.7;
  }
  .empty p {
    margin: 0 0 1rem;
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }
  .suggestions button {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .suggestions button:hover {
    background: rgba(255, 255, 255, 0.12);
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
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 0.4rem;
    padding: 0.6rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
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
  .send {
    background: var(--accent, #ec4899);
    color: #fff;
    border: 0;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-weight: 600;
    min-width: 44px;
    min-height: 44px;
  }
  .send:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>