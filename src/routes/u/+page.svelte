<script lang="ts">
  /**
   * /u/?h=<handle> — public profile. The heart of the social flow:
   * search someone → open their profile → ONE clear action per state:
   * add friend → accepted → message + couple request → couple active.
   * Works logged-out too (accounts are public rows) with a sign-up CTA.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
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
  import { listSpaces, isCoupleActive, otherMember, subscribeSpaces, type Space } from '$lib/account/spaces';
  import { requestCouple, profileUrl, pokeCoupleLink } from '$lib/account/couple-link';
  import Avatar from '$lib/components/Avatar.svelte';
  import {
    listPosts,
    createPost,
    deletePost,
    toggleLike,
    listComments,
    addComment,
    timeAgo,
    type Post,
    type PostComment
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

  // ── Posts (estilo Twitter) — visíveis para o próprio + amigos aceites ──
  let posts = $state<Post[]>([]);
  let postsLoaded = $state(false);
  let composer = $state('');
  let publishing = $state(false);
  let openComments = $state<Record<string, PostComment[]>>({});
  let commentDraft = $state<Record<string, string>>({});
  let commentBusy = $state<Record<string, boolean>>({});

  async function refreshPosts(): Promise<void> {
    if (!person || !accountState.account) return;
    try {
      posts = await listPosts(person.id);
    } catch (e) {
      console.warn('[u] posts load failed', e);
    } finally {
      postsLoaded = true;
    }
  }

  async function publish(): Promise<void> {
    if (publishing || !composer.trim()) return;
    publishing = true;
    try {
      await createPost(composer);
      composer = '';
      await refreshPosts();
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
      await deletePost(p.id);
      posts = posts.filter((x) => x.id !== p.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 2600, 'error');
    }
  }
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
      unsubC = subscribeConnections(() => void refreshRelation());
      unsubS = subscribeSpaces(() => void refreshRelation());
    })();
  });
  onDestroy(() => {
    unsubC?.();
    unsubS?.();
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
</script>

<svelte:head>
  <title>{person ? `@${person.handle}` : $t('uprofile.meta.title', { default: 'Perfil' })} · Presuntinho</title>
</svelte:head>

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
      <div class="cover" aria-hidden="true"></div>
      <span class="avatar-ring" aria-hidden="true">
        <Avatar emoji={person.emoji} url={person.avatar_url} size={96} alt="" />
      </span>
      <h2 class="name">{displayName}</h2>
      <p class="handle">@{person.handle}</p>
      {#if person.bio}<p class="bio">{person.bio}</p>{/if}

      <div class="stats" aria-label={$t('uprofile.stats_aria', { default: 'Estatísticas do perfil' })}>
        <div class="stat">
          <strong>{postsLoaded ? posts.length : '–'}</strong>
          <span>{$t('posts.section', { default: 'Publicações' })}</span>
        </div>
        {#if coupleState === 'active'}
          <div class="stat">
            <strong>💞</strong>
            <span>{$t('couplelink.tag', { default: 'Casal' })}</span>
          </div>
        {:else if conn?.status === 'accepted'}
          <div class="stat">
            <strong>✓</strong>
            <span>{$t('uprofile.state_friends', { default: 'Amigos' })}</span>
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

    <!-- ── Posts ── -->
    <section class="posts" aria-label={$t('posts.section', { default: 'Publicações' })}>
      <h3 class="posts-title">📣 {$t('posts.section', { default: 'Publicações' })}</h3>

      {#if isSelf}
        <div class="composer card-lite">
          <textarea
            bind:value={composer}
            maxlength="500"
            rows="3"
            placeholder={$t('posts.placeholder', { default: 'O que estás a pensar? 🐷' })}
          ></textarea>
          <div class="composer-row">
            <small class="count">{composer.length}/500</small>
            <button type="button" class="publish" disabled={publishing || !composer.trim()} onclick={() => void publish()}>
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
            <li class="post card-lite">
              <div class="post-head">
                <Avatar emoji={person.emoji} url={person.avatar_url} size={36} alt="" />
                <div class="post-who">
                  <strong>{displayName}</strong>
                  <small>@{person.handle} · {timeAgo(p.created_at)}</small>
                </div>
                {#if isSelf}
                  <button type="button" class="post-del" onclick={() => void onDeletePost(p)} aria-label={$t('posts.delete', { default: 'Apagar publicação' })}>🗑</button>
                {/if}
              </div>
              <p class="post-body">{p.body}</p>
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
  /* Perfil com capa: o card abre com um gradiente rosa full-bleed e o avatar
     fica a cavalo entre a capa e o conteúdo (look Twitter/Instagram). */
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
  .avatar-ring { margin-top: -48px; background: var(--card); }
  .stats {
    display: flex; justify-content: center; gap: 2rem;
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

  /* ── Posts ── */
  .avatar-ring { display: inline-flex; border-radius: 999px; box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 10%, transparent); border: 3px solid color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .posts { margin-top: 1.2rem; display: flex; flex-direction: column; gap: .7rem; }
  .posts-title { margin: 0; font-size: .82rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); }
  .card-lite { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg, 1rem); padding: .85rem; box-shadow: var(--shadow-sm, none); }
  .composer textarea { width: 100%; font: inherit; color: var(--txt); background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-md, .75rem); padding: .65rem .8rem; resize: vertical; }
  .composer textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
  .composer-row { display: flex; align-items: center; justify-content: space-between; margin-top: .45rem; }
  .count { color: var(--txt3); font-size: .75rem; }
  .publish { border: 0; border-radius: 999px; min-height: 40px; padding: 0 1.2rem; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 800; cursor: pointer; }
  .publish:disabled { opacity: .55; cursor: not-allowed; }
  .publish.small { min-height: 38px; min-width: 44px; padding: 0 .7rem; }
  .posts-hint { margin: 0; color: var(--txt3); font-size: .88rem; text-align: center; padding: .8rem .5rem; line-height: 1.5; }
  .post-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .7rem; }
  .post-head { display: flex; align-items: center; gap: .6rem; }
  .post-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .post-who strong { font-size: .92rem; }
  .post-who small { color: var(--txt3); font-size: .75rem; }
  .post-del { border: 0; background: transparent; color: var(--txt3); cursor: pointer; font-size: .95rem; padding: .3rem; border-radius: 999px; }
  .post-del:hover { color: var(--error, #ef4444); }
  .post-body { margin: .55rem 0 .2rem; color: var(--txt); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .post-actions { display: flex; gap: .5rem; margin-top: .35rem; }
  .pa { border: 1px solid var(--border); background: var(--bg-elev); color: var(--txt2); border-radius: 999px; min-height: 36px; padding: 0 .8rem; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }
  .pa:hover { border-color: var(--accent); }
  .pa.liked { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .comments { margin-top: .6rem; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); padding-top: .6rem; display: flex; flex-direction: column; gap: .5rem; }
  .comment { display: flex; gap: .5rem; align-items: flex-start; }
  .comment-body { flex: 1; min-width: 0; font-size: .88rem; line-height: 1.4; }
  .comment-body strong { margin-inline-end: .35rem; }
  .comment-body small { display: block; color: var(--txt3); font-size: .72rem; margin-top: .1rem; }
  .comment-composer { display: flex; gap: .45rem; }
  .comment-composer input { flex: 1; font: inherit; color: var(--txt); background: var(--bg-elev); border: 1px solid var(--border); border-radius: 999px; padding: .5rem .9rem; min-height: 40px; }
  .comment-composer input:focus-visible { outline: none; border-color: var(--accent); }
</style>
