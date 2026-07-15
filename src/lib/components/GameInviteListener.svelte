<script lang="ts">
  /** App-wide durable queue for multiplayer requests. */
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { vibrate } from '$lib/gamification/sound';
  import { accountsEnabled } from '$lib/account/auth';
  import { accountState } from '$lib/account/account-store.svelte';
  import { isInviteNewerThanTombstone } from '$lib/account/game-invite-model';
  import {
    dismissInvite,
    listIncomingGameInvites,
    subscribeIncomingInvites,
    type GameInvite
  } from '$lib/account/game-invites';

  let invites = $state<GameInvite[]>([]);
  let accepting = $state(false);
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let loadGeneration = 0;
  let snapshotSequence = 0;
  let appliedSnapshotSequence = 0;
  let realtimeRevision = 0;
  let acceptingInviteId: string | null = null;
  // Timestamp tombstones block stale query results but still allow the same
  // database row to reappear when the sender genuinely sends it again later.
  const ignoredAt = new Map<string, number>();
  const lastSeenCreatedAt = new Map<string, number>();
  const realtimeTouched = new Map<string, number>();
  // `send_game_invite` replaces the previous row with a new semantic id. Keep
  // a per-sender/game high-water mark so an in-flight snapshot can never put
  // the deleted invitation back after the replacement INSERT arrives.
  const latestBySenderGame = new Map<string, { id: string; createdAt: number }>();
  const invite = $derived(invites[0] ?? null);

  function senderGameKey(item: GameInvite): string {
    return `${item.from.id}:${item.game}`;
  }

  function scheduleExpiry(): void {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    if (!invites.length) return;
    const delay = Math.max(0, Math.min(...invites.map((item) => Date.parse(item.expiresAt))) - Date.now());
    expiryTimer = setTimeout(() => {
      const now = Date.now();
      invites = invites.filter((item) => Date.parse(item.expiresAt) > now);
      scheduleExpiry();
    }, delay + 25);
  }

  function canShowInvite(next: GameInvite, authoritativeRealtime = false): boolean {
    const createdAt = Date.parse(next.createdAt);
    const key = senderGameKey(next);
    const latest = latestBySenderGame.get(key);
    if (
      latest &&
      latest.id !== next.id &&
      Number.isFinite(createdAt) &&
      latest.createdAt >= createdAt &&
      !authoritativeRealtime
    ) return false;
    if (Number.isFinite(createdAt)) {
      latestBySenderGame.set(key, { id: next.id, createdAt });
    }
    if (Number.isFinite(createdAt)) {
      lastSeenCreatedAt.set(next.id, Math.max(lastSeenCreatedAt.get(next.id) ?? 0, createdAt));
    }
    const tombstone = ignoredAt.get(next.id);
    if (tombstone !== undefined) {
      if (!isInviteNewerThanTombstone(next.createdAt, tombstone)) return false;
      ignoredAt.delete(next.id);
    }
    return acceptingInviteId !== next.id;
  }

  function addInvite(next: GameInvite, announce = false, realtime = false): void {
    if (realtime) realtimeTouched.set(next.id, ++realtimeRevision);
    if (!canShowInvite(next, realtime)) return;
    const existed = invites.some((item) => item.id === next.id);
    const key = senderGameKey(next);
    invites = [next, ...invites.filter((item) => item.id !== next.id && senderGameKey(item) !== key)].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
    scheduleExpiry();
    if (announce && !existed) vibrate('success');
  }

  function loadPending(generation: number): void {
    const sequence = ++snapshotSequence;
    const startedRevision = realtimeRevision;
    void listIncomingGameInvites()
      .then((pending) => {
        if (generation !== loadGeneration || sequence < appliedSnapshotSequence) return;
        appliedSnapshotSequence = sequence;
        const realtimeArrivals = invites.filter(
          (item) => (realtimeTouched.get(item.id) ?? 0) > startedRevision
        );
        const seen = new Set<string>();
        invites = [...pending, ...realtimeArrivals]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .filter((item) => {
            if (seen.has(item.id) || !canShowInvite(item)) return false;
            seen.add(item.id);
            return true;
          });
        scheduleExpiry();
      })
      .catch(() => undefined);
  }

  function ignoreInvite(item: GameInvite): void {
    const createdAt = Date.parse(item.createdAt);
    const timestamp = Number.isFinite(createdAt) ? createdAt : Date.now();
    lastSeenCreatedAt.set(item.id, Math.max(lastSeenCreatedAt.get(item.id) ?? 0, timestamp));
    ignoredAt.set(item.id, timestamp);
  }

  function removeInvite(id: string, cancelledAt?: string, realtime = false): void {
    if (realtime) realtimeTouched.set(id, ++realtimeRevision);
    if (cancelledAt) {
      const timestamp = Date.parse(cancelledAt);
      ignoredAt.set(id, Number.isFinite(timestamp) ? timestamp : Date.now());
    }
    invites = invites.filter((item) => item.id !== id);
    scheduleExpiry();
  }

  // React to login/logout without requiring a page reload. Subscribe first,
  // then fetch again once SUBSCRIBED to close the initial-event race.
  $effect(() => {
    const userId = accountState.user?.id;
    const generation = ++loadGeneration;
    snapshotSequence += 1;
    appliedSnapshotSequence = snapshotSequence;
    invites = [];
    ignoredAt.clear();
    lastSeenCreatedAt.clear();
    realtimeTouched.clear();
    latestBySenderGame.clear();
    realtimeRevision = 0;
    accepting = false;
    acceptingInviteId = null;
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    if (!accountsEnabled() || !userId) return;

    const load = () => loadPending(generation);
    const stop = subscribeIncomingInvites(
      (next) => addInvite(next, true, true),
      load,
      (id, cancelledAt) => removeInvite(id, cancelledAt, true)
    );
    load();
    return stop;
  });

  onDestroy(() => {
    if (expiryTimer) clearTimeout(expiryTimer);
  });

  onMount(() => {
    const retry = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      if (acceptingInviteId === id) {
        acceptingInviteId = null;
        accepting = false;
      }
      ignoredAt.delete(id);
      loadPending(loadGeneration);
    };
    const consumed = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      if (acceptingInviteId === id) {
        acceptingInviteId = null;
        accepting = false;
      }
      const existing = invites.find((item) => item.id === id);
      if (existing) ignoreInvite(existing);
      else {
        const lastSeen = lastSeenCreatedAt.get(id);
        if (lastSeen !== undefined) ignoredAt.set(id, lastSeen);
      }
      removeInvite(id);
    };
    window.addEventListener('presuntinho:game-invite-retry', retry);
    window.addEventListener('presuntinho:game-invite-consumed', consumed);
    return () => {
      window.removeEventListener('presuntinho:game-invite-retry', retry);
      window.removeEventListener('presuntinho:game-invite-consumed', consumed);
    };
  });

  async function play(): Promise<void> {
    if (!invite || accepting) return;
    const selected = invite;
    const generation = loadGeneration;
    accepting = true;
    acceptingInviteId = selected.id;
    ignoreInvite(selected);
    invites = invites.filter((item) => item.id !== selected.id);
    scheduleExpiry();
    try {
      // The lobby deletes the row only after the Realtime channel subscribed.
      // If joining fails, the request remains durable and can be retried later.
      await goto(
        `/secrets/versus/?join=${encodeURIComponent(selected.roomCode)}&invite=${encodeURIComponent(selected.id)}&attempt=${Date.now().toString(36)}`
      );
    } catch {
      if (generation === loadGeneration) {
        ignoredAt.delete(selected.id);
        acceptingInviteId = null;
        addInvite(selected);
      }
    } finally {
      if (generation === loadGeneration && acceptingInviteId === selected.id) {
        accepting = false;
        acceptingInviteId = null;
      }
    }
  }

  async function decline(): Promise<void> {
    if (!invite) return;
    const selected = invite;
    const generation = loadGeneration;
    ignoreInvite(selected);
    invites = invites.filter((item) => item.id !== selected.id);
    scheduleExpiry();
    try {
      await dismissInvite(selected.id);
    } catch {
      if (generation === loadGeneration) {
        ignoredAt.delete(selected.id);
        addInvite(selected);
      }
    }
  }
