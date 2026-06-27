<script lang="ts">
  /**
   * Meu Caderno — caderno pessoal da Fatma.
   * Notas, áudios (gravações), imagens e ficheiros.
   * Tudo organizado por categoria (escola / hábitos / finanças / geral).
   * Persistência local via IndexedDB (Dexie) — não precisa de servidor.
   */

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { db } from '$lib/state/db';
  import { t } from 'svelte-i18n';

  interface Note {
    id?: number;
    kind: 'text' | 'audio' | 'image' | 'file';
    title: string;
    body: string;
    category: 'escola' | 'habitos' | 'financas' | 'geral';
    createdAt: number;
    blob?: Blob;
  }

  let notes = $state<Note[]>([]);
  let selectedCategory = $state<'all' | Note['category']>('all');
  let searchTerm = $state('');
  let newTitle = $state('');
  let newBody = $state('');
  let newCategory = $state<Note['category']>('escola');
  let isRecording = $state(false);
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let recordingStart = 0;

  const CATEGORIES = $derived<{ key: Note['category']; label: string; icon: string }[]>([
    { key: 'escola', label: $t('caderno.filter.escola', { default: 'Escola' }), icon: '📚' },
    { key: 'habitos', label: $t('caderno.filter.habitos', { default: 'Hábitos' }), icon: '🌱' },
    { key: 'financas', label: $t('caderno.filter.financas', { default: 'Finanças' }), icon: '💰' },
    { key: 'geral', label: $t('caderno.filter.geral', { default: 'Geral' }), icon: '📝' }
  ]);

  onMount(async () => {
    if (browser) await refresh();
  });

  async function refresh() {
    notes = await db().notes.orderBy('createdAt').reverse().toArray();
  }

  async function addTextNote() {
    if (!newTitle.trim() && !newBody.trim()) return;
    await db().notes.add({
      kind: 'text',
      title: newTitle.trim() || get(t)('caderno.note.default_title', { default: 'Nota' }),
      body: newBody.trim(),
      category: newCategory,
      createdAt: Date.now()
    });
    newTitle = '';
    newBody = '';
    await refresh();
  }

  async function addImageNote(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await db().notes.add({
      kind: 'image',
      title: file.name,
      body: '',
      category: newCategory,
      createdAt: Date.now(),
      blob: file
    });
    input.value = '';
    await refresh();
  }

  async function addFileNote(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await db().notes.add({
      kind: 'file',
      title: file.name,
      body: '',
      category: newCategory,
      createdAt: Date.now(),
      blob: file
    });
    input.value = '';
    await refresh();
  }

  async function startRecording() {
    if (!browser || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const seconds = Math.round((Date.now() - recordingStart) / 1000);
        await db().notes.add({
          kind: 'audio',
          title: get(t)('caderno.note.audio_title', { default: 'Áudio ({n}s)' }).replace('{n}', String(seconds)),
          body: '',
          category: newCategory,
          createdAt: Date.now(),
          blob
        });
        stream.getTracks().forEach((t) => t.stop());
        await refresh();
      };
      mediaRecorder.start();
      recordingStart = Date.now();
      isRecording = true;
    } catch (err) {
      alert(get(t)('caderno.audio.permission_denied', { default: 'Não consegui aceder ao microfone. Permite o acesso nas definições do browser.' }));
      console.error(err);
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
    }
  }

  async function deleteNote(id: number) {
    if (!confirm(get(t)('caderno.confirm.delete', { default: 'Apagar esta nota?' }))) return;
    await db().notes.delete(id);
    await refresh();
  }

  function objectUrlFor(blob: Blob | undefined): string | null {
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  let filtered = $derived(
    notes.filter((n) => {
      const matchCat = selectedCategory === 'all' || n.category === selectedCategory;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch =
        !term ||
        n.title.toLowerCase().includes(term) ||
        n.body.toLowerCase().includes(term);
      return matchCat && matchSearch;
    })
  );
</script>

<svelte:head>
  <title>Meu Caderno · Escola · Presuntinho</title>
</svelte:head>

<div class="caderno">
  <header class="hero">
    <span class="hero-tag">{$t('caderno.hero.tag', { default: '📓 Meu Caderno' })}</span>
    <h1>{$t('caderno.hero.title', { default: 'O teu caderno pessoal' })}</h1>
    <p class="sub">{$t('caderno.hero.sub', { default: 'Anota tudo o que vais aprendendo. Texto, voz, imagens, ficheiros.' })}</p>
  </header>

  <section class="composer" aria-label={$t('caderno.composer.aria', { default: 'Nova nota' })}>
    <input
      type="text"
      class="title-input"
      placeholder={$t('caderno.placeholder.title', { default: 'Título (opcional)' })}
      bind:value={newTitle}
    />
    <textarea
      class="body-input"
      placeholder={$t('caderno.placeholder.body', { default: 'Escreve aqui a tua nota…' })}
      rows="3"
      bind:value={newBody}
    ></textarea>

    <div class="composer-row">
      <label class="cat-label">
        {$t('caderno.label.category', { default: 'Categoria:' })}
        <select bind:value={newCategory}>
          {#each CATEGORIES as cat (cat.key)}
            <option value={cat.key}>{cat.icon} {cat.label}</option>
          {/each}
        </select>
      </label>

      <div class="composer-actions">
        <button type="button" class="btn btn-primary" onclick={addTextNote}>
          {$t('caderno.btn.save', { default: '💾 Guardar nota' })}
        </button>

        {#if isRecording}
          <button type="button" class="btn btn-recording" onclick={stopRecording}>
            {$t('caderno.btn.stop_recording', { default: '⏹ Parar gravação' })}
          </button>
        {:else}
          <button type="button" class="btn btn-audio" onclick={startRecording}>
            {$t('caderno.btn.record', { default: '🎤 Gravar áudio' })}
          </button>
        {/if}

        <label class="btn btn-image">
          {$t('caderno.btn.image', { default: '📸 Imagem' })}
          <input type="file" accept="image/*" onchange={addImageNote} hidden />
        </label>

        <label class="btn btn-file">
          {$t('caderno.btn.file', { default: '📎 Ficheiro' })}
          <input type="file" onchange={addFileNote} hidden />
        </label>
      </div>
    </div>
  </section>

  <section class="filters" aria-label={$t('caderno.filters.aria', { default: 'Filtros' })}>
    <input
      type="search"
      class="search"
      placeholder={$t('caderno.search.placeholder', { default: '🔍 Procurar nas notas…' })}
      bind:value={searchTerm}
    />
    <div class="cat-chips">
      <button
        type="button"
        class="chip"
        class:chip-active={selectedCategory === 'all'}
        onclick={() => (selectedCategory = 'all')}
      >
        {$t('caderno.filter.all', { default: 'Todas' })}
      </button>
      {#each CATEGORIES as cat (cat.key)}
        <button
          type="button"
          class="chip"
          class:chip-active={selectedCategory === cat.key}
          onclick={() => (selectedCategory = cat.key)}
        >
          {cat.icon} {cat.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="notes-list" aria-label={$t('caderno.notes.aria', { default: 'As minhas notas' })}>
    {#if filtered.length === 0}
      <p class="empty">
        {notes.length === 0
          ? $t('caderno.empty.start', { default: 'Ainda não tens notas. Começa por escrever ou gravar algo em cima. ✨' })
          : $t('caderno.empty.filtered', { default: 'Nenhuma nota corresponde aos filtros atuais.' })}
      </p>
    {:else}
      {#each filtered as note (note.id)}
        <article class="note">
          <header class="note-head">
            <span class="note-icon" aria-hidden="true">
              {#if note.kind === 'text'}📝
              {:else if note.kind === 'audio'}🎤
              {:else if note.kind === 'image'}📸
              {:else if note.kind === 'file'}📎
              {/if}
            </span>
            <h3 class="note-title">{note.title}</h3>
            <span class="note-cat">{CATEGORIES.find((c) => c.key === note.category)?.icon}</span>
            <time class="note-date" datetime={new Date(note.createdAt).toISOString()}>
              {formatDate(note.createdAt)}
            </time>
            <button
              type="button"
              class="note-delete"
              onclick={() => note.id !== undefined && deleteNote(note.id)}
              aria-label={$t('caderno.note.delete_aria', { default: 'Apagar nota' })}
            >🗑</button>
          </header>

          {#if note.kind === 'text' && note.body}
            <p class="note-body">{note.body}</p>
          {:else if note.kind === 'audio' && note.blob}
            <audio controls preload="metadata" src={objectUrlFor(note.blob) ?? ''}></audio>
          {:else if note.kind === 'image' && note.blob}
            <img class="note-image" src={objectUrlFor(note.blob) ?? ''} alt={note.title} />
          {:else if note.kind === 'file' && note.blob}
            <a class="note-file" href={objectUrlFor(note.blob) ?? ''} download={note.title}>
              {$t('caderno.note.download', { default: '📥 Descarregar' })} {note.title}
            </a>
          {/if}
        </article>
      {/each}
    {/if}
  </section>
</div>

<style>
  .caderno {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 6rem;
  }
  .hero { text-align: center; margin-bottom: 1.5rem; }
  .hero-tag {
    display: inline-block;
    padding: 0.2rem 0.7rem;
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #a7f3d0;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .hero h1 { font-size: 1.75rem; margin: 0 0 0.4rem; color: #fff; }
  .sub { color: var(--txt2, #cbd5e1); margin: 0; }

  .composer {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .title-input, .body-input, .search, .cat-label select {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    border-radius: 0.5rem;
    padding: 0.55rem 0.7rem;
    font: inherit;
    width: 100%;
  }
  .body-input { resize: vertical; min-height: 70px; }
  .composer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }
  .cat-label { color: var(--txt2, #cbd5e1); font-size: 0.9rem; }
  .cat-label select { width: auto; min-width: 140px; }
  .composer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    border-radius: 0.5rem;
    padding: 0.5rem 0.8rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    transition: background 0.15s;
    min-height: 40px;
  }
  .btn:hover, .btn:focus-visible { background: rgba(255, 255, 255, 0.15); outline: none; }
  .btn-primary { background: #ec4899; border-color: #ec4899; }
  .btn-primary:hover { background: #db2777; }
  .btn-audio { background: #8b5cf6; border-color: #8b5cf6; }
  .btn-recording {
    background: #ef4444;
    border-color: #ef4444;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  .search { flex: 1; min-width: 200px; }
  .cat-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.78);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
  }
  .chip-active {
    background: #ec4899;
    border-color: #ec4899;
    color: #fff;
  }

  .empty {
    text-align: center;
    color: var(--txt2, #cbd5e1);
    padding: 2rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
  }

  .note {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 0.85rem 1rem;
    margin-bottom: 0.7rem;
  }
  .note-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }
  .note-icon { font-size: 1.1rem; }
  .note-title { margin: 0; font-size: 1rem; color: #fff; flex: 1; }
  .note-cat { font-size: 1rem; }
  .note-date {
    color: var(--txt3, #94a3b8);
    font-size: 0.75rem;
    margin-left: auto;
  }
  .note-delete {
    background: transparent;
    border: 0;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem 0.4rem;
    border-radius: 0.3rem;
    min-height: 32px;
    min-width: 32px;
  }
  .note-delete:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
  .note-body {
    color: var(--txt2, #cbd5e1);
    margin: 0.4rem 0 0;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .note-image {
    max-width: 100%;
    border-radius: 0.5rem;
    margin-top: 0.5rem;
    display: block;
  }
  audio {
    width: 100%;
    margin-top: 0.5rem;
  }
  .note-file {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.5rem 0.8rem;
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.4);
    color: #c4b5fd;
    border-radius: 0.5rem;
    text-decoration: none;
    font-size: 0.9rem;
  }
  .note-file:hover { background: rgba(139, 92, 246, 0.25); }
</style>