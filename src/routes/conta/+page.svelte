<script lang="ts">
  /**
   * /conta — real account (Supabase Auth) sign-up / sign-in, first-time @handle
   * claim, and account management (email, password, sign out). Phase 1 of the
   * social layer. Independent of the local password-gated profile — this is the
   * cross-device identity that contacts / couple / groups will build on.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';
  import {
    accountsEnabled,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithMagicLink,
    sendPasswordReset,
    claimAccount,
    isHandleAvailable,
    isValidHandle,
    normalizeHandle,
    updatePassword,
    updateEmail,
    updateMyAccount,
    searchAccounts
  } from '$lib/account/auth';
  import { uploadAvatar } from '$lib/account/avatar';
  import Avatar from '$lib/components/Avatar.svelte';
  import { accountState, startAccountSync, refreshAccount } from '$lib/account/account-store.svelte';
  import { signOutEverywhere } from '$lib/account/session-bridge';
  import {
    coupleInviteUrl,
    peekInviteFrom,
    clearInviteFrom,
    requestCouple
  } from '$lib/account/couple-link';
  import { goto } from '$app/navigation';

  let mode = $state<'signin' | 'signup'>('signin');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);

  // handle claim
  let handle = $state('');
  let handleState = $state<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle');
  let displayName = $state('');
  let handleTimer: ReturnType<typeof setTimeout> | null = null;

  // account management
  let newEmail = $state('');
  let newPassword = $state('');

  // ── Editor do perfil (nome, emoji, bio, foto) ──
  let profName = $state('');
  let profEmoji = $state('');
  let profBio = $state('');
  let profSaving = $state(false);
  let profSeeded = false;
  let avatarInput: HTMLInputElement | null = $state(null);
  let pendingAvatar = $state<File | null>(null);
  let avatarPreview = $state<string | null>(null);
  const EMOJI_PICKS = ['🙂', '🐷', '🌸', '🦊', '🐱', '🌙', '⭐', '❤️', '⚽', '🎮', '🎧', '📚'];

  // Semeia o formulário quando a conta carrega (uma vez — edições não são pisadas).
  $effect(() => {
    const a = accountState.account;
    if (!a || profSeeded) return;
    profSeeded = true;
    profName = a.display_name ?? '';
    profEmoji = a.emoji ?? '';
    profBio = a.bio ?? '';
  });

  function onAvatarChosen(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (avatarInput) avatarInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast($t('conta.profile.not_image', { default: 'Escolhe uma imagem (jpg, png, webp…).' }), 2600, 'error');
      return;
    }
    pendingAvatar = file;
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    avatarPreview = URL.createObjectURL(file);
  }

  async function saveProfile(): Promise<void> {
    if (profSaving || !accountState.account) return;
    profSaving = true;
    try {
      let avatar_url: string | undefined;
      if (pendingAvatar) avatar_url = await uploadAvatar(pendingAvatar);
      await updateMyAccount({
        display_name: profName.trim() || null,
        emoji: profEmoji.trim() || null,
        bio: profBio.trim() || null,
        ...(avatar_url ? { avatar_url } : {})
      });
      await refreshAccount();
      pendingAvatar = null;
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
        avatarPreview = null;
      }
      showToast($t('conta.profile.saved', { default: 'Perfil guardado! ✅' }), 2400);
    } catch (e) {
      showToast(authError(e), 3400, 'error');
    } finally {
      profSaving = false;
    }
  }

  const enabled = accountsEnabled();

  // ── Convite de casal (partilha + auto-pedido de quem chega via /convite) ──
  let inviteCopied = $state(false);
  const inviteLink = $derived(accountState.account ? coupleInviteUrl(accountState.account.handle) : '');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copyInviteLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink);
      inviteCopied = true;
      setTimeout(() => (inviteCopied = false), 2000);
    } catch {
      showToast($t('couplelink.share.copy_fail', { default: 'Não consegui copiar — seleciona o link manualmente.' }), 2600, 'warning');
    }
  }

  async function shareInviteLink(): Promise<void> {
    try {
      await navigator.share({
        title: 'Presuntinho 💞',
        text: $t('couplelink.share.text', { default: 'Vem ser meu casal no Presuntinho! 💞' }),
        url: inviteLink
      });
    } catch {
      /* user dismissed the sheet — not an error */
    }
  }

  /** Someone arrived via /convite/?de=<handle> and just got an account:
   *  send the couple request to the inviter automatically. */
  async function sendPendingCoupleInvite(): Promise<void> {
    const from = peekInviteFrom();
    if (!from || !accountState.account) return;
    if (from === accountState.account.handle) {
      clearInviteFrom();
      return;
    }
    try {
      const matches = await searchAccounts(from);
      const inviter = matches.find((a) => a.handle.toLowerCase() === from.toLowerCase());
      if (!inviter) return; // inviter handle vanished — leave stashed, harmless
      const r = await requestCouple(inviter);
      clearInviteFrom();
      if (r === 'sent' || r === 'proposed') {
        showToast(
          $t('couplelink.auto_sent', { values: { handle: inviter.handle }, default: '💌 Pedido de casal enviado a @{handle} — falta só ela aceitar!' }),
          3600
        );
      }
    } catch {
      /* offline — stays stashed; retried on the next visit to /conta */
    }
  }

  onMount(() => {
    void startAccountSync().then(() => void sendPendingCoupleInvite());
  });

  async function doAuth(): Promise<void> {
    if (busy) return;
    if (!email.trim() || !password) {
      showToast($t('conta.err.fill', { default: 'Preenche email e palavra-passe.' }), 2200);
      return;
    }
    busy = true;
    try {
      if (mode === 'signup') {
        const { needsConfirm } = await signUpWithEmail(email, password);
        if (needsConfirm) {
          showToast($t('conta.signup.confirm', { default: 'Conta criada! Confirma no email que te enviámos. 📧' }), 4000);
        } else {
          showToast($t('conta.signup.ok', { default: 'Conta criada! 🎉' }), 2500);
        }
      } else {
        await signInWithEmail(email, password);
        showToast($t('conta.signin.ok', { default: 'Sessão iniciada! 👋' }), 2000);
        password = '';
        // Real login → open the app as the matching profile.
        const { bridgeSupabaseSession } = await import('$lib/account/session-bridge');
        if ((await bridgeSupabaseSession()) === 'bridged') {
          location.href = '/';
          return;
        }
      }
      password = '';
    } catch (e) {
      showToast(authError(e), 3200, 'error');
    } finally {
      busy = false;
    }
  }

  async function doGoogle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await signInWithGoogle(); // redirects away
    } catch (e) {
      showToast(authError(e), 3200, 'error');
      busy = false;
    }
  }

  async function doMagicLink(): Promise<void> {
    if (busy || !email.trim()) {
      showToast($t('conta.err.email', { default: 'Escreve o teu email primeiro.' }), 2200);
      return;
    }
    busy = true;
    try {
      await signInWithMagicLink(email);
      showToast($t('conta.magic.sent', { default: 'Enviámos-te um link de entrada por email. ✨' }), 4000);
    } catch (e) {
      showToast(authError(e), 3200, 'error');
    } finally {
      busy = false;
    }
  }

  async function doReset(): Promise<void> {
    if (!email.trim()) {
      showToast($t('conta.err.email', { default: 'Escreve o teu email primeiro.' }), 2200);
      return;
    }
    try {
      await sendPasswordReset(email);
      showToast($t('conta.reset.sent', { default: 'Enviámos um link para redefinir a palavra-passe. 📧' }), 4000);
    } catch (e) {
      showToast(authError(e), 3200, 'error');
    }
  }

  function onHandleInput(): void {
    handle = normalizeHandle(handle);
    if (handleTimer) clearTimeout(handleTimer);
    if (!handle) {
      handleState = 'idle';
      return;
    }
    if (!isValidHandle(handle)) {
      handleState = 'invalid';
      return;
    }
    handleState = 'checking';
    handleTimer = setTimeout(async () => {
      try {
        handleState = (await isHandleAvailable(handle)) ? 'free' : 'taken';
      } catch {
        handleState = 'idle';
      }
    }, 400);
  }

  async function doClaim(): Promise<void> {
    if (busy || handleState !== 'free') return;
    busy = true;
    try {
      await claimAccount({ handle, display_name: displayName.trim() || undefined });
      await refreshAccount();
      showToast($t('conta.claim.ok', { values: { handle }, default: 'Bem-vindo, @{handle}! 🎉' }), 3000);
      // Chegou via /convite/?de=<handle>? O pedido de casal segue já.
      void sendPendingCoupleInvite();
    } catch (e) {
      showToast(authError(e), 3200, 'error');
    } finally {
      busy = false;
    }
  }

  async function doSignOut(): Promise<void> {
    try {
      // Full logout: clears BOTH the Supabase auth session and the local
      // profile session, then returns to the lock screen — otherwise the app
      // stayed unlocked after "Terminar sessão" (shared-device exposure).
      await signOutEverywhere();
      showToast($t('conta.signout.ok', { default: 'Sessão terminada.' }), 2000);
      await goto('/splash/');
    } catch (e) {
      showToast(authError(e), 3000, 'error');
    }
  }

  async function doUpdateEmail(): Promise<void> {
    if (!newEmail.trim()) return;
    try {
      await updateEmail(newEmail);
      showToast($t('conta.email.sent', { default: 'Confirma a alteração no email novo. 📧' }), 4000);
      newEmail = '';
    } catch (e) {
      showToast(authError(e), 3200, 'error');
    }
  }

  async function doUpdatePassword(): Promise<void> {
    if (newPassword.length < 6) {
      showToast($t('conta.pw.short', { default: 'A palavra-passe precisa de 6+ caracteres.' }), 2600);
      return;
    }
    try {
      await updatePassword(newPassword);
      showToast($t('conta.pw.ok', { default: 'Palavra-passe atualizada. ✅' }), 2600);
      newPassword = '';
    } catch (e) {
      showToast(authError(e), 3200, 'error');
    }
  }

  function authError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (/invalid login/i.test(msg)) return $t('conta.err.invalid', { default: 'Email ou palavra-passe errados.' });
    if (/already registered/i.test(msg)) return $t('conta.err.exists', { default: 'Já existe conta com esse email — inicia sessão.' });
    if (/rate/i.test(msg)) return $t('conta.err.rate', { default: 'Demasiadas tentativas — espera um pouco.' });
    return msg;
  }