</script>

{#if invite}
  <section
    class="invite-banner"
    aria-live="assertive"
    aria-label={$t('versus.request.aria')}
  >
    <span class="ib-emoji" aria-hidden="true">{invite.from.emoji ?? '🎮'}</span>
    <span class="ib-copy">
      <strong>{invite.from.display_name || `@${invite.from.handle}`}</strong>
      <small>{$t('versus.request.body')}</small>
      {#if invites.length > 1}
        <em>{$t('versus.request.more', { values: { count: invites.length - 1 } })}</em>
      {/if}
    </span>
    <span class="ib-actions">
      <button type="button" class="ib-play" disabled={accepting} onclick={play}>
        {accepting ? $t('versus.connecting') : $t('versus.request.accept')}
      </button>
      <button type="button" class="ib-decline" disabled={accepting} onclick={decline}>
        {$t('versus.request.decline')}
      </button>
    </span>
  </section>
{/if}

<style>
  .invite-banner {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: calc(env(safe-area-inset-top) + 0.6rem);
    z-index: 9900;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    width: min(94vw, 31rem);
    padding: 0.8rem;
    border-radius: 1.15rem;
    background: linear-gradient(135deg, color-mix(in srgb, var(--bg-elev, #1f2e4a) 90%, #f472b6), var(--bg-elev, #1f2e4a));
    color: var(--txt, #fff);
    border: 1px solid color-mix(in srgb, var(--accent) 62%, var(--border));
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.48), 0 0 24px color-mix(in srgb, var(--accent) 18%, transparent);
    animation: ib-drop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes ib-drop {
    from { opacity: 0; transform: translate(-50%, -18px) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }
  .ib-emoji { font-size: 2rem; line-height: 1; }
  .ib-copy { min-width: 0; display: flex; flex-direction: column; }
  .ib-copy strong { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ib-copy small { color: var(--txt2); font-size: 0.8rem; }
  .ib-copy em { color: var(--accent); font-size: 0.72rem; font-style: normal; font-weight: 800; margin-top: 0.15rem; }
  .ib-actions { display: grid; gap: 0.3rem; }
  .ib-actions button { min-height: 38px; border-radius: 999px; font: inherit; font-weight: 800; padding: 0.45rem 0.9rem; cursor: pointer; }
  .ib-actions button:disabled { cursor: wait; opacity: 0.65; }
  .ib-play { border: 0; background: var(--accent); color: var(--on-accent, #fff); }
  .ib-decline { border: 1px solid var(--border); background: transparent; color: var(--txt2); font-size: 0.75rem; }
  @media (max-width: 430px) {
    .invite-banner { grid-template-columns: auto minmax(0, 1fr); }
    .ib-actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .invite-banner { animation: none; }
  }
</style>
