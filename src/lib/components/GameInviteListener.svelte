<script lang="ts">
  /**
   * GameInviteListener — app-wide listener for incoming game invites (Phase 4).
   * When a contact invites you to a game room, a banner pops up anywhere in the
   * app with a one-tap "Jogar" that opens the lobby already joining their room.
   * Self-contained: mounted once in the layout; no-ops without a real account.
   */
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { vibrate } from '$lib/gamification/sound';
  import { accountsEnabled } from '$lib/account/auth';
  import { subscribeIncomingInvites, dismissInvite, type GameInvite } from '$lib/account/game-invites';

  let invite = $state<GameInvite | null>(null);
  let unsub: (() => void) | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    if (!accountsEnabled()) return;
    unsub = subscribeIncomingInvites((inv) => {
      invite = inv;
      vibrate('success');
      if (hideTimer) clearTimeout(hideTimer);
      // Auto-dismiss the banner after 30s (the room may be gone by then).
      hideTimer = setTimeout(() => (invite = null), 30_000);
    });
  });
  onDestroy(() => {
    unsub?.();
    if (hideTimer) clearTimeout(hideTimer);
  });

  function play(): void {
    if (!invite) return;
    const code = invite.roomCode;
    dismiss();
    void goto(`/secrets/versus/?join=${encodeURIComponent(code)}`);
  }

  function dismiss(): void {
    if (invite) void dismissInvite(invite.id).catch(() => {});
    invite = null;
    if (hideTimer) clearTimeout(hideTimer);
  }
</script>

{#if invite}
  <div class="invite-banner" role="alertdialog" aria-label={$t('invite.aria', { default: 'Convite para jogar' })}>
    <span class="ib-emoji" aria-hidden="true">{invite.from.emoji ?? '🎮'}</span>
    <span class="ib-copy">
      <strong>{invite.from.display_name || `@${invite.from.handle}`}</strong>
      <small>{$t('invite.body', { default: 'convidou-te para um 1v1! 🐍' })}</small>
    </span>
    <button type="button" class="ib-play" onclick={play}>{$t('invite.play', { default: 'Jogar' })}</button>
    <button type="button" class="ib-x" onclick={dismiss} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>✕</button>
  </div>
{/if}

<style>
  .invite-banner {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: calc(env(safe-area-inset-top) + 0.6rem);
    z-index: 9900;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: min(92vw, 26rem);
    padding: 0.7rem 0.85rem;
    border-radius: 999px;
    background: var(--bg-elev, #1f2e4a);
    color: var(--txt, #fff);
    border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--border));
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
    animation: ib-drop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes ib-drop {
    from { opacity: 0; transform: translate(-50%, -14px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  .ib-emoji { font-size: 1.7rem; line-height: 1; flex-shrink: 0; }
  .ib-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ib-copy strong { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ib-copy small { color: var(--txt2); font-size: 0.8rem; }
  .ib-play { flex-shrink: 0; border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 800; padding: 0.5rem 1.1rem; min-height: 40px; cursor: pointer; }
  .ib-x { flex-shrink: 0; width: 36px; height: 36px; border-radius: 999px; border: 0; background: transparent; color: var(--txt3); cursor: pointer; font-size: 0.9rem; }
  .ib-x:hover { background: var(--card-hover, transparent); color: var(--txt); }
  @media (prefers-reduced-motion: reduce) {
    .invite-banner { animation: none; }
  }
</style>