</script>

<svelte:head>
  <title>{$t('conta.meta.title', { default: 'A minha conta · Presuntinho' })}</title>
</svelte:head>

<div class="conta">
  <header class="topbar">
    <a class="back" href="/" aria-label={$t('nav.home', { default: 'Home' })}>←</a>
    <h1>{$t('conta.title', { default: 'A minha conta' })}</h1>
  </header>

  {#if !enabled}
    <p class="note">{$t('conta.disabled', { default: 'As contas online não estão configuradas nesta app.' })}</p>
  {:else if !accountState.ready}
    <p class="note">{$t('conta.loading', { default: 'A carregar…' })}</p>
  {:else if !accountState.user}
    <!-- ── not signed in: auth forms ── -->
    <div class="card">
      <div class="seg">
        <button type="button" class:on={mode === 'signin'} onclick={() => (mode = 'signin')}>{$t('conta.tab.signin', { default: 'Entrar' })}</button>
        <button type="button" class:on={mode === 'signup'} onclick={() => (mode = 'signup')}>{$t('conta.tab.signup', { default: 'Criar conta' })}</button>
      </div>
      <label>
        <span>{$t('conta.email', { default: 'Email' })}</span>
        <input type="email" autocomplete="email" bind:value={email} placeholder={$t('conta.email_placeholder', { default: 'tu@email.com' })} />
      </label>
      <label>
        <span>{$t('conta.password', { default: 'Palavra-passe' })}</span>
        <input type="password" autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} bind:value={password} placeholder="••••••••" />
      </label>
      <button type="button" class="cta" onclick={doAuth} disabled={busy}>
        {mode === 'signup' ? $t('conta.tab.signup', { default: 'Criar conta' }) : $t('conta.tab.signin', { default: 'Entrar' })}
      </button>
      <button type="button" class="google" onclick={doGoogle} disabled={busy}>
        <span class="g" aria-hidden="true">G</span>
        {$t('conta.google', { default: 'Continuar com Google' })}
      </button>
      <div class="alt">
        <button type="button" class="link" onclick={doMagicLink} disabled={busy}>{$t('conta.magic', { default: 'Entrar por link mágico (sem palavra-passe)' })}</button>
        {#if mode === 'signin'}
          <button type="button" class="link" onclick={doReset}>{$t('conta.forgot', { default: 'Esqueci-me da palavra-passe' })}</button>
        {/if}
      </div>
    </div>
  {:else if !accountState.account}
    <!-- ── signed in, no @handle yet: claim ── -->
    <div class="card">
      <h2>{$t('conta.claim.title', { default: 'Escolhe o teu @handle' })}</h2>
      <p class="sub">{$t('conta.claim.sub', { default: 'É como as pessoas te encontram para ligar contas (tipo @ nas redes sociais).' })}</p>
      <label>
        <span>{$t('conta.handle', { default: 'Handle' })}</span>
        <div class="handle-row">
          <span class="at">@</span>
          <input type="text" bind:value={handle} oninput={onHandleInput} maxlength="20" placeholder="oteuhandle" autocapitalize="none" autocomplete="off" spellcheck="false" />
        </div>
      </label>
      <p class="handle-hint" class:ok={handleState === 'free'} class:bad={handleState === 'taken' || handleState === 'invalid'}>
        {#if handleState === 'checking'}{$t('conta.handle.checking', { default: 'A verificar…' })}
        {:else if handleState === 'free'}✓ {$t('conta.handle.free', { default: 'Disponível!' })}
        {:else if handleState === 'taken'}✕ {$t('conta.handle.taken', { default: 'Já está em uso.' })}
        {:else if handleState === 'invalid'}{$t('conta.handle.invalid', { default: '3–20 caracteres: letras minúsculas, números e _' })}
        {:else}&nbsp;{/if}
      </p>
      <label>
        <span>{$t('conta.name', { default: 'Nome (opcional)' })}</span>
        <input type="text" bind:value={displayName} maxlength="40" placeholder={$t('conta.name_placeholder', { default: 'O teu nome' })} />
      </label>
      <button type="button" class="cta" onclick={doClaim} disabled={busy || handleState !== 'free'}>
        {$t('conta.claim.cta', { default: 'Reservar handle' })}
      </button>
    </div>
  {:else}
    <!-- ── signed in with account: manage ── -->
    <div class="card">
      <div class="me">
        <Avatar emoji={accountState.account.emoji} url={accountState.account.avatar_url} size={52} alt="" />
        <div>
          <strong>{accountState.account.display_name || `@${accountState.account.handle}`}</strong>
          <small>@{accountState.account.handle} · {accountState.user.email}</small>
        </div>
      </div>
      <div class="links">
        <a class="linkcard" href="/contactos/">👥 {$t('conta.contacts', { default: 'Contactos' })}</a>
        <a class="linkcard" href={`/u/?h=${accountState.account.handle}`}>🪪 {$t('conta.public_profile', { default: 'O meu perfil' })}</a>
        <a class="linkcard" href="/grupos/">💞 {$t('conta.spaces', { default: 'Casal e grupos' })}</a>
      </div>
    </div>

    <!-- ── Editor do perfil público ── -->
    <div class="card">
      <h2>{$t('conta.profile.title', { default: 'O meu perfil' })}</h2>
      <p class="sub-note">{$t('conta.profile.sub', { default: 'É isto que os teus amigos veem no teu perfil.' })}</p>
      <div class="avatar-row">
        {#if avatarPreview}
          <img class="avatar-preview" src={avatarPreview} alt="" />
        {:else}
          <Avatar emoji={profEmoji || accountState.account.emoji} url={accountState.account.avatar_url} size={72} alt="" />
        {/if}
        <input type="file" bind:this={avatarInput} accept="image/*" hidden onchange={onAvatarChosen} />
        <button type="button" class="mini" onclick={() => avatarInput?.click()}>
          📷 {$t('conta.profile.change_photo', { default: 'Mudar foto' })}
        </button>
      </div>
      <label>
        <span>{$t('conta.profile.name', { default: 'Nome' })}</span>
        <input type="text" bind:value={profName} maxlength="40" placeholder={$t('conta.name_placeholder', { default: 'O teu nome' })} />
      </label>
      <label>
        <span>{$t('conta.profile.emoji', { default: 'Emoji (usado sem foto)' })}</span>
        <div class="emoji-row">
          {#each EMOJI_PICKS as e (e)}
            <button type="button" class="emoji-opt" class:sel={profEmoji === e} onclick={() => (profEmoji = e)}>{e}</button>
          {/each}
        </div>
      </label>
      <label>
        <span>{$t('conta.profile.bio', { default: 'Bio' })}</span>
        <textarea bind:value={profBio} maxlength="160" rows="2" placeholder={$t('conta.profile.bio_ph', { default: 'Uma frase sobre ti…' })}></textarea>
      </label>
      <button type="button" class="cta" onclick={() => void saveProfile()} disabled={profSaving}>
        {profSaving ? $t('common.saving', { default: 'A guardar…' }) : $t('conta.profile.save', { default: 'Guardar perfil' })}
      </button>
    </div>

    <!-- ── Convite de casal: partilha um link; quem o abre cria conta e o
         pedido de casal chega-te sozinho. ── -->
    <div class="card couple-card">
      <h2>💞 {$t('couplelink.share.title', { default: 'Convida o teu casal' })}</h2>
      <p class="couple-sub">{$t('couplelink.share.body', { default: 'Envia este link à tua pessoa. Quando criar conta, recebes o pedido de casal — aceita e ficam ligados.' })}</p>
      <div class="inline">
        <input type="text" readonly value={inviteLink} aria-label={$t('couplelink.share.link_aria', { default: 'Link de convite de casal' })} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
        <button type="button" class="mini" onclick={copyInviteLink}>{inviteCopied ? '✓' : $t('couplelink.share.copy', { default: 'Copiar' })}</button>
      </div>
      {#if canShare}
        <button type="button" class="cta" onclick={shareInviteLink}>📤 {$t('couplelink.share.share', { default: 'Partilhar convite' })}</button>
      {/if}
    </div>

    <div class="card">
      <h2>{$t('conta.security', { default: 'Segurança' })}</h2>
      <label>
        <span>{$t('conta.new_email', { default: 'Mudar email' })}</span>
        <div class="inline">
          <input type="email" bind:value={newEmail} placeholder={accountState.user.email ?? 'novo@email.com'} />
          <button type="button" class="mini" onclick={doUpdateEmail}>{$t('conta.save', { default: 'Guardar' })}</button>
        </div>
      </label>
      <label>
        <span>{$t('conta.new_password', { default: 'Mudar palavra-passe' })}</span>
        <div class="inline">
          <input type="password" bind:value={newPassword} placeholder="••••••••" autocomplete="new-password" />
          <button type="button" class="mini" onclick={doUpdatePassword}>{$t('conta.save', { default: 'Guardar' })}</button>
        </div>
      </label>
    </div>

    <button type="button" class="signout" onclick={doSignOut}>{$t('conta.signout', { default: 'Terminar sessão' })}</button>
  {/if}
</div>

<style>
  .conta { max-width: 560px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt); }
  .topbar { display: flex; align-items: center; gap: .75rem; padding: .25rem 0 1rem; }
  .back { color: var(--txt); text-decoration: none; font-size: 1.4rem; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
  .back:hover { background: var(--card-hover, var(--card)); }
  .topbar h1 { margin: 0; font-size: 1.4rem; font-weight: 800; }
  .note { color: var(--txt2); text-align: center; padding: 2rem 1rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-xl, 1.25rem); padding: 1.1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: .8rem; }
  .card h2 { margin: 0; font-size: var(--fs-md, 1rem); }
  .sub, .card small { color: var(--txt2); }
  .sub { margin: -.3rem 0 .2rem; font-size: .85rem; line-height: 1.4; }
  .seg { display: flex; gap: .3rem; background: var(--bg-elev, rgba(0,0,0,.15)); border-radius: 999px; padding: .25rem; }
  .seg button { flex: 1; border: 0; background: transparent; color: var(--txt2); font: inherit; font-weight: 700; padding: .55rem; border-radius: 999px; cursor: pointer; min-height: 40px; }
  .seg button.on { background: var(--accent); color: var(--on-accent, #fff); }
  label { display: flex; flex-direction: column; gap: .3rem; font-size: .85rem; }
  label > span { color: var(--txt2); font-weight: 600; }
  input, textarea { font: inherit; padding: .7rem .85rem; border-radius: var(--radius-md, .6rem); border: 1px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); color: var(--txt); min-height: 44px; width: 100%; }
  textarea { resize: vertical; }
  input:focus-visible, textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
  .sub-note { margin: -.35rem 0 .1rem; color: var(--txt3); font-size: .82rem; }
  .avatar-row { display: flex; align-items: center; gap: .9rem; }
  .avatar-preview { width: 72px; height: 72px; border-radius: 999px; object-fit: cover; border: 2px solid var(--accent); }
  .emoji-row { display: flex; flex-wrap: wrap; gap: .35rem; }
  .emoji-opt { width: 42px; height: 42px; font-size: 1.25rem; line-height: 1; display: grid; place-items: center; cursor: pointer; background: var(--bg-elev); border: 1.5px solid var(--border); border-radius: 999px; }
  .emoji-opt.sel { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .handle-row { display: flex; align-items: center; gap: .3rem; }
  .handle-row .at { color: var(--txt3); font-weight: 800; font-size: 1.1rem; }
  .handle-hint { margin: -.4rem 0 0; font-size: .8rem; min-height: 1.1rem; color: var(--txt3); }
  .handle-hint.ok { color: var(--success, #10b981); }
  .handle-hint.bad { color: var(--error, #ef4444); }
  .cta { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: .7rem 1.1rem; border-radius: var(--radius-md, .6rem); border: 0; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 800; cursor: pointer; text-decoration: none; }
  .cta:disabled { opacity: .55; cursor: not-allowed; }
  .google { display: inline-flex; align-items: center; justify-content: center; gap: .55rem; min-height: 48px; padding: .7rem 1.1rem; border-radius: var(--radius-md, .6rem); border: 1px solid var(--border); background: var(--bg-elev, transparent); color: var(--txt); font: inherit; font-weight: 700; cursor: pointer; }
  .google:disabled { opacity: .55; cursor: not-allowed; }
  .google .g { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #fff; color: #4285f4; font-weight: 900; font-size: .85rem; }
  .alt { display: flex; flex-direction: column; gap: .1rem; align-items: flex-start; }
  .link { background: transparent; border: 0; color: var(--accent); font: inherit; font-size: .85rem; cursor: pointer; padding: .5rem .1rem; }
  .link:hover { text-decoration: underline; }
  .me { display: flex; align-items: center; gap: .75rem; }
  .me strong { display: block; font-size: 1.05rem; }
  .me small { display: block; color: var(--txt3); font-size: .8rem; }
  .links { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .linkcard { display: flex; align-items: center; justify-content: center; gap: .4rem; min-height: 48px; border-radius: var(--radius-md, .6rem); border: 1px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); color: var(--txt); text-decoration: none; font-weight: 700; font-size: .9rem; }
  .linkcard:hover { border-color: var(--accent); }
  .couple-card { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .couple-sub { margin: 0; color: var(--txt2); font-size: .9rem; line-height: 1.45; }
  .couple-card input[readonly] { color: var(--txt2); font-size: .85rem; }
  .inline { display: flex; gap: .4rem; }
  .inline input { flex: 1; }
  .mini { flex-shrink: 0; border: 1px solid var(--border); background: var(--bg-elev, transparent); color: var(--txt); font: inherit; font-weight: 700; border-radius: var(--radius-md, .6rem); padding: 0 .9rem; cursor: pointer; min-height: 44px; }
  .signout { width: 100%; min-height: 48px; border: 1px solid color-mix(in srgb, var(--error, #ef4444) 40%, var(--border)); background: transparent; color: var(--error, #ef4444); font: inherit; font-weight: 700; border-radius: var(--radius-md, .6rem); cursor: pointer; }
  .signout:hover { background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent); }
</style>
