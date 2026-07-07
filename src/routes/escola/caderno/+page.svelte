<script lang="ts">
  /**
   * Meu Caderno — caderno pessoal da Fatma.
   * Notas, áudios (gravações), imagens e ficheiros.
   * Tudo organizado por categoria (escola / hábitos / finanças / geral).
   * Persistência local via IndexedDB (Dexie) — não precisa de servidor.
   */

  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { db } from '$lib/state/db';
  import { awardBadge } from '$lib/state/stores';
  import { locale, t } from 'svelte-i18n';

  interface Note {
    id?: number;
    kind: 'text' | 'audio' | 'image' | 'file';
    title: string;
    body: string;
    category: 'escola' | 'habitos' | 'financas' | 'geral';
    createdAt: number;
    /** Additive (non-indexed): set the first time a text note is edited. */
    updatedAt?: number;
    blob?: Blob;
  }

  /** Shape persisted to localStorage while the user is composing a note. */
  interface Draft {
    title: string;
    body: string;
    category: Note['category'];
  }

  // Namespaced key so the in-progress composer survives a mid-typing
  // navigation away (SvelteKit unmounts the page → onDestroy flushes it,
  // onMount restores it). Kept in localStorage, not Dexie, because it is
  // ephemeral scratch state, not a saved note.
  const DRAFT_KEY = 'presuntinho:caderno-draft';

  let notes = $state<Note[]>([]);
  let selectedCategory = $state<'all' | Note['category']>('all');
  let searchTerm = $state('');
  let newTitle = $state('');
  let newBody = $state('');
  let newCategory = $state<Note['category']>('escola');
  let isRecording = $state(false);
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let audioChunks: Blob[] = [];
  let recordingStart = 0;
  const dateLocale = $derived($locale || 'pt-PT');

  // ── Draft autosave (new text-note composer) ──────────────────────────
  let draftSaved = $state(false); // true when a non-empty draft is persisted
  let draftLoaded = $state(false); // gate: don't persist before the restore

  // ── Inline edit (existing text notes only) ───────────────────────────
  let editingId = $state<number | null>(null);
  let editTitle = $state('');
  let editBody = $state('');
  let savingEdit = $state(false);

  /** Low-level write — no reactive state, safe to call from onDestroy. */
  function writeDraft(d: Draft): void {
    if (!browser) return;
    try {
      if (d.title.trim() || d.body.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* private mode / quota exceeded — draft autosave is best-effort */
    }
  }

  /** Debounced writer that also drives the "rascunho guardado" affordance. */
  function persistDraft(d: Draft): void {
    writeDraft(d);
    draftSaved = Boolean(d.title.trim() || d.body.trim());
  }

  function clearDraft(): void {
    if (browser) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
    draftSaved = false;
  }

  function restoreDraft(): void {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Draft>;
        if (typeof d.title === 'string') newTitle = d.title;
        if (typeof d.body === 'string') newBody = d.body;
        if (
          d.category === 'escola' ||
          d.category === 'habitos' ||
          d.category === 'financas' ||
          d.category === 'geral'
        ) {
          newCategory = d.category;
        }
        draftSaved = Boolean(newTitle.trim() || newBody.trim());
      }
    } catch {
      /* malformed JSON / private mode — start with an empty composer */
    }
    draftLoaded = true;
  }

  function discardDraft(): void {
    newTitle = '';
    newBody = '';
    clearDraft();
  }

  // Debounced autosave: any change to title / body / category schedules a
  // write ~400ms later; a fresh change cancels the pending one. Gated by
  // draftLoaded so the initial restore isn't clobbered by an empty write.
  $effect(() => {
    const snapshot: Draft = { title: newTitle, body: newBody, category: newCategory };
    if (!draftLoaded) return;
    const id = setTimeout(() => persistDraft(snapshot), 400);
    return () => clearTimeout(id);
  });

  const CATEGORIES = $derived<{ key: Note['category']; label: string; icon: string }[]>([
    { key: 'escola', label: $t('caderno.filter.escola', { default: 'Escola' }), icon: '📚' },
    { key: 'habitos', label: $t('caderno.filter.habitos', { default: 'Hábitos' }), icon: '🌱' },
    { key: 'financas', label: $t('caderno.filter.financas', { default: 'Finanças' }), icon: '💰' },
    { key: 'geral', label: $t('caderno.filter.geral', { default: 'Geral' }), icon: '📝' }
  ]);

  onMount(async () => {
    if (browser) {
      restoreDraft();
      await refresh();
    }
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
    clearDraft(); // note committed — the composer draft is no longer needed
    void awardBadge('b5'); // Wordsmith — first note ever (idempotent)
    await refresh();
  }

  function startEdit(note: Note): void {
    // Only text notes are editable — audio/image/file blobs stay immutable.
    if (note.kind !== 'text' || note.id === undefined) return;
    editingId = note.id;
    editTitle = note.title;
    editBody = note.body;
  }

  function cancelEdit(): void {
    editingId = null;
    editTitle = '';
    editBody = '';
  }

  async function saveEdit(): Promise<void> {
    if (editingId === null) return;
    const title = editTitle.trim();
    const body = editBody.trim();
    if (!title && !body) return; // keep at least a title or a body
    savingEdit = true;
    try {
      // `changes` is a declared variable (not an object literal) so the
      // additive, non-indexed `updatedAt` field passes Dexie's UpdateSpec
      // typing. createdAt is intentionally left untouched.
      const changes: Partial<Note> = {
        title: title || get(t)('caderno.note.default_title', { default: 'Nota' }),
        body,
        updatedAt: Date.now()
      };
      await db().notes.update(editingId, changes);
      editingId = null;
      editTitle = '';
      editBody = '';
      await refresh();
    } finally {
      savingEdit = false;
    }
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
    void awardBadge('b5');
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
    void awardBadge('b5');
    await refresh();
  }

  async function startRecording() {
    if (!browser || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream = stream;
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
        mediaStream = null;
        void awardBadge('b5');
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
    releaseObjectUrl(id);
    await refresh();
  }

  // Object-URL cache: one URL per note, created lazily on first render
  // and revoked on delete/unmount.  The old code called
  // URL.createObjectURL on EVERY render pass, leaking a new blob URL
  // each time the list re-rendered.
  const objectUrls = new Map<number, string>();

  function objectUrlFor(note: Note): string | null {
    if (!note.blob || note.id === undefined) return null;
    let url = objectUrls.get(note.id);
    if (!url) {
      url = URL.createObjectURL(note.blob);
      objectUrls.set(note.id, url);
    }
    return url;
  }

  function releaseObjectUrl(id: number): void {
    const url = objectUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(id);
    }
  }

  onDestroy(() => {
    // Flush the in-progress draft synchronously: the debounced effect's
    // pending timer is cancelled on unmount, so a navigation within ~400ms
    // of the last keystroke would otherwise lose those characters.
    writeDraft({ title: newTitle, body: newBody, category: newCategory });
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
    // Se sair a meio de uma gravação, o onstop nunca corre — largar o
    // microfone à mão para não ficar o indicador vermelho ligado.
    if (mediaRecorder && isRecording) {
      try { mediaRecorder.stop(); } catch { /* ignore */ }
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
  });

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString(dateLocale, {
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
  <title>{$t('routes.escola.caderno.title', { default: 'Meu Caderno' })} · {$t('routes.escola.title', { default: 'Escola' })} · Presuntinho</title>
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

    {#if draftSaved}
      <div class="draft-status" aria-live="polite">
        <span class="draft-note">
          {$t('caderno.draft.saved', { default: '✓ Rascunho guardado automaticamente' })}
        </span>
        <button type="button" class="draft-discard" onclick={discardDraft}>
          {$t('caderno.draft.discard', { default: 'Descartar rascunho' })}
        </button>
      </div>
    {/if}
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
        <article class="note" class:note-editing={note.id === editingId}>
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
            {#if note.id !== editingId}
              {#if note.kind === 'text'}
                <button
                  type="button"
                  class="note-edit"
                  onclick={() => startEdit(note)}
                  aria-label={$t('caderno.note.edit_aria', { default: 'Editar nota' })}
                >✏️</button>
              {/if}
              <button
                type="button"
                class="note-delete"
                onclick={() => note.id !== undefined && deleteNote(note.id)}
                aria-label={$t('caderno.note.delete_aria', { default: 'Apagar nota' })}
              >🗑</button>
            {/if}
          </header>

          {#if note.id === editingId}
            <div class="note-editor">
              <input
                type="text"
                class="title-input"
                placeholder={$t('caderno.placeholder.title', { default: 'Título (opcional)' })}
                bind:value={editTitle}
              />
              <textarea
                class="body-input"
                placeholder={$t('caderno.placeholder.body', { default: 'Escreve aqui a tua nota…' })}
                rows="3"
                bind:value={editBody}
              ></textarea>
              <div class="editor-actions">
                <button type="button" class="btn btn-primary" onclick={saveEdit} disabled={savingEdit}>
                  {savingEdit
                    ? $t('caderno.edit.saving', { default: 'A guardar…' })
                    : $t('caderno.edit.save', { default: '✔ Guardar alterações' })}
                </button>
                <button type="button" class="btn btn-ghost" onclick={cancelEdit} disabled={savingEdit}>
                  {$t('caderno.edit.cancel', { default: 'Cancelar' })}
                </button>
              </div>
            </div>
          {:else if note.kind === 'text' && note.body}
            <p class="note-body">{note.body}</p>
          {:else if note.kind === 'audio' && note.blob}
            <audio controls preload="metadata" src={objectUrlFor(note) ?? ''}></audio>
          {:else if note.kind === 'image' && note.blob}
            <img class="note-image" src={objectUrlFor(note) ?? ''} alt={note.title} />
          {:else if note.kind === 'file' && note.blob}
            <a class="note-file" href={objectUrlFor(note) ?? ''} download={note.title}>
              {$t('caderno.note.download', { default: '📥 Descarregar' })} {note.title}
            </a>
          {/if}

          {#if note.updatedAt && note.id !== editingId}
            <span class="note-edited">
              {$t('caderno.note.edited', { default: 'editado' })} · {formatDate(note.updatedAt)}
            </span>
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
  .sub { color: var(--txt2); margin: 0; }

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
  .cat-label { color: var(--txt2); font-size: 0.9rem; }
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
  .btn-primary { background: var(--accent); border-color: var(--accent); }
  .btn-primary:hover { background: var(--accent-hover, var(--accent)); }
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
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent, #fff);
  }

  .empty {
    text-align: center;
    color: var(--txt2);
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
    color: var(--txt3);
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
    color: var(--txt2);
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

  /* ── Draft autosave affordance ─────────────────────────────────── */
  .draft-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.1rem;
  }
  .draft-note {
    color: var(--txt3);
    font-size: 0.78rem;
  }
  .draft-discard {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--txt2);
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.8rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
    min-height: var(--touch-target);
  }
  .draft-discard:hover,
  .draft-discard:focus-visible {
    border-color: var(--accent);
    color: var(--txt);
    outline: none;
  }

  /* ── Edit existing text notes ──────────────────────────────────── */
  .note-editing {
    border-color: var(--accent);
  }
  .note-edit {
    background: transparent;
    border: 0;
    color: var(--txt3);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem 0.4rem;
    border-radius: var(--radius-sm);
    /* Matches the sibling .note-delete tap area for a consistent header row. */
    min-height: 32px;
    min-width: 32px;
  }
  .note-edit:hover,
  .note-edit:focus-visible {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    outline: none;
  }
  .note-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .editor-actions .btn {
    min-height: var(--touch-target);
  }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--txt2);
  }
  .btn-ghost:hover,
  .btn-ghost:focus-visible {
    background: var(--card-hover);
    color: var(--txt);
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .note-edited {
    display: inline-block;
    margin-top: 0.4rem;
    color: var(--txt3);
    font-size: 0.72rem;
    font-style: italic;
  }
</style>