<script lang="ts">
  /**
   * /onboarding — first-run wizard for a NEW member (multi-user Phase 1A).
   *
   * Drives the pure state machine in $lib/space/onboarding.ts and does the
   * side-effecting glue on completion: mint a uuid member, hash the password,
   * write the registry, register the session, init that member's own database
   * and set their mascot. Existing fatma/daniel users never reach here (guarded
   * by an existing session on mount). Creates a fresh, empty, isolated member —
   * it NEVER touches fatma/daniel data.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import MascotAvatar from '$lib/components/MascotAvatar.svelte';
  import { MASCOTS, setActiveMascot } from '$lib/gamification/mascots';
  import { hashPassword } from '$lib/auth/hash';
  import type { ProfileId } from '$lib/auth/hash';
  import { getSession, setSession, registerKnownMember } from '$lib/auth/session';
  import { initStores } from '$lib/state/stores';
  import { fireConfettiEvent } from '$lib/components/events';
  import {
    initialOnboarding,
    canAdvance,
    nextStep,
    prevStep,
    progress,
    newSpace,
    newOwnerMembership
  } from '$lib/space/onboarding';
  import type { SpaceKind } from '$lib/space/types';
  import { putSpace, putMember } from '$lib/space/registry-db';
  import {
    takePendingSpaceToken,
    setSpaceToken,
    setPendingSpaceToken,
    createInvite,
    inviteUrl
  } from '$lib/space/pairing';

  let ob = $state(initialOnboarding());
  let busy = $state(false);
  let errorMsg = $state('');
  let inviteCode = $state('');
  let inviteBusy = $state(false);
  let inviteErr = $state('');
  let copied = $state(false);

  async function genInvite(): Promise<void> {
    if (inviteBusy) return;
    inviteBusy = true;
    inviteErr = '';
    try {
      const inv = await createInvite();
      inviteCode = inv.code;
      // Bind the shared token to THIS device's member once it is created.
      setPendingSpaceToken(inv.token);
    } catch (e) {
      console.error('[onboarding] invite failed', e);
      inviteErr = $t('onboarding.invite.error', { default: 'Não consegui criar o convite agora. Podes convidar mais tarde nas Definições.' });
    } finally {
      inviteBusy = false;
    }
  }

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl(inviteCode));
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* clipboard blocked — the code is shown on screen to copy manually */
    }
  }

  const EMOJIS = ['🐷', '🌙', '🚀', '🐱', '⚽', '🌸', '⭐', '💖', '🦊', '🐰', '🌵', '🍄'];
  const INTENTS: { kind: SpaceKind; icon: string; key: string }[] = [
    { kind: 'solo', icon: '🧍', key: 'onboarding.intent.solo' },
    { kind: 'couple', icon: '💞', key: 'onboarding.intent.couple' },
    { kind: 'friends', icon: '🤝', key: 'onboarding.intent.friends' },
    { kind: 'family', icon: '🏡', key: 'onboarding.intent.family' },
    { kind: 'group', icon: '👥', key: 'onboarding.intent.group' }
  ];

  const canGo = $derived(canAdvance(ob));
  const isLast = $derived(ob.step === 'done');
  const pct = $derived(Math.round(progress(ob) * 100));

  function pickIntent(kind: SpaceKind): void {
    ob = { ...ob, kind };
  }

  function randomSaltHex(bytes = 16): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function complete(): Promise<void> {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      const memberId = crypto.randomUUID();
      const now = Date.now();
      const salt = randomSaltHex();
      const hash = await hashPassword(ob.secret, salt);
      const space = newSpace(ob, memberId, now);
      const member = newOwnerMembership(ob, space.id, memberId, now, { hash, salt });
      await putSpace(space);
      await putMember(member);
      registerKnownMember(memberId);
      // If we arrived here after redeeming an invite, bind the shared space
      // token to this new member so the two devices are paired.
      const pendingToken = takePendingSpaceToken();
      if (pendingToken) setSpaceToken(memberId, pendingToken);
      setSession(memberId as ProfileId, 'primary');
      // Create + hydrate the new member's OWN database, then set their mascot.
      await initStores(memberId as ProfileId);
      if (member.mascotId) await setActiveMascot(member.mascotId);
      fireConfettiEvent({ count: 140, origin: 'center' });
      await goto('/');
    } catch (e) {
      console.error('[onboarding] complete failed', e);
      errorMsg = $t('onboarding.error', { default: 'Algo correu mal. Tenta outra vez.' });
      busy = false;
    }
  }

  onMount(() => {
    // Already logged in (incl. fatma/daniel) — onboarding is not for you.
    if (getSession()) void goto('/');
  });
</script>

<svelte:head>
  <title>{$t('onboarding.title', { default: 'Criar conta — Presuntinho' })}</title>
</svelte:head>

