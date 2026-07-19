<script lang="ts">
  /**
   * /u/?h=<handle> — public profile v2. The heart of the social flow:
   * search someone → open their profile → ONE clear action per state:
   * add friend → accepted → message + couple request → couple active.
   * Works logged-out too (accounts are public rows) with a sign-up CTA.
   *
   * v2 (plano em docs/plano-perfil-v2.html): capa personalizada, linha meta
   * (📍 local · 🔗 site · 📅 desde), stats tripla (posts/amigos/❤), tabs
   * Publicações|Media, composer com anexos (fotos, vídeo, áudio, ficheiros),
   * grelha de imagens 1–4 estilo X, players inline, lightbox, post fixado
   * e edição de posts.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { page } from '$app/state';
  import { showToast } from '$lib/components/events';
  import { accountsEnabled, getAccountByHandle, normalizeHandle, type Account } from '$lib/account/auth';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import {
    sendConnect,
    acceptConnect,
    removeConnection,
    statusWith,
    subscribeConnections
  } from '$lib/account/contacts';
  import { listSpaces, isCoupleActive, subscribeSpaces, type Space } from '$lib/account/spaces';
  import { requestCouple, profileUrl, pokeCoupleLink } from '$lib/account/couple-link';
  import Avatar from '$lib/components/Avatar.svelte';
  import {
    listPosts,
    createPost,
    updatePost,
    setPinned,
    deletePost,
    toggleLike,
    listComments,
    addComment,
    timeAgo,
    linkify,
    fmtSize,
    classifyFile,
    validateAttachments,
    resolveMediaUrls,
    profileStats,
    type Post,
    type PostComment,
    type PostMedia,
    type ProfileStats
  } from '$lib/social/posts';

  type Phase = 'loading' | 'notfound' | 'ready';
  let phase = $state<Phase>('loading');
  let person = $state<Account | null>(null);
  let conn = $state<Awaited<ReturnType<typeof statusWith>>>(null);
  let coupleSpace = $state<Space | null>(null);
  let busy = $state(false);
  let unsubC: (() => void) | null = null;
  let unsubS: (() => void) | null = null;

  const meId = $derived(accountState.account?.id ?? '');
  const isSelf = $derived(Boolean(person && meId && person.id === meId));

  // ── Posts + media ──
  let posts = $state<Post[]>([]);
  let postsLoaded = $state(false);
  let mediaUrls = $state<Record<string, string>>({});
  let stats = $state<ProfileStats | null>(null);
  let tab = $state<'posts' | 'media'>('posts');
  let composer = $state('');
  let publishing = $state(false);
  let openComments = $state<Record<string, PostComment[]>>({});
  let commentDraft = $state<Record<string, string>>({});
  let commentBusy = $state<Record<string, boolean>>({});
  let editingId = $state<string | null>(null);
  let editDraft = $state('');
  let editBusy = $state(false);

  // ── Composer attachments ──
  interface PendingFile {
    file: File;
    kind: ReturnType<typeof classifyFile>;
    /** object URL para pré-visualizar imagens/vídeos */
    preview: string | null;
  }
  let pending = $state<PendingFile[]>([]);
  let fileInput: HTMLInputElement | null = $state(null);
  let fileAccept = $state('image/*');

  // ── Lightbox ──
  interface GalleryItem {
    media: PostMedia;
    url: string;
  }
  let lightbox = $state<{ items: GalleryItem[]; index: number } | null>(null);

  const attachErrKey: Record<string, string> = {
    'too-many': 'posts.attach_err_too_many',
    'one-video': 'posts.attach_err_one_video',
    'one-audio': 'posts.attach_err_one_audio',
    'video-too-big': 'posts.attach_err_video_big',
    'audio-too-big': 'posts.attach_err_audio_big',
    'file-too-big': 'posts.attach_err_file_big'
  };

  function pickFiles(accept: string): void {
    fileAccept = accept;
    // deixar o accept propagar antes de abrir o seletor
    requestAnimationFrame(() => fileInput?.click());
  }

  function onFilesChosen(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    if (!chosen.length) return;
    const next = [
      ...pending,
      ...chosen.map((file) => {
        const kind = classifyFile(file.type);
        const preview = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null;
        return { file, kind, preview };
      })
    ];
    const err = validateAttachments(next.map((p) => ({ kind: p.kind, size: p.file.size })));
    if (err) {
      for (const p of next.slice(pending.length)) if (p.preview) URL.revokeObjectURL(p.preview);
      showToast($t(attachErrKey[err], { default: 'Esse anexo não pode ser adicionado.' }), 3000, 'error');
      return;
    }
    pending = next;
  }

  function removePending(i: number): void {
    const p = pending[i];
    if (p?.preview) URL.revokeObjectURL(p.preview);
    pending = pending.filter((_, idx) => idx !== i);
  }

  function clearPending(): void {
    for (const p of pending) if (p.preview) URL.revokeObjectURL(p.preview);
    pending = [];
  }

  async function refreshPosts(): Promise<void> {
    if (!person || !accountState.account) return;
    try {
      posts = await listPosts(person.id);
      const all = posts.flatMap((p) => p.media);
      if (all.length) mediaUrls = { ...mediaUrls, ...(await resolveMediaUrls(all)) };
    } catch (e) {
      console.warn('[u] posts load failed', e);
    } finally {
      postsLoaded = true;
    }
  }

  async function refreshStats(): Promise<void> {
    if (!person) return;
    try {
      stats = await profileStats(person.id);
    } catch (e) {
      console.warn('[u] stats load failed', e);
    }
  }

  async function publish(): Promise<void> {
    if (publishing || (!composer.trim() && !pending.length)) return;
    publishing = true;
    try {
      await createPost(composer, pending.map((p) => p.file));
      composer = '';
      clearPending();
      await refreshPosts();
      void refreshStats();
      showToast($t('posts.published', { default: 'Publicado! 📣' }), 2200);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      publishing = false;
    }
  }

  async function onLike(p: Post): Promise<void> {
    // otimista — reverte no erro
    const was = p.likedByMe;
    p.likedByMe = !was;
    p.likeCount += was ? -1 : 1;
    posts = [...posts];
    try {
      await toggleLike(p.id, was);
    } catch {
      p.likedByMe = was;
      p.likeCount += was ? 1 : -1;
      posts = [...posts];
    }
  }

  async function onToggleComments(p: Post): Promise<void> {
    if (openComments[p.id]) {
      const { [p.id]: _gone, ...rest } = openComments;
      openComments = rest;
      return;
    }
    try {
      openComments = { ...openComments, [p.id]: await listComments(p.id) };
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 2600, 'error');
    }
  }

  async function onComment(p: Post): Promise<void> {
    const text = (commentDraft[p.id] ?? '').trim();
    if (!text || commentBusy[p.id]) return;
    commentBusy = { ...commentBusy, [p.id]: true };
    try {
      await addComment(p.id, text);
      commentDraft = { ...commentDraft, [p.id]: '' };
      openComments = { ...openComments, [p.id]: await listComments(p.id) };
      p.commentCount += 1;
      posts = [...posts];
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 2600, 'error');
    } finally {
      commentBusy = { ...commentBusy, [p.id]: false };
    }
  }

  async function onDeletePost(p: Post): Promise<void> {
    try {
      await deletePost(p.id, p.media);
      posts = posts.filter((x) => x.id !== p.id);
      void refreshStats();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 2600, 'error');
    }
  }

  async function onTogglePin(p: Post): Promise<void> {
    try {
      await setPinned(p.id, !p.pinned);
      await refreshPosts();
      showToast(p.pinned ? $t('posts.unpinned', { default: 'Desafixado.' }) : $t('posts.pinned_ok', { default: 'Fixado no topo! 📌' }), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 2600, 'error');
    }
  }

  function startEdit(p: Post): void {
    editingId = p.id;
    editDraft = p.body;
  }

  async function saveEdit(p: Post): Promise<void> {
    if (editBusy) return;
    editBusy = true;
    try {
      await updatePost(p.id, editDraft, p.media.length > 0);
      editingId = null;
      await refreshPosts();
      showToast($t('posts.edited_ok', { default: 'Publicação editada ✅' }), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 2600, 'error');
    } finally {
      editBusy = false;
    }
  }

  // ── Lightbox ──
  function visualsOf(p: Post): PostMedia[] {
    return p.media.filter((m) => m.kind === 'image' || m.kind === 'video');
  }

  function openLightbox(items: PostMedia[], index: number): void {
    const gallery = items
      .map((media) => ({ media, url: mediaUrls[media.path] }))
      .filter((g): g is GalleryItem => Boolean(g.url));
    if (!gallery.length) return;
    lightbox = { items: gallery, index: Math.min(index, gallery.length - 1) };
  }

  function lightboxStep(delta: number): void {
    if (!lightbox) return;
    const n = lightbox.items.length;
    lightbox = { ...lightbox, index: (lightbox.index + delta + n) % n };
  }

  function onLightboxKey(e: KeyboardEvent): void {
    if (!lightbox) return;
    if (e.key === 'Escape') lightbox = null;
    else if (e.key === 'ArrowRight') lightboxStep(1);
    else if (e.key === 'ArrowLeft') lightboxStep(-1);
  }

  // Todos os visuais do perfil (tab Media, estilo grelha do Instagram).
  const allVisuals = $derived(posts.flatMap((p) => visualsOf(p)));

  const coupleState = $derived.by<'none' | 'active' | 'pending-in' | 'pending-out'>(() => {
    if (!coupleSpace || !meId) return 'none';
    if (isCoupleActive(coupleSpace)) return 'active';
    const mine = coupleSpace.members.find((m) => m.id === meId);
    return mine?.status === 'pending' ? 'pending-in' : 'pending-out';
  });
  const canSeePosts = $derived(isSelf || conn?.status === 'accepted' || coupleState === 'active');

  async function refreshRelation(): Promise<void> {
    if (!person || !accountState.account || person.id === accountState.account.id) return;
    try {
      const [c, spaces] = await Promise.all([statusWith(person.id), listSpaces()]);
      conn = c;
      coupleSpace =
        spaces.find((s) => s.kind === 'couple' && s.members.some((m) => m.id === person!.id) && s.members.some((m) => m.id === meId)) ??
        null;
    } catch (e) {
      console.warn('[u] relation refresh failed', e);
    }
  }

  onMount(() => {
    void (async () => {
      const handle = normalizeHandle(page.url.searchParams.get('h') ?? '');
      if (!handle || !accountsEnabled()) {
        phase = 'notfound';
        return;
      }
      await startAccountSync();
      try {
        person = await getAccountByHandle(handle);
      } catch {
        person = null;
      }
      if (!person) {
        phase = 'notfound';
        return;
      }
      await refreshRelation();
      phase = 'ready';
      void refreshPosts();
      void refreshStats();
      unsubC = subscribeConnections(() => void refreshRelation());
      unsubS = subscribeSpaces(() => void refreshRelation());
    })();
  });
  onDestroy(() => {
    unsubC?.();
    unsubS?.();
    clearPending();
  });

  async function onAddFriend(): Promise<void> {
    if (!person || busy) return;
    busy = true;
    try {
      const r = await sendConnect(person.id);
      if (r === 'sent') showToast($t('uprofile.friend_sent', { values: { handle: person.handle }, default: 'Pedido de amizade enviado a @{handle} ✅' }), 2400);
      else if (r === 'accepted') showToast($t('uprofile.now_friends', { values: { handle: person.handle }, default: 'Vocês agora são amigos! 🎉' }), 2600);
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onCoupleRequest(): Promise<void> {
    if (!person || busy) return;
    busy = true;
    try {
      const r = await requestCouple(person);
      if (r === 'sent')
        showToast($t('uprofile.couple_sent', { values: { handle: person.handle }, default: '💌 Pedido de casal enviado! Quando @{handle} aceitar, ficam ligados.' }), 3000);
      else if (r === 'proposed')
        showToast($t('uprofile.couple_proposed', { values: { handle: person.handle }, default: '💌 Pedido de casal enviado a @{handle}!' }), 2600);
      else if (r === 'active') pokeCoupleLink(); // both consents present → celebrate
      else if (r === 'taken')
        showToast($t('couplelink.taken', { default: 'Um de vocês já tem um casal ativo — só há um de cada vez. 💔' }), 3200);
      else if (r === 'already')
        showToast($t('couplelink.already', { default: 'Já têm um pedido de casal entre vocês. 💞' }), 2400);
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onAcceptFriend(): Promise<void> {
    if (!conn || busy) return;
    busy = true;
    try {
      const { coupleActive } = await acceptConnect(conn.connectionId);
      showToast($t('uprofile.now_friends', { values: { handle: person?.handle ?? '' }, default: 'Vocês agora são amigos! 🎉' }), 2600);
      if (coupleActive) pokeCoupleLink();
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onRemoveConnection(): Promise<void> {
    if (!conn || busy) return;
    busy = true;
    try {
      await removeConnection(conn.connectionId);
      conn = null;
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function shareProfile(): Promise<void> {
    if (!person) return;
    const url = profileUrl(person.handle);
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `@${person.handle} · Presuntinho` });
        return;
      }
    } catch {
      /* cancelled — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast($t('uprofile.link_copied', { default: 'Link do perfil copiado! 📋' }), 2200);
    } catch {
      showToast(url, 4000);
    }
  }

  const displayName = $derived(person?.display_name || (person ? `@${person.handle}` : ''));
  const websiteLabel = $derived((person?.website ?? '').replace(/^https:\/\//, '').replace(/\/$/, ''));
  const joinedLabel = $derived.by(() => {
    if (!person?.created_at) return '';
    try {
      return new Date(person.created_at).toLocaleDateString($locale ?? 'pt-PT', { month: 'long', year: 'numeric' });
    } catch {
      return new Date(person.created_at).getFullYear().toString();
    }
  });

  const mediaIcon: Record<string, string> = { image: '🖼', video: '🎬', audio: '🎙', file: '📎' };
</script>

<svelte:head>
  <title>{person ? `@${person.handle}` : $t('uprofile.meta.title', { default: 'Perfil' })} · Presuntinho</title>
</svelte:head>

<svelte:window onkeydown={onLightboxKey} />

<div class="uprofile">
  <header class="topbar">
    <a class="back" href="/contactos/" aria-label={$t('contactos.title', { default: 'Contactos' })}>←</a>
    <h1>{$t('uprofile.title', { default: 'Perfil' })}</h1>
  </header>

  {#if phase === 'loading'}
    <p class="hint center">{$t('uprofile.loading', { default: 'A carregar…' })}</p>
  {:else if phase === 'notfound'}
    <div class="card center">
      <span class="big" aria-hidden="true">🔍</span>
      <h2>{$t('uprofile.notfound_title', { default: 'Perfil não encontrado' })}</h2>
      <p class="sub">{$t('uprofile.notfound_body', { default: 'Este @handle não existe (ou o link veio incompleto).' })}</p>
      <a class="cta" href="/contactos/">{$t('uprofile.search_people', { default: '🔍 Procurar pessoas' })}</a>
    </div>
  {:else if person}
    <div class="card profile">
      {#if person.cover_url}
        <img class="cover cover-img" src={person.cover_url} alt="" />
      {:else}
        <div class="cover" aria-hidden="true"></div>
      {/if}
      <span class="avatar-ring" aria-hidden="true">
        <Avatar emoji={person.emoji} url={person.avatar_url} size={96} alt="" />
      </span>
      <h2 class="name">{displayName}</h2>
      <p class="handle">@{person.handle}</p>
      {#if person.bio}
        <p class="bio">
          {#each linkify(person.bio) as seg, i (i)}
            {#if seg.type === 'link'}<a class="txt-link" href={seg.value} target="_blank" rel="noopener noreferrer">{seg.value}</a>{:else}{seg.value}{/if}
          {/each}
        </p>
      {/if}

      <!-- Linha meta estilo Twitter: 📍 local · 🔗 site · 📅 desde -->
      {#if person.location || person.website || joinedLabel}
        <p class="meta-row">
          {#if person.location}<span class="meta">📍 {person.location}</span>{/if}
          {#if person.website}
            <a class="meta txt-link" href={person.website} target="_blank" rel="noopener noreferrer">🔗 {websiteLabel}</a>
          {/if}
          {#if joinedLabel}
            <span class="meta">📅 {$t('uprofile.joined', { values: { date: joinedLabel }, default: 'Desde {date}' })}</span>
          {/if}
        </p>
      {/if}

      <div class="stats" aria-label={$t('uprofile.stats_aria', { default: 'Estatísticas do perfil' })}>
        <div class="stat">
          <strong>{postsLoaded ? posts.length : (stats?.posts ?? '–')}</strong>
          <span>{$t('posts.section', { default: 'Publicações' })}</span>
        </div>
        <div class="stat">
          <strong>{stats ? stats.friends : '–'}</strong>
          <span>{$t('uprofile.stats_friends', { default: 'Amigos' })}</span>
        </div>
        <div class="stat">
          <strong>{stats ? stats.likesReceived : '–'}</strong>
          <span>{$t('uprofile.stats_likes', { default: '❤ Recebidos' })}</span>
        </div>
        {#if coupleState === 'active'}
          <div class="stat">
            <strong>💞</strong>
            <span>{$t('couplelink.tag', { default: 'Casal' })}</span>
          </div>
        {/if}
      </div>

      {#if isSelf}
        <p class="state-tag self-tag">{$t('uprofile.self', { default: 'Este perfil és tu 😄' })}</p>
        <div class="actions">
          <a class="btn primary" href="/conta/">✏️ {$t('uprofile.edit_profile', { default: 'Editar perfil' })}</a>
          <button type="button" class="btn" onclick={shareProfile}>📤 {$t('uprofile.share', { default: 'Partilhar' })}</button>
        </div>
      {:else if !accountState.account}
        <p class="sub">{$t('uprofile.visitor_hint', { default: 'Cria a tua conta para adicionares esta pessoa.' })}</p>
        <div class="actions">
          <a class="btn primary" href="/conta/">{$t('uprofile.create_account', { default: 'Criar a minha conta 🐷' })}</a>
        </div>
      {:else}
        <!-- relationship state → ONE clear next action -->
        {#if coupleState === 'active'}
          <p class="state-tag couple">💞 {$t('uprofile.state_couple', { default: 'Vocês são um casal' })}</p>
          <div class="actions">
            <a class="btn primary" href={`/mensagens/?dm=${person.handle}`}>💬 {$t('uprofile.message', { default: 'Mensagem' })}</a>
          </div>
        {:else if coupleState === 'pending-in' && coupleSpace}
          <p class="state-tag couple">💌 {$t('uprofile.state_couple_in', { default: 'Pediu para serem um casal!' })}</p>
          <div class="actions">
            <a class="btn primary" href={`/casal/pedido/?space=${coupleSpace.id}`}>💞 {$t('uprofile.answer_couple', { default: 'Responder ao pedido' })}</a>
          </div>
        {:else if conn?.status === 'pending' && conn.direction === 'in' && conn.wantsCouple}
          <p class="state-tag couple">💌 {$t('uprofile.state_couple_in', { default: 'Pediu para serem um casal!' })}</p>
          <div class="actions">
            <a class="btn primary" href={`/casal/pedido/?conn=${conn.connectionId}`}>💞 {$t('uprofile.answer_couple', { default: 'Responder ao pedido' })}</a>
          </div>
        {:else}
          {#if conn?.status === 'accepted'}
            <p class="state-tag">✓ {$t('uprofile.state_friends', { default: 'Amigos' })}</p>
          {:else if conn?.status === 'pending' && conn.direction === 'out'}
            <p class="state-tag">{conn.wantsCouple ? `💌 ${$t('uprofile.state_couple_out', { default: 'Pedido de casal enviado' })}` : `⏳ ${$t('uprofile.state_pending_out', { default: 'Pedido enviado' })}`}</p>
          {:else if conn?.status === 'pending' && conn.direction === 'in'}
            <p class="state-tag">👋 {$t('uprofile.state_pending_in', { default: 'Quer ser teu amigo' })}</p>
          {/if}

          <div class="actions">
            {#if !conn}
              <button type="button" class="btn primary" disabled={busy} onclick={onAddFriend}>➕ {$t('uprofile.add_friend', { default: 'Adicionar amigo' })}</button>
              <button type="button" class="btn couple-btn" disabled={busy} onclick={onCoupleRequest}>💞 {$t('uprofile.ask_couple', { default: 'Pedir casal' })}</button>
            {:else if conn.status === 'pending' && conn.direction === 'in'}
              <button type="button" class="btn primary" disabled={busy} onclick={onAcceptFriend}>{$t('contactos.accept', { default: 'Aceitar' })}</button>
              <button type="button" class="btn subtle" disabled={busy} onclick={onRemoveConnection}>{$t('contactos.decline', { default: 'Recusar' })}</button>
            {:else if conn.status === 'pending' && conn.direction === 'out'}
              {#if !conn.wantsCouple}
                <button type="button" class="btn couple-btn" disabled={busy} onclick={onCoupleRequest}>💞 {$t('uprofile.ask_couple', { default: 'Pedir casal' })}</button>
              {/if}
              <button type="button" class="btn subtle" disabled={busy} onclick={onRemoveConnection}>{$t('contactos.cancel', { default: 'Cancelar' })}</button>
            {:else}
              <a class="btn primary" href={`/mensagens/?dm=${person.handle}`}>💬 {$t('uprofile.message', { default: 'Mensagem' })}</a>
              {#if coupleState === 'pending-out'}
                <span class="btn ghost">💌 {$t('uprofile.state_couple_out', { default: 'Pedido de casal enviado' })}</span>
              {:else}
                <button type="button" class="btn couple-btn" disabled={busy} onclick={onCoupleRequest}>💞 {$t('uprofile.ask_couple', { default: 'Pedir casal' })}</button>
              {/if}
            {/if}
          </div>
          {#if conn?.status === 'accepted'}
            <button type="button" class="unfriend" disabled={busy} onclick={onRemoveConnection}>{$t('uprofile.unfriend', { default: 'Remover amizade' })}</button>
          {/if}
        {/if}
      {/if}
    </div>

    <button type="button" class="share-row" onclick={shareProfile}>
      🔗 {$t('uprofile.share_link', { default: 'Partilhar o link deste perfil' })}
    </button>

    <!-- ── Tabs: Publicações | Media ── -->
    <div class="tabs" role="tablist" aria-label={$t('posts.tabs_aria', { default: 'Conteúdo do perfil' })}>
      <button type="button" role="tab" class="tab" class:sel={tab === 'posts'} aria-selected={tab === 'posts'} onclick={() => (tab = 'posts')}>
        📣 {$t('posts.tab_posts', { default: 'Publicações' })}
      </button>
      <button type="button" role="tab" class="tab" class:sel={tab === 'media'} aria-selected={tab === 'media'} onclick={() => (tab = 'media')}>
        🖼 {$t('posts.tab_media', { default: 'Media' })}
      </button>
    </div>

    {#if tab === 'media'}
      <!-- ── Grelha de media estilo Instagram ── -->
      <section class="media-tab" aria-label={$t('posts.tab_media', { default: 'Media' })}>
        {#if !accountState.account}
          <p class="posts-hint">{$t('posts.visitor', { default: 'Cria a tua conta para veres as publicações.' })}</p>
        {:else if !canSeePosts && allVisuals.length === 0}
          <p class="posts-hint">🔒 {$t('posts.locked', { default: 'As publicações são para amigos — envia um pedido de amizade para as veres.' })}</p>
        {:else if allVisuals.length === 0}
          <p class="posts-hint">{$t('posts.media_empty', { default: 'Ainda não há fotos nem vídeos por aqui. 📷' })}</p>
        {:else}
          <div class="media-grid">
            {#each allVisuals as m, i (m.path)}
              <button type="button" class="media-cell" onclick={() => openLightbox(allVisuals, i)} aria-label={$t('posts.open_media', { default: 'Abrir media' })}>
                {#if mediaUrls[m.path]}
                  {#if m.kind === 'image'}
                    <img src={mediaUrls[m.path]} alt="" loading="lazy" />
                  {:else}
                    <video src={mediaUrls[m.path]} preload="metadata" muted playsinline></video>
                    <span class="play-badge" aria-hidden="true">▶</span>
                  {/if}
                {:else}
                  <span class="cell-loading" aria-hidden="true">{mediaIcon[m.kind]}</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else}
    <!-- ── Posts ── -->
    <section class="posts" aria-label={$t('posts.section', { default: 'Publicações' })}>
      {#if isSelf}
        <div class="composer card-lite">
          <textarea
            bind:value={composer}
            maxlength="500"
            rows="3"
            placeholder={$t('posts.placeholder', { default: 'O que estás a pensar? 🐷' })}
          ></textarea>

          {#if pending.length}
            <div class="attach-previews">
              {#each pending as p, i (p.preview ?? p.file.name + i)}
                <div class="attach-chip" class:visual={Boolean(p.preview)}>
                  {#if p.kind === 'image' && p.preview}
                    <img src={p.preview} alt="" />
                  {:else if p.kind === 'video' && p.preview}
                    <video src={p.preview} muted playsinline preload="metadata"></video>
                    <span class="play-badge small" aria-hidden="true">▶</span>
                  {:else}
                    <span class="attach-file">{mediaIcon[p.kind]} <em>{p.file.name}</em> <small>{fmtSize(p.file.size)}</small></span>
                  {/if}
                  <button type="button" class="attach-x" onclick={() => removePending(i)} aria-label={$t('posts.remove_attachment', { default: 'Remover anexo' })}>✕</button>
                </div>
              {/each}
            </div>
          {/if}

          <div class="composer-row">
            <div class="attach-btns">
              <input type="file" bind:this={fileInput} accept={fileAccept} multiple hidden onchange={onFilesChosen} />
              <button type="button" class="attach" onclick={() => pickFiles('image/*')} aria-label={$t('posts.attach_image', { default: 'Anexar fotos' })}>🖼</button>
              <button type="button" class="attach" onclick={() => pickFiles('video/*')} aria-label={$t('posts.attach_video', { default: 'Anexar vídeo' })}>🎬</button>
              <button type="button" class="attach" onclick={() => pickFiles('audio/*')} aria-label={$t('posts.attach_audio', { default: 'Anexar áudio' })}>🎙</button>
              <button type="button" class="attach" onclick={() => pickFiles('*/*')} aria-label={$t('posts.attach_file', { default: 'Anexar ficheiro' })}>📎</button>
            </div>
            <small class="count">{composer.length}/500</small>
            <button type="button" class="publish" disabled={publishing || (!composer.trim() && !pending.length)} onclick={() => void publish()}>
              {publishing ? $t('posts.publishing', { default: 'A publicar…' }) : $t('posts.publish', { default: 'Publicar' })}
            </button>
          </div>
        </div>
      {/if}

      {#if !accountState.account}
        <p class="posts-hint">{$t('posts.visitor', { default: 'Cria a tua conta para veres as publicações.' })}</p>
      {:else if !canSeePosts && posts.length === 0}
        <p class="posts-hint">🔒 {$t('posts.locked', { default: 'As publicações são para amigos — envia um pedido de amizade para as veres.' })}</p>
      {:else if postsLoaded && posts.length === 0}
        <p class="posts-hint">{isSelf ? $t('posts.empty_own', { default: 'Ainda não publicaste nada. Diz olá ao mundo! 👋' }) : $t('posts.empty', { default: 'Ainda não há publicações por aqui.' })}</p>
      {:else}
        <ul class="post-list">
          {#each posts as p (p.id)}
            <li class="post card-lite" class:is-pinned={p.pinned}>
              {#if p.pinned}
                <p class="pin-tag">📌 {$t('posts.pinned', { default: 'Fixado' })}</p>
              {/if}
              <div class="post-head">
                <Avatar emoji={person.emoji} url={person.avatar_url} size={36} alt="" />
                <div class="post-who">
                  <strong>{displayName}</strong>
                  <small>
                    @{person.handle} · {timeAgo(p.created_at)}
                    {#if p.edited_at}· {$t('posts.edited', { default: 'editado' })}{/if}
                  </small>
                </div>
                {#if isSelf}
                  <div class="own-actions">
                    <button type="button" class="post-mini" onclick={() => void onTogglePin(p)} aria-label={p.pinned ? $t('posts.unpin', { default: 'Desafixar' }) : $t('posts.pin', { default: 'Fixar no topo' })}>{p.pinned ? '📌' : '📍'}</button>
                    <button type="button" class="post-mini" onclick={() => startEdit(p)} aria-label={$t('posts.edit', { default: 'Editar publicação' })}>✏️</button>
                    <button type="button" class="post-mini post-del" onclick={() => void onDeletePost(p)} aria-label={$t('posts.delete', { default: 'Apagar publicação' })}>🗑</button>
                  </div>
                {/if}
              </div>

              {#if editingId === p.id}
                <div class="edit-box">
                  <textarea bind:value={editDraft} maxlength="500" rows="3"></textarea>
                  <div class="edit-row">
                    <button type="button" class="btn subtle small-btn" onclick={() => (editingId = null)}>{$t('posts.edit_cancel', { default: 'Cancelar' })}</button>
                    <button type="button" class="publish small" disabled={editBusy || (!editDraft.trim() && !p.media.length)} onclick={() => void saveEdit(p)}>{$t('posts.edit_save', { default: 'Guardar' })}</button>
                  </div>
                </div>
              {:else if p.body}
                <p class="post-body">
                  {#each linkify(p.body) as seg, i (i)}
                    {#if seg.type === 'link'}<a class="txt-link" href={seg.value} target="_blank" rel="noopener noreferrer">{seg.value}</a>{:else}{seg.value}{/if}
                  {/each}
                </p>
              {/if}

              <!-- ── Media do post ── -->
              {#if p.media.length}
                {@const visuals = visualsOf(p)}
                {#if visuals.length}
                  <div class="post-visuals" data-count={Math.min(visuals.length, 4)}>
                    {#each visuals as m, i (m.path)}
                      {#if m.kind === 'image'}
                        <button type="button" class="visual" onclick={() => openLightbox(visuals, i)} aria-label={$t('posts.open_media', { default: 'Abrir media' })}>
                          {#if mediaUrls[m.path]}
                            <img src={mediaUrls[m.path]} alt="" loading="lazy" />
                          {:else}
                            <span class="cell-loading" aria-hidden="true">🖼</span>
                          {/if}
                        </button>
                      {:else}
                        <div class="visual video-wrap">
                          {#if mediaUrls[m.path]}
                            <!-- svelte-ignore a11y_media_has_caption -->
                            <video src={mediaUrls[m.path]} controls preload="metadata" playsinline></video>
                          {:else}
                            <span class="cell-loading" aria-hidden="true">🎬</span>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
                {#each p.media.filter((m) => m.kind === 'audio') as m (m.path)}
                  <div class="audio-wrap">
                    {#if mediaUrls[m.path]}
                      <audio src={mediaUrls[m.path]} controls preload="metadata"></audio>
                    {:else}
                      <span class="cell-loading" aria-hidden="true">🎙</span>
                    {/if}
                  </div>
                {/each}
                {#each p.media.filter((m) => m.kind === 'file') as m (m.path)}
                  <a class="file-card" href={mediaUrls[m.path] ?? '#'} target="_blank" rel="noopener noreferrer" download={m.name}>
                    <span class="file-ico" aria-hidden="true">📎</span>
                    <span class="file-meta">
                      <strong>{m.name}</strong>
                      <small>{fmtSize(m.size)} · {$t('posts.download', { default: 'Descarregar' })}</small>
                    </span>
                  </a>
                {/each}
              {/if}

              <div class="post-actions">
                <button type="button" class="pa" class:liked={p.likedByMe} onclick={() => void onLike(p)} aria-pressed={p.likedByMe}>
                  {p.likedByMe ? '❤️' : '🤍'} {p.likeCount}
                </button>
                <button type="button" class="pa" onclick={() => void onToggleComments(p)} aria-expanded={Boolean(openComments[p.id])}>
                  💬 {p.commentCount}
                </button>
              </div>
              {#if openComments[p.id]}
                <div class="comments">
                  {#each openComments[p.id] as c (c.id)}
                    <div class="comment">
                      <Avatar emoji={c.account?.emoji} url={c.account?.avatar_url} size={26} alt="" />
                      <div class="comment-body">
                        <strong>{c.account?.display_name || (c.account ? `@${c.account.handle}` : '?')}</strong>
                        <span>{c.body}</span>
                        <small>{timeAgo(c.created_at)}</small>
                      </div>
                    </div>
                  {/each}
                  <div class="comment-composer">
                    <input
                      type="text"
                      maxlength="300"
                      placeholder={$t('posts.comment_ph', { default: 'Escreve um comentário…' })}
                      bind:value={commentDraft[p.id]}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') void onComment(p);
                      }}
                    />
                    <button type="button" class="publish small" disabled={commentBusy[p.id] || !(commentDraft[p.id] ?? '').trim()} onclick={() => void onComment(p)}>➤</button>
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
    {/if}
  {/if}

  <!-- ── Lightbox ── -->
  {#if lightbox}
    {@const item = lightbox.items[lightbox.index]}
    <div class="lightbox" role="dialog" aria-modal="true" aria-label={$t('posts.lightbox_aria', { default: 'Visualizador de media' })}>
      <button type="button" class="lb-close" onclick={() => (lightbox = null)} aria-label={$t('posts.lightbox_close', { default: 'Fechar' })}>✕</button>
      <button type="button" class="lb-backdrop" onclick={() => (lightbox = null)} aria-label={$t('posts.lightbox_close', { default: 'Fechar' })}></button>
      {#if lightbox.items.length > 1}
        <button type="button" class="lb-nav prev" onclick={() => lightboxStep(-1)} aria-label={$t('posts.lightbox_prev', { default: 'Anterior' })}>‹</button>
      {/if}
      <div class="lb-stage">
        {#if item.media.kind === 'image'}
          <img src={item.url} alt="" />
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={item.url} controls autoplay playsinline></video>
        {/if}
        {#if lightbox.items.length > 1}
          <p class="lb-count">{lightbox.index + 1} / {lightbox.items.length}</p>
        {/if}
      </div>
      {#if lightbox.items.length > 1}
        <button type="button" class="lb-nav next" onclick={() => lightboxStep(1)} aria-label={$t('posts.lightbox_next', { default: 'Seguinte' })}>›</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .uprofile { max-width: 480px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt); }
  .topbar { display: flex; align-items: center; gap: .75rem; padding: .25rem 0 1rem; }
  .back { color: var(--txt); text-decoration: none; font-size: 1.4rem; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
  .back:hover { background: var(--card-hover, var(--card)); }
  .topbar h1 { margin: 0; font-size: 1.4rem; font-weight: 800; }
  .hint { color: var(--txt3); font-size: .9rem; }
  .center { text-align: center; }
  .card {
    display: flex; flex-direction: column; align-items: center; gap: .35rem;
    padding: 2rem 1.4rem 1.6rem; text-align: center;
    background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius-xl, 1.25rem); box-shadow: var(--shadow-md);
  }
  /* Perfil com capa: o card abre com a capa full-bleed (foto do utilizador ou
     gradiente rosa) e o avatar fica a cavalo entre a capa e o conteúdo
     (look Twitter/Instagram). */
  .card.profile { padding: 0 1.4rem 1.6rem; overflow: hidden; }
  .cover {
    width: calc(100% + 2.8rem);
    margin: 0 -1.4rem;
    height: clamp(96px, 26vw, 140px);
    background:
      radial-gradient(circle at 16% 30%, color-mix(in srgb, var(--accent) 45%, transparent), transparent 42%),
      radial-gradient(circle at 84% 12%, color-mix(in srgb, #a78bfa 40%, transparent), transparent 40%),
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, var(--bg-elev)), var(--card));
  }
  .cover-img { object-fit: cover; display: block; }
  .avatar-ring { margin-top: -48px; background: var(--card); }
  .meta-row { margin: .55rem 0 0; display: flex; flex-wrap: wrap; justify-content: center; gap: .3rem .9rem; }
  .meta { color: var(--txt3); font-size: .82rem; font-weight: 600; }
  .txt-link { color: var(--accent); text-decoration: none; overflow-wrap: anywhere; }
  .txt-link:hover { text-decoration: underline; }
  .stats {
    display: flex; justify-content: center; gap: 1.6rem;
    margin-top: .9rem; padding-top: .8rem; width: 100%;
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .stat { display: grid; gap: .1rem; justify-items: center; }
  .stat strong { font-size: 1.2rem; line-height: 1; }
  .stat span { color: var(--txt3); font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .big { font-size: 2.6rem; }
  .name { margin: .6rem 0 0; font-size: 1.35rem; font-weight: 800; }
  .handle { margin: 0; color: var(--txt3); font-weight: 700; }
  .bio { margin: .4rem 0 0; color: var(--txt2); font-size: .92rem; line-height: 1.5; max-width: 34ch; }
  .sub { margin: .4rem 0 0; color: var(--txt2); font-size: .9rem; line-height: 1.5; }
  .state-tag {
    margin: .8rem 0 0; font-weight: 800; font-size: .85rem; color: var(--txt2);
    background: var(--bg-elev); border: 1px solid var(--border);
    padding: .35rem .9rem; border-radius: 999px;
  }
  .state-tag.couple { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .state-tag.self-tag { color: var(--accent); }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; margin-top: .9rem; width: 100%; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .35rem;
    min-height: 46px; padding: 0 1.15rem; border-radius: 999px; font: inherit; font-weight: 800;
    border: 1px solid var(--border); background: var(--bg-elev); color: var(--txt);
    text-decoration: none; cursor: pointer;
  }
  .btn:disabled { opacity: .6; cursor: wait; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }
  .btn.primary:hover { filter: brightness(1.06); }
  .btn.couple-btn { border-color: color-mix(in srgb, var(--accent) 65%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .btn.couple-btn:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .btn.subtle { color: var(--txt2); }
  .btn.ghost { border-style: dashed; color: var(--txt3); cursor: default; }
  .small-btn { min-height: 38px; padding: 0 .9rem; font-size: .85rem; }
  .unfriend {
    margin-top: .9rem; background: none; border: 0; color: var(--txt3);
    font: inherit; font-size: .8rem; text-decoration: underline; cursor: pointer;
  }
  .unfriend:hover { color: var(--error, #ef4444); }
  .cta {
    display: inline-flex; align-items: center; justify-content: center; min-height: 46px;
    padding: 0 1.5rem; margin-top: .6rem; font-weight: 800; text-decoration: none;
    color: var(--on-accent, #fff); background: var(--accent); border-radius: 999px;
  }
  .share-row {
    display: block; width: 100%; margin-top: .8rem; padding: .8rem 1rem; text-align: center;
    background: transparent; border: 1px dashed var(--border); border-radius: var(--radius-lg, 1rem);
    color: var(--txt2); font: inherit; font-weight: 700; cursor: pointer;
  }
  .share-row:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Tabs ── */
  .tabs { display: flex; gap: .4rem; margin-top: 1.1rem; border-bottom: 2px solid color-mix(in srgb, var(--border) 70%, transparent); }
  .tab {
    flex: 1; min-height: 44px; border: 0; background: transparent; color: var(--txt3);
    font: inherit; font-weight: 800; font-size: .88rem; cursor: pointer;
    border-bottom: 3px solid transparent; margin-bottom: -2px; border-radius: .4rem .4rem 0 0;
  }
  .tab:hover { color: var(--txt); background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .tab.sel { color: var(--accent); border-bottom-color: var(--accent); }
  .tab:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  /* ── Posts ── */
  .avatar-ring { display: inline-flex; border-radius: 999px; box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 10%, transparent); border: 3px solid color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .posts { margin-top: .9rem; display: flex; flex-direction: column; gap: .7rem; }
  .card-lite { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg, 1rem); padding: .85rem; box-shadow: var(--shadow-sm, none); }
  .composer textarea, .edit-box textarea { width: 100%; font: inherit; color: var(--txt); background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-md, .75rem); padding: .65rem .8rem; resize: vertical; }
  .composer textarea:focus-visible, .edit-box textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
  .composer-row { display: flex; align-items: center; gap: .5rem; margin-top: .45rem; }
  .attach-btns { display: flex; gap: .15rem; flex: 1; }
  .attach {
    width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
    border: 0; background: transparent; border-radius: 999px; font-size: 1.05rem; cursor: pointer;
  }
  .attach:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .attach:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .count { color: var(--txt3); font-size: .75rem; }
  .publish { border: 0; border-radius: 999px; min-height: 40px; padding: 0 1.2rem; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 800; cursor: pointer; }
  .publish:disabled { opacity: .55; cursor: not-allowed; }
  .publish.small { min-height: 38px; min-width: 44px; padding: 0 .7rem; }

  /* pré-visualizações de anexos no composer */
  .attach-previews { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .55rem; }
  .attach-chip { position: relative; display: inline-flex; align-items: center; max-width: 100%; border: 1px solid var(--border); border-radius: var(--radius-md, .75rem); overflow: hidden; background: var(--bg-elev); }
  .attach-chip.visual { width: 84px; height: 84px; }
  .attach-chip img, .attach-chip video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .attach-file { display: inline-flex; align-items: center; gap: .4rem; padding: .45rem 2rem .45rem .6rem; font-size: .8rem; color: var(--txt2); max-width: 240px; }
  .attach-file em { font-style: normal; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .attach-file small { color: var(--txt3); flex-shrink: 0; }
  .attach-x {
    position: absolute; top: .2rem; right: .2rem; width: 24px; height: 24px;
    border: 0; border-radius: 999px; background: color-mix(in srgb, #000 55%, transparent); color: #fff;
    font-size: .7rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  }
  .posts-hint { margin: 0; color: var(--txt3); font-size: .88rem; text-align: center; padding: .8rem .5rem; line-height: 1.5; }
  .post-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .7rem; }
  .post.is-pinned { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .pin-tag { margin: 0 0 .45rem; color: var(--accent); font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
  .post-head { display: flex; align-items: center; gap: .6rem; }
  .post-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .post-who strong { font-size: .92rem; }
  .post-who small { color: var(--txt3); font-size: .75rem; }
  .own-actions { display: flex; gap: .1rem; }
  .post-mini { border: 0; background: transparent; color: var(--txt3); cursor: pointer; font-size: .95rem; padding: .3rem; border-radius: 999px; min-width: 32px; min-height: 32px; }
  .post-mini:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .post-del:hover { color: var(--error, #ef4444); }
  .post-body { margin: .55rem 0 .2rem; color: var(--txt); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; }
  .edit-box { margin-top: .55rem; }
  .edit-row { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .45rem; }

  /* grelha de imagens/vídeos 1–4 (padrão Twitter) */
  .post-visuals { display: grid; gap: 3px; margin-top: .55rem; border-radius: var(--radius-md, .75rem); overflow: hidden; }
  .post-visuals[data-count="1"] { grid-template-columns: 1fr; }
  .post-visuals[data-count="2"] { grid-template-columns: 1fr 1fr; }
  .post-visuals[data-count="3"] { grid-template-columns: 1fr 1fr; }
  .post-visuals[data-count="3"] > :first-child { grid-row: span 2; }
  .post-visuals[data-count="4"] { grid-template-columns: 1fr 1fr; }
  .visual { position: relative; border: 0; padding: 0; background: var(--bg-elev); cursor: pointer; min-height: 120px; display: block; width: 100%; }
  .post-visuals[data-count="1"] .visual { min-height: 160px; }
  .visual img, .visual video { width: 100%; height: 100%; object-fit: cover; display: block; max-height: 420px; }
  .post-visuals[data-count="1"] .visual img { object-fit: contain; background: var(--bg-elev); }
  .video-wrap { cursor: default; }
  .video-wrap video { object-fit: contain; }
  .play-badge {
    position: absolute; inset: 0; margin: auto; width: 44px; height: 44px;
    display: grid; place-items: center; border-radius: 999px; pointer-events: none;
    background: color-mix(in srgb, #000 55%, transparent); color: #fff; font-size: 1rem;
  }
  .play-badge.small { width: 30px; height: 30px; font-size: .75rem; }
  .cell-loading { display: grid; place-items: center; width: 100%; height: 100%; min-height: 120px; font-size: 1.5rem; color: var(--txt3); }

  .audio-wrap { margin-top: .55rem; }
  .audio-wrap audio { width: 100%; }
  .file-card {
    display: flex; align-items: center; gap: .6rem; margin-top: .55rem; padding: .6rem .75rem;
    border: 1px solid var(--border); border-radius: var(--radius-md, .75rem);
    background: var(--bg-elev); text-decoration: none; color: var(--txt); text-align: start;
  }
  .file-card:hover { border-color: var(--accent); }
  .file-ico { font-size: 1.3rem; }
  .file-meta { min-width: 0; display: flex; flex-direction: column; }
  .file-meta strong { font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-meta small { color: var(--txt3); font-size: .74rem; }

  .post-actions { display: flex; gap: .5rem; margin-top: .55rem; }
  .pa { border: 1px solid var(--border); background: var(--bg-elev); color: var(--txt2); border-radius: 999px; min-height: 36px; padding: 0 .8rem; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }
  .pa:hover { border-color: var(--accent); }
  .pa.liked { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .comments { margin-top: .6rem; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); padding-top: .6rem; display: flex; flex-direction: column; gap: .5rem; }
  .comment { display: flex; gap: .5rem; align-items: flex-start; }
  .comment-body { flex: 1; min-width: 0; font-size: .88rem; line-height: 1.4; text-align: start; }
  .comment-body strong { margin-inline-end: .35rem; }
  .comment-body small { display: block; color: var(--txt3); font-size: .72rem; margin-top: .1rem; }
  .comment-composer { display: flex; gap: .45rem; }
  .comment-composer input { flex: 1; font: inherit; color: var(--txt); background: var(--bg-elev); border: 1px solid var(--border); border-radius: 999px; padding: .5rem .9rem; min-height: 40px; }
  .comment-composer input:focus-visible { outline: none; border-color: var(--accent); }

  /* ── Tab Media (grelha estilo Instagram) ── */
  .media-tab { margin-top: .9rem; }
  .media-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; border-radius: var(--radius-md, .75rem); overflow: hidden; }
  .media-cell { position: relative; border: 0; padding: 0; background: var(--bg-elev); cursor: pointer; aspect-ratio: 1; }
  .media-cell img, .media-cell video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .media-cell:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--accent); }

  /* ── Lightbox ── */
  .lightbox { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; }
  .lb-backdrop { position: absolute; inset: 0; border: 0; background: color-mix(in srgb, #000 88%, transparent); cursor: zoom-out; }
  .lb-stage { position: relative; z-index: 1; max-width: min(96vw, 900px); max-height: 86dvh; display: grid; place-items: center; pointer-events: none; }
  .lb-stage img, .lb-stage video { max-width: 100%; max-height: 82dvh; border-radius: .6rem; pointer-events: auto; }
  .lb-count { margin: .5rem 0 0; color: #fff; font-size: .8rem; font-weight: 700; text-align: center; }
  .lb-close {
    position: absolute; top: max(.8rem, env(safe-area-inset-top)); right: .8rem; z-index: 2;
    width: 44px; height: 44px; border: 0; border-radius: 999px; cursor: pointer;
    background: color-mix(in srgb, #fff 14%, transparent); color: #fff; font-size: 1.1rem;
  }
  .lb-nav {
    position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
    width: 44px; height: 64px; border: 0; cursor: pointer; font-size: 1.8rem; color: #fff;
    background: color-mix(in srgb, #fff 10%, transparent); border-radius: .6rem;
  }
  .lb-nav.prev { left: .5rem; }
  .lb-nav.next { right: .5rem; }
  .lb-close:focus-visible, .lb-nav:focus-visible, .lb-backdrop:focus-visible { outline: 2px solid #fff; }
</style>
