<script lang="ts">
  /**
   * /casal/bemvindos/?space=<id> — couple onboarding, right after the accept.
   * A short, warm sequence:
   *   1. congrats — confetti + plush hug + both names
   *   2. identity — name & emoji for the couple space (shared)
   *   3. features — what just unlocked + optional ping preference
   * Ends on the hub with couple mode live.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { fireConfettiEvent, showToast } from '$lib/components/events';
  import { playSfx } from '$lib/gamification/sound';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { listSpaces, otherMember, setSpaceMeta, isCoupleActive, type Space, type SpaceMember } from '$lib/account/spaces';
  import { readCouplePrefs, writeCouplePrefs } from '$lib/couple/couple-prefs';
  import PushToggle from '$lib/components/PushToggle.svelte';

  let step = $state<0 | 1 | 2>(0);
  let space = $state<Space | null>(null);
  let partner = $state<SpaceMember | null>(null);
  let loading = $state(true);
  let saving = $state(false);

  let coupleName = $state('');
  let coupleEmoji = $state('💞');
  const EMOJIS = ['💞', '💑', '🐷', '❤️', '🌙', '✨', '🦋', '🍓'];

  let prefs = $state(readCouplePrefs());

  onMount(() => {
    void (async () => {
      await startAccountSync();
      if (!accountState.account) {
        void goto('/conta/');
        return;
      }
      const spaceId = page.url.searchParams.get('space');
      try {
        const spaces = await listSpaces();
        space =
          spaces.find((s) => s.id === spaceId && s.kind === 'couple') ??
          spaces.find((s) => s.kind === 'couple' && isCoupleActive(s)) ??
          null;
        partner = space ? otherMember(space, accountState.account.id) : null;
      } catch (e) {
        console.warn('[casal/bemvindos] load failed', e);
      }
      if (!space) {
        void goto('/');
        return;
      }
      const myName = accountState.account.display_name || `@${accountState.account.handle}`;
      const otherName = partner?.display_name || (partner ? `@${partner.handle}` : '');
      coupleName = space.name || (otherName ? `${myName} & ${otherName}` : myName);
      if (space.emoji) coupleEmoji = space.emoji;
      loading = false;
      playSfx('milestone');
      fireConfettiEvent(140);
      setTimeout(() => fireConfettiEvent(90), 900);
    })();
  });

  async function saveIdentity(): Promise<void> {
    if (!space || saving) return;
    saving = true;
    try {
      await setSpaceMeta(space.id, coupleName.trim(), coupleEmoji);
    } catch (e) {
      console.warn('[casal/bemvindos] set meta failed', e);
      // Non-fatal — the name can be set again later; keep the flow moving.
    } finally {
      saving = false;
    }
    step = 2;
  }

  function finish(): void {
    // The shared heart is part of active couple mode and must be visible on
    // both phones together.  Only incoming pings remain a per-device choice.
    writeCouplePrefs({ ...prefs, heart: true });
    showToast($t('casal.bemvindos.done_toast', { default: 'Modo casal ativo! 💞' }), 2600);
    fireConfettiEvent(80);
    void goto('/');
  }

  const partnerLabel = $derived(partner?.display_name || (partner ? `@${partner.handle}` : '💞'));
  const myLabel = $derived(accountState.account?.display_name || (accountState.account ? `@${accountState.account.handle}` : ''));
</script>

<svelte:head>
  <title>{$t('casal.bemvindos.meta', { default: 'Bem-vindos ao modo casal · Presuntinho' })}</title>
</svelte:head>

<div class="bemvindos">
  {#if loading}
    <p class="hint">{$t('uprofile.loading', { default: 'A carregar…' })}</p>
  {:else}
    <div class="card" class:pop={step === 0}>
      <div class="dots" aria-hidden="true">
        {#each [0, 1, 2] as d}
          <span class="dot" class:on={step >= d}></span>
        {/each}
      </div>

      {#if step === 0}
        <span class="art" aria-hidden="true">
          <img src="/art/couple-hug.webp" alt="" width="190" height="190" loading="eager" />
        </span>
        <h1>{$t('casal.bemvindos.title', { default: 'Estão ligados! 💞' })}</h1>
        <p class="names">{myLabel} <span class="amp">+</span> {partnerLabel}</p>
        <p class="sub">{$t('casal.bemvindos.body', { default: 'As vossas contas agora falam uma com a outra. Vamos preparar o vosso cantinho — leva 20 segundos.' })}</p>
        <button type="button" class="btn primary" onclick={() => (step = 1)}>
          {$t('casal.bemvindos.next', { default: 'Continuar' })} →
        </button>
      {:else if step === 1}
        <span class="emoji-preview" aria-hidden="true">{coupleEmoji}</span>
        <h1>{$t('casal.bemvindos.identity_title', { default: 'O vosso nome' })}</h1>
        <p class="sub">{$t('casal.bemvindos.identity_body', { default: 'Como se chama este casal? Aparece nas páginas partilhadas.' })}</p>
        <input
          class="name-input"
          type="text"
          bind:value={coupleName}
          maxlength="40"
          placeholder={$t('casal.bemvindos.name_ph', { default: 'Nome do casal' })}
        />
        <div class="emoji-row" role="radiogroup" aria-label={$t('casal.bemvindos.emoji_aria', { default: 'Emoji do casal' })}>
          {#each EMOJIS as e}
            <button
              type="button"
              class="emoji-opt"
              class:sel={coupleEmoji === e}
              role="radio"
              aria-checked={coupleEmoji === e}
              onclick={() => (coupleEmoji = e)}
            >{e}</button>
          {/each}
        </div>
        <button type="button" class="btn primary" disabled={saving} onclick={saveIdentity}>
          {saving ? $t('casal.bemvindos.saving', { default: 'A guardar…' }) : `${$t('casal.bemvindos.next', { default: 'Continuar' })} →`}
        </button>
      {:else}
        <span class="emoji-preview" aria-hidden="true">🎁</span>
        <h1>{$t('casal.bemvindos.features_title', { default: 'O que desbloquearam' })}</h1>
        <ul class="features">
          <li>
            <span class="f-icon" aria-hidden="true">💗</span>
            <span class="f-body">
              <strong>{$t('casal.bemvindos.f_heart', { default: 'Coração surpresa' })}</strong>
              <small>{$t('casal.bemvindos.f_heart_sub', { default: 'Aparece nos dois telemóveis ao mesmo tempo — toca para somar pontos do casal.' })}</small>
            </span>
            <span class="always-on" aria-label={$t('casal.bemvindos.f_heart', { default: 'Coração sincronizado' })}>✓</span>
          </li>
          <li>
            <span class="f-icon" aria-hidden="true">📳</span>
            <span class="f-body">
              <strong>{$t('casal.bemvindos.f_pings', { default: 'Pings de amor' })}</strong>
              <small>{$t('casal.bemvindos.f_pings_sub', { default: 'Um toque no coração do outro lado faz vibrar o teu telemóvel.' })}</small>
            </span>
            <input type="checkbox" class="switch" bind:checked={prefs.pings} aria-label={$t('casal.bemvindos.f_pings', { default: 'Pings de amor' })} />
          </li>
          <li>
            <span class="f-icon" aria-hidden="true">💬</span>
            <span class="f-body">
              <strong>{$t('casal.bemvindos.f_chat', { default: 'Mensagens do casal' })}</strong>
              <small>{$t('casal.bemvindos.f_chat_sub', { default: 'Chat privado com fotos, áudios e tópicos — em Mensagens.' })}</small>
            </span>
            <span class="f-on">✓</span>
          </li>
          <li>
            <span class="f-icon" aria-hidden="true">🏆</span>
            <span class="f-body">
              <strong>{$t('casal.bemvindos.f_points', { default: 'Pontos partilhados' })}</strong>
              <small>{$t('casal.bemvindos.f_points_sub', { default: 'O contador de amor soma dos dois lados, em tempo real.' })}</small>
            </span>
            <span class="f-on">✓</span>
          </li>
          <li class="f-push">
            <span class="f-icon" aria-hidden="true">🔔</span>
            <span class="f-body">
              <strong>{$t('casal.bemvindos.f_push', { default: 'Pings no telemóvel' })}</strong>
              <small>{$t('casal.bemvindos.f_push_sub', { default: 'Recebe os "amo-te" e as "saudades" mesmo com a app fechada, com vibração própria.' })}</small>
            </span>
          </li>
        </ul>
        <PushToggle />
        <button type="button" class="btn primary" onclick={finish}>
          {$t('casal.bemvindos.finish', { default: 'Começar 💞' })}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bemvindos {
    min-height: calc(100dvh - 8rem);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .hint { color: var(--txt3); }
  .card {
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    text-align: center;
    padding: 1.6rem 1.4rem 1.8rem;
    background: var(--card);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    border-radius: var(--radius-xl, 1.6rem);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.35));
  }
  @keyframes card-pop {
    from { transform: scale(0.94); opacity: 0.4; }
    to { transform: scale(1); opacity: 1; }
  }
  .card.pop { animation: card-pop 380ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
  .dots { display: flex; gap: 0.45rem; margin-bottom: 0.4rem; }
  .dot { width: 9px; height: 9px; border-radius: 999px; background: color-mix(in srgb, var(--txt3) 35%, transparent); transition: background 200ms ease, transform 200ms ease; }
  .dot.on { background: var(--accent); transform: scale(1.15); }
  .art { line-height: 1; }
  .art img { width: clamp(150px, 46vw, 190px); height: auto; filter: drop-shadow(0 12px 26px rgba(0, 0, 0, 0.2)); }
  h1 { margin: 0.3rem 0 0; font-size: var(--fs-xl, 1.4rem); color: var(--txt); }
  .names { margin: 0; font-weight: 800; color: var(--accent); font-size: 1.05rem; }
  .amp { opacity: 0.7; margin: 0 0.15rem; }
  .sub { margin: 0; color: var(--txt2); font-size: var(--fs-sm, 0.92rem); line-height: 1.55; max-width: 36ch; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
    min-height: 48px; padding: 0 1.6rem; margin-top: 0.8rem;
    border-radius: 999px; border: 0; font: inherit; font-weight: 800; font-size: 1.02rem;
    background: var(--accent); color: var(--on-accent, #fff); cursor: pointer;
  }
  .btn:hover { filter: brightness(1.06); }
  .btn:disabled { opacity: 0.65; cursor: wait; }
  .emoji-preview { font-size: 3rem; line-height: 1; }
  .name-input {
    width: 100%; max-width: 300px; margin-top: 0.4rem;
    min-height: 48px; padding: 0 1rem; text-align: center;
    font: inherit; font-weight: 700; color: var(--txt);
    background: var(--bg-elev); border: 1.5px solid var(--border);
    border-radius: var(--radius-md, 0.75rem);
  }
  .name-input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  .emoji-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.4rem; margin-top: 0.5rem; }
  .emoji-opt {
    width: 46px; height: 46px; font-size: 1.4rem; line-height: 1;
    display: grid; place-items: center; cursor: pointer;
    background: var(--bg-elev); border: 1.5px solid var(--border); border-radius: 999px;
    transition: transform 120ms ease, border-color 120ms ease;
  }
  .emoji-opt:hover { transform: scale(1.08); }
  .emoji-opt.sel { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); transform: scale(1.12); }
  .features { list-style: none; margin: 0.6rem 0 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 0.45rem; text-align: start; }
  .features li {
    display: flex; align-items: center; gap: 0.7rem;
    padding: 0.65rem 0.8rem; border: 1px solid var(--border);
    border-radius: var(--radius-md, 0.75rem); background: var(--bg-elev);
  }
  .f-icon { font-size: 1.5rem; line-height: 1; }
  .f-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .f-body strong { font-size: 0.95rem; }
  .f-body small { color: var(--txt3); font-size: 0.78rem; line-height: 1.35; }
  .f-on { color: var(--success, #22c55e); font-weight: 900; }
  .switch {
    appearance: none; width: 46px; height: 27px; border-radius: 999px; position: relative;
    background: color-mix(in srgb, var(--txt3) 35%, transparent); cursor: pointer; transition: background 160ms ease;
    flex-shrink: 0;
  }
  .switch::after {
    content: ''; position: absolute; top: 3px; inset-inline-start: 3px; width: 21px; height: 21px;
    border-radius: 999px; background: #fff; transition: transform 160ms ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .switch:checked { background: var(--accent); }
  .switch:checked::after { transform: translateX(19px); }
  .switch:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
  :global([dir='rtl']) .switch:checked::after { transform: translateX(-19px); }
  .always-on {
    flex: 0 0 42px;
    height: 26px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 24%, var(--card));
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
    font-weight: 900;
  }
</style>