<div class="ob">
  <div class="progress" aria-hidden="true"><span style={`width: ${pct}%`}></span></div>

  {#if ob.step === 'intent'}
    <section class="step">
      <h1>{$t('onboarding.intent.title', { default: 'Como queres usar o Presuntinho?' })}</h1>
      <p class="lead">{$t('onboarding.intent.subtitle', { default: 'Podes mudar mais tarde.' })}</p>
      <div class="tiles">
        {#each INTENTS as it (it.kind)}
          <button type="button" class="tile" class:on={ob.kind === it.kind} onclick={() => pickIntent(it.kind)}>
            <span class="tile-icon" aria-hidden="true">{it.icon}</span>
            <span>{$t(it.key, { default: it.kind })}</span>
          </button>
        {/each}
      </div>
    </section>
  {:else if ob.step === 'profile'}
    <section class="step">
      <h1>{$t('onboarding.profile.title', { default: 'Como te chamas?' })}</h1>
      <label class="field">
        <span>{$t('onboarding.profile.name_label', { default: 'Nome' })}</span>
        <input
          type="text"
          bind:value={ob.displayName}
          maxlength="40"
          placeholder={$t('onboarding.profile.name_placeholder', { default: 'O teu nome' })}
        />
      </label>
      <p class="field-label">{$t('onboarding.profile.emoji_label', { default: 'Escolhe um emoji' })}</p>
      <div class="emoji-row">
        {#each EMOJIS as e (e)}
          <button type="button" class="emoji" class:on={ob.emoji === e} onclick={() => (ob = { ...ob, emoji: e })} aria-label={e}>{e}</button>
        {/each}
      </div>
      <p class="field-label">{$t('onboarding.profile.mascot_label', { default: 'Escolhe a tua mascote' })}</p>
      <div class="mascot-grid">
        {#each MASCOTS as m (m.id)}
          <button type="button" class="mascot" class:on={ob.mascotId === m.id} onclick={() => (ob = { ...ob, mascotId: m.id })} aria-label={m.id}>
            <MascotAvatar mascot={m.id} pose="wave" size={54} animate={false} />
          </button>
        {/each}
      </div>
    </section>
  {:else if ob.step === 'privacy'}
    <section class="step">
      <h1>{$t('onboarding.privacy.title', { default: 'Tu decides o que é teu' })}</h1>
      <p class="lead">{$t('onboarding.privacy.body', { default: 'Por defeito, tudo o que crias é privado. Só partilhas o que escolheres, quando escolheres.' })}</p>
      <label class="field">
        <span>{$t('onboarding.privacy.password_label', { default: 'Palavra-passe' })}</span>
        <input
          type="password"
          bind:value={ob.secret}
          maxlength="80"
          placeholder={$t('onboarding.privacy.password_placeholder', { default: 'Mínimo 4 caracteres' })}
          autocomplete="new-password"
        />
      </label>
      <p class="hint">{$t('onboarding.privacy.password_hint', { default: 'Protege a tua conta neste dispositivo.' })}</p>
      <!-- The "share my private data on invite" toggle was removed: nothing in
           the app ships private data on invite yet, so it was a privacy control
           that did nothing (a broken promise). Everything stays private-first;
           re-add a real, honoured control when a sharing path exists. -->
    </section>
  {:else if ob.step === 'invite'}
    <section class="step">
      <h1>{$t('onboarding.invite.title', { default: 'Convida quando fizer sentido' })}</h1>
      <p class="lead">{$t('onboarding.invite.body', { default: 'Gera um código e partilha-o com a outra pessoa. Ao abri-lo no telemóvel dela, ficam ligados ao mesmo espaço.' })}</p>

      {#if !inviteCode}
        <button type="button" class="cta wide" onclick={genInvite} disabled={inviteBusy}>
          {inviteBusy ? $t('onboarding.invite.generating', { default: 'A gerar…' }) : $t('onboarding.invite.generate', { default: '🔗 Gerar convite' })}
        </button>
        {#if inviteErr}<p class="hint err">{inviteErr}</p>{/if}
      {:else}
        <div class="invite-box">
          <span class="invite-label">{$t('onboarding.invite.code_label', { default: 'Código de convite' })}</span>
          <strong class="invite-code">{inviteCode}</strong>
          <button type="button" class="ghost wide" onclick={copyInvite}>
            {copied ? $t('onboarding.invite.copied', { default: 'Link copiado ✓' }) : $t('onboarding.invite.copy', { default: 'Copiar link' })}
          </button>
        </div>
      {/if}
      <p class="note">{$t('onboarding.invite.local_note', { default: '🔗 O convite liga dois telemóveis ao mesmo espaço. Podes também fazê-lo mais tarde, sem pressa.' })}</p>
    </section>
  {:else}
    <section class="step done">
      <p class="done-emoji" aria-hidden="true">{ob.emoji}</p>
      <h1>{$t('onboarding.done.title', { default: 'Tudo pronto!' })}</h1>
      <p class="lead">{$t('onboarding.done.body', { default: 'O teu espaço está criado. Bem-vindo(a) ao Presuntinho.' })}</p>
      <p class="lead couple-hint">
        💞 {$t('onboarding.done.couple_hint', { default: 'Tens um amor? Cria a tua conta online e envia-lhe o convite de casal — a app liga-vos com coração surpresa, pontos partilhados e pings.' })}
      </p>
      {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    </section>
  {/if}

  <nav class="ob-nav">
    {#if ob.step !== 'intent'}
      <button type="button" class="ghost" onclick={() => (ob = prevStep(ob))} disabled={busy}>
        {$t('onboarding.nav.back', { default: '← Voltar' })}
      </button>
    {/if}
    <div class="spacer"></div>
    {#if isLast}
      <button type="button" class="cta" onclick={complete} disabled={busy}>
        {busy ? $t('onboarding.done.creating', { default: 'A criar…' }) : $t('onboarding.done.cta', { default: 'Criar conta e entrar' })}
      </button>
    {:else}
      <button type="button" class="cta" onclick={() => (ob = nextStep(ob))} disabled={!canGo}>
        {$t('onboarding.nav.next', { default: 'Continuar →' })}
      </button>
    {/if}
  </nav>
</div>

<style>
  .ob { max-width: 560px; margin: 0 auto; padding: 1.2rem 1rem calc(2rem + env(safe-area-inset-bottom)); color: var(--txt, #fff); min-height: 100dvh; display: flex; flex-direction: column; }
  .progress { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); overflow: hidden; margin-bottom: 1.4rem; }
  .progress span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--accent, #ec4899), #a78bfa); transition: width 260ms ease; }
  .step { flex: 1; }
  h1 { margin: 0 0 0.5rem; font-size: clamp(1.5rem, 6vw, 2.1rem); line-height: 1.1; }
  .lead { color: var(--txt2, #cbd5e1); line-height: 1.5; margin: 0 0 1.2rem; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .tile { display: grid; gap: 0.35rem; place-items: center; padding: 1.1rem 0.6rem; border-radius: 1.1rem; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.05); color: #fff; font-weight: 700; cursor: pointer; transition: transform 100ms ease, border-color 120ms ease, background 120ms ease; }
  .tile:hover { background: rgba(255, 255, 255, 0.08); }
  .tile.on { border-color: var(--accent, #ec4899); background: color-mix(in srgb, var(--accent, #ec4899) 16%, transparent); }
  .tile:active { transform: scale(0.97); }
  .tile-icon { font-size: 1.8rem; }
  .field { display: grid; gap: 0.35rem; margin-bottom: 1rem; }
  .field span { font-weight: 700; font-size: 0.9rem; }
  .field input { width: 100%; padding: 0.8rem 0.9rem; border-radius: 0.9rem; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: #fff; font: inherit; }
  .field input:focus { outline: none; border-color: var(--accent, #ec4899); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 20%, transparent); }
  .field-label { font-weight: 700; font-size: 0.9rem; margin: 0.4rem 0 0.5rem; }
  .emoji-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
  .emoji { width: 46px; height: 46px; border-radius: 0.8rem; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.05); font-size: 1.4rem; cursor: pointer; }
  .emoji.on { border-color: var(--accent, #ec4899); background: color-mix(in srgb, var(--accent, #ec4899) 18%, transparent); }
  .mascot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 0.5rem; }
  .mascot { display: grid; place-items: center; padding: 0.5rem; border-radius: 1rem; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.05); cursor: pointer; min-height: 74px; }
  .mascot.on { border-color: var(--accent, #ec4899); background: color-mix(in srgb, var(--accent, #ec4899) 16%, transparent); }
  .hint { color: var(--txt3, #94a3b8); font-size: 0.82rem; margin: 0.2rem 0 1rem; }
  .note { padding: 0.85rem 1rem; border-radius: 1rem; border: 1px dashed rgba(103, 232, 249, 0.4); background: rgba(34, 211, 238, 0.08); color: var(--txt2, #cbd5e1); line-height: 1.5; margin-top: 1rem; }
  .err { color: #fca5a5; }
  .wide { width: 100%; }
  .invite-box { display: grid; gap: 0.6rem; place-items: center; padding: 1.1rem; border-radius: 1.1rem; border: 1px solid var(--accent, #ec4899); background: color-mix(in srgb, var(--accent, #ec4899) 12%, transparent); }
  .invite-label { color: var(--txt2, #cbd5e1); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .invite-code { font-size: 1.8rem; font-weight: 900; letter-spacing: 0.28em; font-variant-numeric: tabular-nums; }
  .done { display: grid; place-items: center; text-align: center; gap: 0.4rem; }
  .done-emoji { font-size: 3.4rem; margin: 0; }
  .error { color: #fca5a5; }
  .ob-nav { display: flex; align-items: center; gap: 0.6rem; margin-top: 1.4rem; }
  .spacer { flex: 1; }
  .cta { min-height: 48px; padding: 0.7rem 1.4rem; border-radius: 0.9rem; border: 0; background: linear-gradient(135deg, var(--accent, #ec4899), #a78bfa); color: #fff; font-weight: 800; cursor: pointer; }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }
  .ghost { min-height: 48px; padding: 0.7rem 1rem; border-radius: 0.9rem; border: 1px solid rgba(255, 255, 255, 0.16); background: transparent; color: #fff; font-weight: 700; cursor: pointer; }
  .ghost:disabled { opacity: 0.5; }
  .couple-hint { font-size: .92rem; color: var(--txt2); border-top: 1px solid var(--border); padding-top: .8rem; }
</style>
