<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { arcadeImmersive } from '$lib/arcade/immersive-state';
  import { isMultiplayerConfigured } from '$lib/multiplayer/config';
  import { getActiveMascot } from '$lib/gamification/mascots';
  import SnakeVersus from '$lib/components/arcade/SnakeVersus.svelte';
  import type { Room, PeerMeta } from '$lib/multiplayer/realtime';

  type Phase = 'menu' | 'creating' | 'waiting' | 'joining' | 'playing' | 'error';

  const configured = isMultiplayerConfigured();
  let phase = $state<Phase>('menu');
  let code = $state('');
  let joinCode = $state('');
  let room = $state<Room | null>(null);
  let peer = $state<PeerMeta | null>(null);
  let errorMsg = $state('');
  let mascot = $state('perfume');
  let unsubPeer: (() => void) | null = null;

  onMount(() => {
    arcadeImmersive.set(true);
    void getActiveMascot()
      .then((m) => (mascot = m.id))
      .catch(() => undefined);
  });
  onDestroy(() => {
    arcadeImmersive.set(false);
    unsubPeer?.();
    void room?.leave();
  });

  async function connect(role: 'host' | 'guest', roomCode: string): Promise<void> {
    const { joinRoom } = await import('$lib/multiplayer/realtime');
    const r = await joinRoom(roomCode, { role, name: role, mascot });
    room = r;
    unsubPeer = r.onPeerChange((p) => {
      peer = p;
      if (p && phase !== 'playing') phase = 'playing';
    });
  }

  async function createRoom(): Promise<void> {
    phase = 'creating';
    errorMsg = '';
    try {
      const { makeRoomCode } = await import('$lib/multiplayer/realtime');
      code = makeRoomCode();
      await connect('host', code);
      phase = 'waiting';
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  }

  async function joinRoomByCode(): Promise<void> {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return;
    phase = 'joining';
    errorMsg = '';
    try {
      await connect('guest', c);
      // If the host is already present onPeerChange flips us to 'playing';
      // otherwise we wait on this screen until they appear.
      if (!peer) phase = 'waiting';
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  }

  function shareCode(): void {
    const text = $t('versus.invite_text', { values: { code }, default: `Anda jogar 1v1 comigo na arcada! Código: ${code}` });
    if (navigator.share) void navigator.share({ text }).catch(() => undefined);
    else void navigator.clipboard?.writeText(code).catch(() => undefined);
  }

  function leave(): void {
    unsubPeer?.();
    void room?.leave();
    room = null;
    peer = null;
    phase = 'menu';
  }
</script>

<svelte:head>
  <title>{$t('versus.title', { default: '1 contra 1' })} · Presuntinho</title>
</svelte:head>

<div class="versus-lobby">
  <a class="back" href="/secrets/">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>

  {#if !configured}
    <div class="card">
      <h1>{$t('versus.title', { default: '1 contra 1' })} 🐍</h1>
      <p class="muted">{$t('versus.not_configured', { default: 'O modo multijogador ainda não está ligado. É preciso configurar o Supabase (ver docs/MULTIPLAYER_SETUP.md).' })}</p>
    </div>
  {:else if phase === 'playing' && room}
    <SnakeVersus {room} {mascot} onExit={leave} />
  {:else}
    <div class="card">
      <h1>{$t('versus.title', { default: '1 contra 1' })} 🐍</h1>

      {#if phase === 'menu'}
        <p class="muted">{$t('versus.tagline', { default: 'Convida a tua parceira para um duelo de snake — duas serpentes, o mesmo campo, e quem apanhar a cauda da outra rouba um ponto.' })}</p>
        <button type="button" class="cta" onclick={createRoom}>{$t('versus.create', { default: 'Criar sala' })}</button>
        <div class="or">{$t('versus.or', { default: 'ou' })}</div>
        <div class="join">
          <input
            type="text"
            inputmode="latin"
            maxlength="6"
            placeholder={$t('versus.code_placeholder', { default: 'CÓDIGO' })}
            bind:value={joinCode}
            aria-label={$t('versus.code_label', { default: 'Código da sala' })}
          />
          <button type="button" class="cta ghost" onclick={joinRoomByCode}>{$t('versus.join', { default: 'Entrar' })}</button>
        </div>
      {:else if phase === 'creating' || phase === 'joining'}
        <p class="muted">{$t('versus.connecting', { default: 'A ligar…' })}</p>
      {:else if phase === 'waiting'}
        <p class="muted">{$t('versus.waiting', { default: 'À espera da tua parceira…' })}</p>
        {#if code}
          <div class="code" onclick={shareCode} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && shareCode()}>
            <span>{code}</span>
            <small>{$t('versus.tap_share', { default: 'toca para partilhar' })}</small>
          </div>
        {/if}
        <button type="button" class="ghost" onclick={leave}>{$t('versus.cancel', { default: 'Cancelar' })}</button>
      {:else if phase === 'error'}
        <p class="muted err">{$t('versus.error', { default: 'Não deu para ligar.' })} {errorMsg}</p>
        <button type="button" class="cta" onclick={() => (phase = 'menu')}>{$t('versus.retry', { default: 'Tentar de novo' })}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .versus-lobby {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: radial-gradient(circle at 50% -10%, #171033, #070510 60%);
    color: #e8fff4;
    font-family: 'Courier New', ui-monospace, monospace;
  }
  .back { position: absolute; top: calc(env(safe-area-inset-top) + 0.8rem); left: 1rem; color: #bfdbfe; text-decoration: none; font-weight: 800; }
  .card { width: min(28rem, 92vw); display: grid; gap: 0.9rem; justify-items: center; text-align: center; }
  h1 { margin: 0; font-size: clamp(1.8rem, 8vw, 2.6rem); }
  .muted { margin: 0; color: #94a3b8; line-height: 1.5; }
  .err { color: #fca5a5; }
  .cta { min-width: 200px; padding: 0.9rem 1.4rem; border-radius: 0.9rem; border: none; background: linear-gradient(135deg, #f472b6, #a78bfa); color: #06121f; font: inherit; font-weight: 900; font-size: 1.05rem; cursor: pointer; }
  .cta.ghost, .ghost { background: transparent; border: 1.5px solid rgba(255,255,255,0.24); color: #e8fff4; }
  .ghost { padding: 0.7rem 1.2rem; border-radius: 0.8rem; font: inherit; font-weight: 800; cursor: pointer; }
  .or { color: #64748b; font-size: 0.85rem; }
  .join { display: flex; gap: 0.5rem; }
  .join input {
    width: 9rem; padding: 0.8rem; text-align: center; letter-spacing: 0.3em; text-transform: uppercase;
    font: inherit; font-weight: 900; font-size: 1.2rem; border-radius: 0.7rem;
    border: 2px solid rgba(103,232,249,0.5); background: rgba(10,16,30,0.5); color: #fff;
  }
  .code {
    display: grid; gap: 0.2rem; padding: 0.9rem 1.6rem; border-radius: 0.9rem; cursor: pointer;
    border: 2px dashed rgba(103,232,249,0.6); background: rgba(10,16,30,0.4);
  }
  .code span { font-size: 2.2rem; font-weight: 900; letter-spacing: 0.3em; color: #fde047; }
  .code small { color: #94a3b8; }
</style>
