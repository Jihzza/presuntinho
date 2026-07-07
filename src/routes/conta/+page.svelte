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
    signOut,
    claimAccount,
    isHandleAvailable,
    isValidHandle,
    normalizeHandle,
    updatePassword,
    updateEmail
  } from '$lib/account/auth';
  import { accountState, startAccountSync, refreshAccount } from '$lib/account/account-store.svelte';

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

  const enabled = accountsEnabled();

  onMount(() => {
    void startAccountSync();
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
      showToast(authError(e), 3200);
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
      showToast(authError(e), 3200);
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
      showToast(authError(e), 3200);
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
      showToast(authError(e), 3200);
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
    } catch (e) {
      showToast(authError(e), 3200);
    } finally {
      busy = false;
    }
  }

  async function doSignOut(): Promise<void> {
    try {
      await signOut();
      showToast($t('conta.signout.ok', { default: 'Sessão terminada.' }), 2000);
    } catch (e) {
      showToast(authError(e), 3000);
    }
  }

  async function doUpdateEmail(): Promise<void> {
    if (!newEmail.trim()) return;
    try {
      await updateEmail(newEmail);
      showToast($t('conta.email.sent', { default: 'Confirma a alteração no email novo. 📧' }), 4000);
      newEmail = '';
    } catch (e) {
      showToast(authError(e), 3200);
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
      showToast(authError(e), 3200);
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
        <span class="me-emoji">{accountState.account.emoji ?? '🙂'}</span>
        <div>
          <strong>{accountState.account.display_name || `@${accountState.account.handle}`}</strong>
          <small>@{accountState.account.handle} · {accountState.user.email}</small>
        </div>
      </div>
      <div class="links">
        <a class="linkcard" href="/contactos/">👥 {$t('conta.contacts', { default: 'Contactos' })}</a>
        <a class="linkcard" href="/grupos/">💞 {$t('conta.spaces', { default: 'Casal e grupos' })}</a>
      </div>
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
  input { font: inherit; padding: .7rem .85rem; border-radius: var(--radius-md, .6rem); border: 1px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); color: var(--txt); min-height: 44px; width: 100%; }
  input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
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
  .me-emoji { font-size: 2.2rem; line-height: 1; }
  .me strong { display: block; font-size: 1.05rem; }
  .me small { display: block; color: var(--txt3); font-size: .8rem; }
  .links { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .linkcard { display: flex; align-items: center; justify-content: center; gap: .4rem; min-height: 48px; border-radius: var(--radius-md, .6rem); border: 1px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); color: var(--txt); text-decoration: none; font-weight: 700; font-size: .9rem; }
  .linkcard:hover { border-color: var(--accent); }
  .inline { display: flex; gap: .4rem; }
  .inline input { flex: 1; }
  .mini { flex-shrink: 0; border: 1px solid var(--border); background: var(--bg-elev, transparent); color: var(--txt); font: inherit; font-weight: 700; border-radius: var(--radius-md, .6rem); padding: 0 .9rem; cursor: pointer; min-height: 44px; }
  .signout { width: 100%; min-height: 48px; border: 1px solid color-mix(in srgb, var(--error, #ef4444) 40%, var(--border)); background: transparent; color: var(--error, #ef4444); font: inherit; font-weight: 700; border-radius: var(--radius-md, .6rem); cursor: pointer; }
  .signout:hover { background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent); }
</style>
