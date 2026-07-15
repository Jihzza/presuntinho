<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { showToast } from '$lib/components/events';
  import { arcadeImmersive } from '$lib/arcade/immersive-state';
  import { isMultiplayerConfigured } from '$lib/multiplayer/config';
  import { getActiveMascot } from '$lib/gamification/mascots';
  import SnakeVersus from '$lib/components/arcade/SnakeVersus.svelte';
  import type { Room, PeerMeta } from '$lib/multiplayer/realtime';
  import { makeRoomCode, isValidRoomCode, normalizeRoomCode, roomInviteUrl } from '$lib/multiplayer/room-code';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { listContacts, type Contact } from '$lib/account/contacts';
  import {
    cancelGameInvitesForRoom,
    dismissInvite,
    inviteToGame,
    validateIncomingGameInvite
  } from '$lib/account/game-invites';

  type Phase = 'menu' | 'creating' | 'waiting' | 'joining' | 'playing' | 'error';
  type LinkAction = 'share' | 'copy';
  type ErrorKind = 'invalid_code' | 'invalid_invite' | 'connection' | 'room_full' | 'host_unavailable';

  const configured = isMultiplayerConfigured();
  let phase = $state<Phase>('menu');
  let code = $state('');
  let joinCode = $state('');
  let room = $state<Room | null>(null);
  let peer = $state<PeerMeta | null>(null);
  let mascot = $state('perfume');
  let contacts = $state<Contact[]>([]);
  let contactsLoading = $state(true);
  let contactQuery = $state('');
  let selectedContact = $state<Contact | null>(null);
  let actionBusy = $state<string | null>(null);
  let sharedUrl = $state('');
  let canShare = $state(false);
  let acceptedInviteId = $state<string | null>(null);
  let requestedInviteId = $state<string | null>(null);
  let errorKind = $state<ErrorKind>('connection');
  let inviteCleanupDone = false;
  let unsubPeer: (() => void) | null = null;
  let unsubConflict: (() => void) | null = null;
  let peerWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastJoinRequest = '';
  let inviteAttempt = 0;
  let connectionAttempt = 0;
  let destroyed = false;

  const filteredContacts = $derived.by(() => {
    const query = contactQuery.trim().toLocaleLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      `${contact.display_name ?? ''} ${contact.handle}`.toLocaleLowerCase().includes(query.replace(/^@/, ''))
    );
  });

  // Query-only navigation keeps this Svelte page mounted. Watching the URL
  // makes accepting a request work even when the user is already in the lobby.
  $effect(() => {
    const requestedCode = page.url.searchParams.get('join');
    const requestedInvite = page.url.searchParams.get('invite');
    const requestedAttempt = page.url.searchParams.get('attempt');
    const busy = actionBusy;
    if (!requestedCode || busy) return;
    const signature = `${requestedCode}:${requestedInvite ?? ''}:${requestedAttempt ?? ''}`;
    if (signature === lastJoinRequest) return;
    lastJoinRequest = signature;
    joinCode = normalizeRoomCode(requestedCode);
    void joinRoomByCode(requestedInvite);
  });

  onMount(() => {
    arcadeImmersive.set(true);
    canShare = typeof navigator.share === 'function';
    void getActiveMascot()
      .then((active) => (mascot = active.id))
      .catch(() => undefined);

    void (async () => {
      try {
        await startAccountSync();
        if (accountState.account) contacts = await listContacts();
      } catch {
        contacts = [];
      } finally {
        contactsLoading = false;
      }
    })();

  });

  onDestroy(() => {
    restoreAcceptedInvite();
    destroyed = true;
    inviteAttempt += 1;
    connectionAttempt += 1;
    arcadeImmersive.set(false);
    const hostedCode = room?.role === 'host' ? code : '';
    if (peerWaitTimer) clearTimeout(peerWaitTimer);
    unsubPeer?.();
    unsubConflict?.();
    void room?.leave();
    if (hostedCode) void cancelGameInvitesForRoom(hostedCode).catch(() => undefined);
  });

  function friendlyConnectionError(error: unknown, kind: ErrorKind = 'connection'): void {
    if (destroyed) return;
    console.warn('[presuntinho] multiplayer connection failed', error);
    errorKind = error instanceof Error && error.name === 'RoomConflictError' ? 'room_full' : kind;
    phase = 'error';
  }

  function clearPeerWait(): void {
    if (peerWaitTimer) clearTimeout(peerWaitTimer);
    peerWaitTimer = null;
  }

  function restoreAcceptedInvite(): void {
    restoreInvite(acceptedInviteId);
  }

  function restoreInvite(id: string | null): void {
    if (!id || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('presuntinho:game-invite-retry', { detail: { id } })
    );
  }

  function consumeAcceptedInvite(id: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('presuntinho:game-invite-consumed', { detail: { id } }));
  }

  function connectionAbortedError(): Error {
    const error = new Error('multiplayer connection aborted');
    error.name = 'ConnectionAbortedError';
    return error;
  }

  function isConnectionAborted(error: unknown): boolean {
    return destroyed || (error instanceof Error && error.name === 'ConnectionAbortedError');
  }

  async function disconnectCurrentRoom(cancelHostedInvites: boolean): Promise<void> {
    connectionAttempt += 1;
    const activeRoom = room;
    const hostedCode = cancelHostedInvites && activeRoom?.role === 'host' ? code : '';
    clearPeerWait();
    unsubPeer?.();
    unsubConflict?.();
    unsubPeer = null;
    unsubConflict = null;
    room = null;
    peer = null;
    if (activeRoom) await activeRoom.leave().catch(() => undefined);
    if (hostedCode) await cancelGameInvitesForRoom(hostedCode).catch(() => undefined);
  }

  function currentPlayerName(role: 'host' | 'guest'): string {
    return accountState.account?.display_name || accountState.account?.handle || role;
  }

  async function connect(role: 'host' | 'guest', roomCode: string): Promise<void> {
    const attempt = ++connectionAttempt;
    const { joinRoom } = await import('$lib/multiplayer/realtime');
    if (destroyed || attempt !== connectionAttempt) throw connectionAbortedError();
    let nextRoom: Room;
    try {
      nextRoom = await joinRoom(roomCode, { role, name: currentPlayerName(role), mascot });
    } catch (error) {
      if (destroyed || attempt !== connectionAttempt) throw connectionAbortedError();
      throw error;
    }
    if (destroyed || attempt !== connectionAttempt) {
      await nextRoom.leave().catch(() => undefined);
      throw connectionAbortedError();
    }
    room = nextRoom;
    unsubPeer?.();
    unsubConflict?.();
    unsubPeer = nextRoom.onPeerChange((nextPeer) => {
      if (room !== nextRoom || destroyed) return;
      peer = nextPeer;
      if (!nextPeer) return;
      clearPeerWait();
      phase = 'playing';
      if (role === 'guest' && acceptedInviteId) {
        const inviteId = acceptedInviteId;
        consumeAcceptedInvite(inviteId);
        acceptedInviteId = null;
        // The row was validated for this exact recipient and room before the
        // join. Keep the same room predicate on consumption so a tampered or
        // superseded deep link can never dismiss another valid invitation.
        void dismissInvite(inviteId, roomCode).catch(() => undefined);
      }
      if (role === 'host' && !inviteCleanupDone) {
        inviteCleanupDone = true;
        void cancelGameInvitesForRoom(roomCode).catch(() => undefined);
      }
    });
    unsubConflict = nextRoom.onConflict?.((reason) => {
      if (!reason || room !== nextRoom) return;
      connectionAttempt += 1;
      clearPeerWait();
      peer = null;
      room = null;
      if (role === 'guest') restoreAcceptedInvite();
      if (!destroyed) friendlyConnectionError(new Error(reason), 'room_full');
      void nextRoom.leave().catch(() => undefined);
    }) ?? null;
    if (destroyed || attempt !== connectionAttempt) {
      if (room === nextRoom) {
        room = null;
        await nextRoom.leave().catch(() => undefined);
      }
      throw connectionAbortedError();
    }
    if (room !== nextRoom) {
      const error = new Error('room role already taken');
      error.name = 'RoomConflictError';
      throw error;
    }
  }

  async function ensureHostRoom(preparedCode = '', showWaiting = true): Promise<string> {
    if (room?.role === 'host' && code) return code;
    const nextCode = preparedCode || code || makeRoomCode();
    code = nextCode;
    phase = 'creating';
    await connect('host', nextCode);
    if (!peer && showWaiting) phase = 'waiting';
    return nextCode;
  }

  async function joinRoomByCode(inviteId: string | null = null): Promise<void> {
    if (actionBusy) return;
    const normalized = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(normalized)) {
      restoreInvite(inviteId || acceptedInviteId);
      errorKind = 'invalid_code';
      phase = 'error';
      return;
    }

    if (acceptedInviteId && acceptedInviteId !== inviteId) {
      restoreAcceptedInvite();
      acceptedInviteId = null;
    }
    requestedInviteId = inviteId;
    actionBusy = 'join';
    phase = 'joining';
    try {
      if (inviteId !== null) {
        // A push URL is untrusted/stale input. Prove the row still exists, is
        // addressed to this signed-in account, matches this room and has not
        // expired before opening a Realtime channel.
        const proof = await validateIncomingGameInvite(inviteId, normalized);
        if (!proof) {
          restoreInvite(inviteId);
          errorKind = 'invalid_invite';
          phase = 'error';
          return;
        }
        acceptedInviteId = proof.id;
      } else {
        // No invite parameter means the existing public link/manual-code
        // capability flow. It remains intentionally usable without an account.
        acceptedInviteId = null;
      }
      await disconnectCurrentRoom(true);
      code = normalized;
      await connect('guest', normalized);
      if (!peer && room) {
        phase = 'waiting';
        const waitingRoom = room;
        clearPeerWait();
        peerWaitTimer = setTimeout(() => {
          if (destroyed || room !== waitingRoom || peer) return;
          connectionAttempt += 1;
          unsubPeer?.();
          unsubConflict?.();
          unsubPeer = null;
          unsubConflict = null;
          room = null;
          void waitingRoom.leave().catch(() => undefined);
          restoreAcceptedInvite();
          friendlyConnectionError(new Error('host unavailable'), 'host_unavailable');
        }, 20_000);
      }
    } catch (error) {
      if (isConnectionAborted(error)) return;
      restoreInvite(inviteId || acceptedInviteId);
      friendlyConnectionError(error);
    } finally {
      actionBusy = null;
    }
  }

  async function inviteContact(contact: Contact): Promise<void> {
    if (actionBusy) return;
    const attempt = ++inviteAttempt;
    actionBusy = `friend:${contact.id}`;
    selectedContact = contact;
    inviteCleanupDone = false;
    try {
      const roomCode = await ensureHostRoom('', false);
      await inviteToGame(contact.id, roomCode);
      if (destroyed || attempt !== inviteAttempt || room?.role !== 'host' || code !== roomCode) {
        await cancelGameInvitesForRoom(roomCode).catch(() => undefined);
        return;
      }
      phase = 'waiting';
      showToast($t('versus.friend.sent', { values: { handle: contact.handle } }), 2200);
    } catch (error) {
      if (destroyed || attempt !== inviteAttempt) return;
      console.warn('[presuntinho] game invite failed', error);
      selectedContact = null;
      if (room) {
        phase = 'waiting';
        showToast($t('versus.friend.failed'), 2800, 'error');
      } else {
        friendlyConnectionError(error);
      }
    } finally {
      if (attempt === inviteAttempt) actionBusy = null;
    }
  }

  function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      return copied ? Promise.resolve() : Promise.reject(new Error('copy unavailable'));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function deliverLink(action: LinkAction, url: string): Promise<'sent' | 'cancelled' | 'failed'> {
    if (action === 'share' && navigator.share) {
      const text = $t('versus.link.share_text');
      return navigator
        .share({ title: $t('versus.link.share_title'), text, url })
        .then(() => 'sent' as const)
        .catch((error: unknown) =>
          error instanceof DOMException && error.name === 'AbortError' ? ('cancelled' as const) : ('failed' as const)
        );
    }
    return copyText(url)
      .then(() => 'sent' as const)
      .catch(() => 'failed' as const);
  }

  async function startLinkInvite(action: LinkAction): Promise<void> {
    if (actionBusy) return;
    actionBusy = `link:${action}`;
    selectedContact = null;
    inviteCleanupDone = false;

    // Generate and hand the URL to the native share/clipboard API synchronously
    // while this click still has browser user activation.
    const nextCode = code || makeRoomCode();
    code = nextCode;
    const url = roomInviteUrl(nextCode, window.location.origin);
    sharedUrl = url;
    const delivery = deliverLink(action, url);

    try {
      await ensureHostRoom(nextCode);
      const result = await delivery;
      if (result === 'sent') {
        showToast($t(action === 'copy' || !canShare ? 'versus.link.copied' : 'versus.link.shared'), 2200);
      } else if (result === 'failed') {
        showToast($t('versus.link.failed'), 2800, 'error');
      }
    } catch (error) {
      await delivery;
      if (!isConnectionAborted(error)) friendlyConnectionError(error);
    } finally {
      actionBusy = null;
    }
  }

  async function shareWaitingLink(action: LinkAction): Promise<void> {
    if (!code || actionBusy) return;
    actionBusy = `link:${action}`;
    const url = sharedUrl || roomInviteUrl(code, window.location.origin);
    sharedUrl = url;
    const result = await deliverLink(action, url);
    if (result === 'sent') showToast($t(action === 'copy' ? 'versus.link.copied' : 'versus.link.shared'), 2200);
    else if (result === 'failed') showToast($t('versus.link.failed'), 2800, 'error');
    actionBusy = null;
  }

  function leave(): void {
    restoreAcceptedInvite();
    acceptedInviteId = null;
    requestedInviteId = null;
    inviteAttempt += 1;
    connectionAttempt += 1;
    const hostedCode = room?.role === 'host' ? code : '';
    clearPeerWait();
    unsubPeer?.();
    unsubConflict?.();
    unsubPeer = null;
    unsubConflict = null;
    void room?.leave();
    if (hostedCode) void cancelGameInvitesForRoom(hostedCode).catch(() => undefined);
    room = null;
    peer = null;
    phase = 'menu';
    code = '';
    joinCode = '';
    sharedUrl = '';
    selectedContact = null;
    actionBusy = null;
    inviteCleanupDone = false;
  }

  function retryOrReset(): void {
    if (errorKind === 'invalid_invite') leave();
    else if (isValidRoomCode(joinCode) && errorKind !== 'room_full') void joinRoomByCode(requestedInviteId);
    else leave();
  }
</script>

<svelte:head>
  <title>{$t('versus.title')} · Presuntinho</title>
</svelte:head>

<div class="versus-lobby">
  <a class="back" href="/secrets/">{$t('arcade.game.back')}</a>

  {#if !configured}
    <div class="card compact">
      <h1>{$t('versus.title')} 🐍</h1>
      <p class="muted">{$t('versus.not_configured')}</p>
    </div>
  {:else if phase === 'playing' && room}
    <SnakeVersus {room} {mascot} onExit={leave} />
  {:else}
    <div class="card" aria-busy={phase === 'creating' || phase === 'joining'}>
      <header class="intro">
        <span class="eyebrow">{$t('versus.quick_badge')}</span>
        <h1>{$t('versus.title')} 🐍</h1>
        <p class="muted">{$t('versus.simple_tagline')}</p>
      </header>

      {#if phase === 'menu'}
        <section class="option-card friends-card">
          <div class="option-copy">
            <span class="option-icon" aria-hidden="true">👥</span>
            <span><strong>{$t('versus.friend.title')}</strong><small>{$t('versus.friend.hint')}</small></span>
          </div>

          {#if contactsLoading}
            <p class="status">{$t('versus.friend.loading')}</p>
          {:else if !accountState.account}
            <a class="account-link" href="/conta/">{$t('versus.friend.sign_in')}</a>
          {:else if contacts.length === 0}
            <p class="status">{$t('versus.friend.empty')} <a href="/contactos/">{$t('versus.friend.add')}</a></p>
          {:else}
            <label class="friend-search">
              <span class="sr-only">{$t('versus.friend.search_label')}</span>
              <span aria-hidden="true">⌕</span>
              <input bind:value={contactQuery} type="search" placeholder={$t('versus.friend.search')} autocomplete="off" />
            </label>
            <div class="friend-list">
              {#each filteredContacts as contact (contact.id)}
                <button type="button" class="friend-row" onclick={() => inviteContact(contact)}>
                  <span class="friend-avatar" aria-hidden="true">{contact.emoji ?? '🙂'}</span>
                  <span class="friend-name">
                    <strong>{contact.display_name || `@${contact.handle}`}</strong>
                    <small>@{contact.handle}</small>
                  </span>
                  <span class="invite-label">{$t('versus.friend.invite')} →</span>
                </button>
              {:else}
                <p class="status">{$t('versus.friend.no_results')}</p>
              {/each}
            </div>
          {/if}
        </section>

        <section class="option-card link-card">
          <div class="option-copy">
            <span class="option-icon" aria-hidden="true">🔗</span>
            <span><strong>{$t('versus.link.title')}</strong><small>{$t('versus.link.hint')}</small></span>
          </div>
          <div class="link-actions">
            <button type="button" class="cta" onclick={() => startLinkInvite(canShare ? 'share' : 'copy')}>
              {$t(canShare ? 'versus.link.share' : 'versus.link.copy')}
            </button>
            {#if canShare}
              <button type="button" class="ghost" onclick={() => startLinkInvite('copy')}>{$t('versus.link.copy')}</button>
            {/if}
          </div>
        </section>

        <details class="manual-join">
          <summary>{$t('versus.have_code')}</summary>
          <div class="join">
            <input
              type="text"
              inputmode="text"
              maxlength="6"
              placeholder={$t('versus.code_placeholder')}
              bind:value={joinCode}
              aria-label={$t('versus.code_label')}
            />
            <button type="button" class="ghost" onclick={() => void joinRoomByCode()}>{$t('versus.join')}</button>
          </div>
        </details>
      {:else if phase === 'creating' || phase === 'joining'}
        <div class="connecting">
          <span class="spinner" aria-hidden="true"></span>
          <strong>{phase === 'joining' ? $t('versus.joining') : $t('versus.creating')}</strong>
          {#if selectedContact}<small>{$t('versus.friend.sending_to', { values: { handle: selectedContact.handle } })}</small>{/if}
        </div>
      {:else if phase === 'waiting'}
        <div class="waiting-hero" aria-live="polite">
          <span class="waiting-pulse" aria-hidden="true">🐍</span>
          <strong>
            {selectedContact
              ? $t('versus.friend.waiting_for', { values: { handle: selectedContact.handle } })
              : $t('versus.waiting')}
          </strong>
          <small>{$t('versus.waiting_hint')}</small>
        </div>

        <div class="waiting-link">
          <span class="room-code"><small>{$t('versus.code_label')}</small><strong>{code}</strong></span>
          <div class="link-actions">
            {#if canShare}
              <button type="button" class="cta" onclick={() => shareWaitingLink('share')}>{$t('versus.link.share')}</button>
            {/if}
            <button type="button" class={canShare ? 'ghost' : 'cta'} onclick={() => shareWaitingLink('copy')}>
              {$t('versus.link.copy')}
            </button>
          </div>
        </div>
        <button type="button" class="cancel" onclick={leave}>{$t('versus.cancel')}</button>
      {:else if phase === 'error'}
        <div class="error-state">
          <span aria-hidden="true">{errorKind === 'invalid_invite' ? '⌛' : '🛜'}</span>
          <strong>
            {$t(
              errorKind === 'invalid_code'
                ? 'versus.invalid_code'
                : errorKind === 'invalid_invite'
                  ? 'versus.invalid_invite'
                : errorKind === 'room_full'
                  ? 'versus.room_full'
                  : errorKind === 'host_unavailable'
                    ? 'versus.host_unavailable'
                    : 'versus.error'
            )}
          </strong>
          <small>{$t(errorKind === 'invalid_invite' ? 'versus.invalid_invite_hint' : 'versus.error_hint')}</small>
        </div>
        <button type="button" class="cta" onclick={retryOrReset}>
          {$t(errorKind === 'invalid_invite' ? 'versus.back_to_lobby' : 'versus.retry')}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .versus-lobby {
    position: fixed; inset: 0; z-index: 40; display: grid; place-items: center;
    padding: max(4.5rem, calc(env(safe-area-inset-top) + 4rem)) 1rem max(1rem, env(safe-area-inset-bottom));
    overflow: auto; background: radial-gradient(circle at 50% -10%, #211341, #080511 58%); color: #e8fff4;
    font-family: 'Courier New', ui-monospace, monospace;
  }
  .back { position: fixed; z-index: 2; top: calc(env(safe-area-inset-top) + 0.8rem); left: 1rem; color: #bfdbfe; text-decoration: none; font-weight: 800; }
  .card { width: min(32rem, 94vw); display: grid; gap: 0.85rem; text-align: center; margin: auto; }
  .card.compact { justify-items: center; }
  .intro { display: grid; justify-items: center; gap: 0.3rem; }
  .eyebrow { padding: 0.25rem 0.65rem; border-radius: 999px; color: #f9a8d4; background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.28); font-size: 0.68rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(1.8rem, 8vw, 2.6rem); }
  .muted { margin: 0; color: #a5b4c8; line-height: 1.4; font-size: 0.9rem; }
  .option-card { display: grid; gap: 0.7rem; padding: 0.85rem; border: 1px solid rgba(255,255,255,0.13); border-radius: 1.15rem; background: rgba(10,16,30,0.62); box-shadow: inset 0 1px rgba(255,255,255,0.04); text-align: left; }
  .link-card { border-color: rgba(244,114,182,0.3); background: linear-gradient(135deg, rgba(244,114,182,0.1), rgba(10,16,30,0.68)); }
  .option-copy { display: flex; align-items: center; gap: 0.7rem; }
  .option-copy > span:last-child { display: grid; gap: 0.12rem; }
  .option-copy strong { font-size: 0.98rem; }
  .option-copy small { color: #94a3b8; font-size: 0.73rem; line-height: 1.35; }
  .option-icon { display: grid; place-items: center; width: 2.3rem; height: 2.3rem; flex: 0 0 auto; border-radius: 0.75rem; background: rgba(255,255,255,0.08); font-size: 1.25rem; }
  .friend-search { display: flex; align-items: center; gap: 0.4rem; padding: 0 0.7rem; border: 1px solid rgba(103,232,249,0.35); border-radius: 0.75rem; background: rgba(2,6,23,0.52); color: #67e8f9; }
  .friend-search input { width: 100%; min-height: 42px; border: 0; outline: 0; background: transparent; color: #fff; font: inherit; font-size: 0.9rem; }
  .friend-search input::placeholder { color: #64748b; }
  .friend-list { display: grid; gap: 0.35rem; max-height: 12rem; overflow: auto; scrollbar-width: thin; }
  .friend-row { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 0.6rem; width: 100%; padding: 0.55rem; border: 0; border-radius: 0.75rem; background: rgba(255,255,255,0.045); color: #e8fff4; text-align: left; font: inherit; cursor: pointer; }
  .friend-row:hover, .friend-row:focus-visible { background: rgba(103,232,249,0.12); outline: 1px solid rgba(103,232,249,0.4); }
  .friend-avatar { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 999px; background: rgba(255,255,255,0.08); }
  .friend-name { min-width: 0; display: grid; }
  .friend-name strong, .friend-name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .friend-name strong { font-size: 0.84rem; }
  .friend-name small { color: #64748b; font-size: 0.68rem; }
  .invite-label { color: #67e8f9; font-size: 0.72rem; font-weight: 900; }
  .status { margin: 0; color: #94a3b8; font-size: 0.78rem; text-align: center; }
  .status a, .account-link { color: #67e8f9; }
  .account-link { justify-self: center; font-size: 0.82rem; font-weight: 800; }
  .link-actions { display: flex; gap: 0.5rem; justify-content: center; }
  .cta, .ghost, .cancel { min-height: 44px; padding: 0.7rem 1rem; border-radius: 0.8rem; font: inherit; font-weight: 900; cursor: pointer; }
  .cta { flex: 1; border: 0; background: linear-gradient(135deg, #f472b6, #a78bfa); color: #06121f; }
  .ghost { flex: 1; border: 1.5px solid rgba(255,255,255,0.22); background: transparent; color: #e8fff4; }
  .cancel { justify-self: center; border: 0; background: transparent; color: #94a3b8; }
  .manual-join { color: #64748b; font-size: 0.78rem; }
  .manual-join summary { cursor: pointer; list-style-position: inside; }
  .join { display: flex; gap: 0.5rem; margin-top: 0.65rem; }
  .join input { min-width: 0; width: 100%; padding: 0.7rem; text-align: center; letter-spacing: 0.25em; text-transform: uppercase; font: inherit; font-weight: 900; font-size: 1rem; border-radius: 0.7rem; border: 2px solid rgba(103,232,249,0.42); background: rgba(10,16,30,0.6); color: #fff; }
  .connecting, .waiting-hero, .error-state { display: grid; justify-items: center; gap: 0.45rem; padding: 1.5rem 0.5rem; }
  .connecting small, .waiting-hero small, .error-state small { color: #94a3b8; font-size: 0.78rem; line-height: 1.4; }
  .spinner { width: 2.4rem; height: 2.4rem; border: 3px solid rgba(255,255,255,0.14); border-top-color: #f472b6; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .waiting-pulse { display: grid; place-items: center; width: 4.3rem; height: 4.3rem; border-radius: 50%; background: rgba(103,232,249,0.1); font-size: 2rem; animation: pulse 1.7s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); box-shadow: 0 0 28px rgba(103,232,249,0.26); } }
  .waiting-link { display: grid; gap: 0.7rem; padding: 0.85rem; border: 1px solid rgba(103,232,249,0.28); border-radius: 1rem; background: rgba(10,16,30,0.6); }
  .room-code { display: grid; justify-items: center; }
  .room-code small { color: #64748b; font-size: 0.68rem; text-transform: uppercase; }
  .room-code strong { color: #fde047; font-size: 1.55rem; letter-spacing: 0.24em; padding-left: 0.24em; }
  .error-state > span { font-size: 2.5rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (prefers-reduced-motion: reduce) { .spinner, .waiting-pulse { animation: none; } }
</style>
