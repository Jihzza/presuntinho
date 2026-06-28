<script lang="ts">
  /**
   * Phase 9 — Settings page (Definições).
   *
   * Sections:
   *   1. Theme    — light / dark / auto (persists to Dexie `settings` row,
   *                 applies CSS class to document.documentElement)
   *   2. Language — pt-PT / en (persists to localStorage `fat-pref-lang`
   *                 via the i18n module + to Dexie `settings.lang`)
   *   3. Account  — reset password (MVP: stub message)
   *   4. Data     — clear local data (with confirmation modal),
   *                 export to JSON, import from JSON
   *   5. About    — version + links
   *
   * All persistent state lives in Dexie via the existing
   * `src/lib/state/stores.ts` stores (`theme`, `lang`, `funMode`).  The
   * settings page does not introduce a parallel persistence path.
   */

  import { onMount, tick } from 'svelte';
  import { db, DEFAULT_SETTINGS } from '$lib/state/db';
  import { theme as themeStore, lang as langStore, funMode as funModeStore } from '$lib/state/stores';
  import { locale, waitLocale } from 'svelte-i18n';
  import { setLocale, LOCALES, LOCALE_META, type Locale } from '$lib/i18n';
  import {
    exportData as backupExport,
    parseBackup,
    payloadToBlob,
    suggestedFilename,
    type BackupPayload
  } from '$lib/backup';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import Languages from 'lucide-svelte/icons/languages';
  import Key from 'lucide-svelte/icons/key-round';
  import Trash from 'lucide-svelte/icons/trash-2';
  import Download from 'lucide-svelte/icons/download';
  import Upload from 'lucide-svelte/icons/upload';
  import Info from 'lucide-svelte/icons/info';
  import Palette from 'lucide-svelte/icons/palette';
  import Globe from 'lucide-svelte/icons/globe';
  import Database from 'lucide-svelte/icons/database';
  import Heart from 'lucide-svelte/icons/heart';
  import Github from 'lucide-svelte/icons/github';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  // ----- i18n -----
  // svelte-i18n 4 ships `$t` as the message-formatter store.  In a
  // <script lang="ts"> block we can call it as a function via `$t(...)`
  // thanks to Svelte's store auto-subscription.
  import { t } from 'svelte-i18n';
  // Make sure translations are loaded before first paint to avoid
  // flickering fallback strings.
  onMount(() => {
    void waitLocale();
  });

  // ----- Theme -----
  type ThemeChoice = 'light' | 'dark' | 'auto';
  // $themeStore auto-subscribes via Svelte's `$` prefix on stores.
  let currentTheme: ThemeChoice = $state('auto');

  // Hydrate from Dexie once stores are ready (the store factory also
  // hydrates asynchronously; we wait for it).
  onMount(() => {
    // Prefer localStorage 'fat-theme' if set (Phase 13 contract) so
    // the choice survives a Dexie wipe via Definições → Limpar dados.
    try {
      const ls = localStorage.getItem('fat-theme') as ThemeChoice | null;
      if (ls === 'light' || ls === 'dark' || ls === 'auto') {
        currentTheme = ls;
        themeStore.set(ls);
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR).
    }
    const unsub = themeStore.subscribe((v) => {
      currentTheme = (v ?? 'auto') as ThemeChoice;
    });
    return unsub;
  });

  /**
   * Apply the chosen theme to documentElement. Uses BOTH the legacy
   * `theme-light` / `theme-dark` classes (already styled) AND the
   * `data-theme` attribute (CSS-variable override hook). For `auto`
   * we follow the OS preference.
   */
  function applyTheme(t: ThemeChoice): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.removeAttribute('data-theme');
    if (t === 'light') {
      root.classList.add('theme-light');
      root.setAttribute('data-theme', 'light');
    } else if (t === 'dark') {
      root.classList.add('theme-dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      // auto: respect OS preference.
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const resolved: 'light' | 'dark' = mql.matches ? 'dark' : 'light';
      root.classList.add(resolved === 'dark' ? 'theme-dark' : 'theme-light');
      root.setAttribute('data-theme', resolved);
    }
  }

  function pickTheme(t: ThemeChoice): void {
    currentTheme = t;
    themeStore.set(t);
    try {
      localStorage.setItem('fat-theme', t);
    } catch {
      // Ignore — localStorage unavailable.
    }
    applyTheme(t);
  }

  // Apply on mount (in case settings already exist in Dexie).
  onMount(() => {
    applyTheme(currentTheme);
  });

  // ----- Language -----
  // `lang` covers all 5 UI locales.  The store in stores.ts is typed with
  // the same union; we keep this state variable loose and cast on hydrate.
  let currentLang: Locale = $state('pt-PT');
  onMount(() => {
    const unsub = langStore.subscribe((v) => {
      if (typeof v === 'string' && (LOCALES as string[]).includes(v)) {
        currentLang = v as Locale;
      }
    });
    return unsub;
  });

  async function pickLang(loc: Locale): Promise<void> {
    currentLang = loc;
    setLocale(loc);          // updates svelte-i18n + persists localStorage
    langStore.set(loc);      // mirrors into Dexie `settings.lang`
    await tick();
    await waitLocale();      // ensure dictionary swap is settled
  }

  // ----- Fun mode (just a checkbox, persists via existing store) -----
  let funMode: boolean = $state(true);
  onMount(() => {
    const unsub = funModeStore.subscribe((v) => {
      funMode = Boolean(v);
    });
    return unsub;
  });

  // ----- Reset password (MVP stub) -----
  let resetSoon = $state(false);
  function resetPassword(): void {
    resetSoon = true;
    setTimeout(() => (resetSoon = false), 4000);
  }

  // ----- Clear local data -----
  let confirmOpen = $state(false);
  let clearing = $state(false);

  async function clearAllData(): Promise<void> {
    clearing = true;
    try {
      const d = db();
      await Promise.all([
        d.transacoes.clear(),
        d.orcamentos.clear(),
        d.categorias.clear(),
        d.habitos.clear(),
        d.habit_logs.clear(),
        d.biblioteca.clear(),
        d.badges.clear(),
        d.visited.clear(),
        d.quizScores.clear(),
        d.secrets.clear(),
        d.state.clear(),
        d.settings.clear()
      ]);
      // Wipe localStorage too — prefs + theme + session.
      try {
        const ls = window.localStorage;
        const toKeep: string[] = [];
        // Optional: keep an allowlist of keys that are device-scoped,
        // not user-scoped. Currently none — we wipe everything.
        for (let i = ls.length - 1; i >= 0; i--) {
          const key = ls.key(i);
          if (key && !toKeep.includes(key)) ls.removeItem(key);
        }
      } catch {
        // localStorage may be unavailable.
      }
      // Re-seed default settings so the rest of the app keeps working
      // after the reload.
      await d.settings.put({ ...DEFAULT_SETTINGS, updatedAt: Date.now() });
      confirmOpen = false;
      // Hard reload so every store re-hydrates from the empty Dexie.
      if (typeof location !== 'undefined') location.reload();
    } catch (e) {
      console.error('[definicoes] clear data failed', e);
      clearing = false;
    }
  }

  // ----- Export JSON -----
  // Delegates the actual snapshot to $lib/backup so the same logic is
  // reusable from any future 'share backup' / Drive-upload flow.
  let exporting = $state(false);
  async function exportData(): Promise<void> {
    if (exporting) return;
    exporting = true;
    try {
      const payload = await backupExport();
      const blob = payloadToBlob(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[definicoes] export failed', e);
    } finally {
      exporting = false;
    }
  }

  // ----- Import JSON -----
  // Two-step flow: file select parses + validates, then a confirmation
  // modal shows the user what's about to be overwritten.  The actual
  // destructive write only runs when they click 'Substituir'.
  let importing = $state(false);
  let importMessage = $state<{ kind: 'success' | 'error'; text: string } | null>(null);
  let fileInput: HTMLInputElement | null = $state(null);

  // Stash the parsed payload between file-select and modal confirmation.
  // Lives only in memory; reload clears it.
  let pendingPayload: BackupPayload | null = $state(null);
  let pendingFileName: string = $state('');
  let pendingFileDate: string = $state('');

  function triggerImport(): void {
    if (importing) return;
    importMessage = null;
    pendingPayload = null;
    pendingFileName = '';
    pendingFileDate = '';
    fileInput?.click();
  }

  async function onFileSelected(ev: Event): Promise<void> {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    importMessage = null;
    try {
      const text = await file.text();
      // parseBackup throws on invalid JSON or schema violations; we
      // surface the reason in the error hint and abort (no modal).
      const payload = parseBackup(text);
      pendingPayload = payload;
      pendingFileName = file.name;
      pendingFileDate = (payload.exportedAt ?? '').slice(0, 10);
    } catch (e) {
      console.error('[definicoes] import parse failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      importMessage = {
        kind: 'error',
        text: $t('settings.import.error', { values: { msg } })
      };
    } finally {
      // Allow re-selecting the same file.
      if (target) target.value = '';
    }
  }

  function cancelImport(): void {
    if (importing) return;
    pendingPayload = null;
    pendingFileName = '';
    pendingFileDate = '';
  }

  async function confirmImport(): Promise<void> {
    if (!pendingPayload || importing) return;
    importing = true;
    try {
      // Lazy-import so the import-only code path doesn't pull
      // $lib/state/db into the module-init graph of this page.
      const mod = await import('$lib/backup');
      await mod.importData(pendingPayload);
      importMessage = {
        kind: 'success',
        text: $t('settings.import.success')
      };
      pendingPayload = null;
      // Reload so every store re-hydrates from the freshly-imported data.
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      console.error('[definicoes] import failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      importMessage = {
        kind: 'error',
        text: $t('settings.import.error', { values: { msg } })
      };
    } finally {
      importing = false;
    }
  }

  // Misc
  const today = new Date().toISOString().slice(0, 10);
</script>

<svelte:head>
  <title>{$t('settings.title')} · Presuntinho</title>
</svelte:head>

<div class="definicoes">
  <header class="header">
    <h1>{$t('settings.title')}</h1>
  </header>

  <!-- ============ Theme ============ -->
  <section class="card" aria-labelledby="theme-h">
    <div class="card-head">
      <span class="icon-wrap"><Palette size={18} /></span>
      <h2 id="theme-h">{$t('settings.theme')}</h2>
    </div>
    <div class="seg" role="radiogroup" aria-label={$t('settings.theme')}>
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === 'light'}
        class:active={currentTheme === 'light'}
        onclick={() => pickTheme('light')}
      >
        <Sun size={16} aria-hidden="true" />
        {$t('settings.theme.light')}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === 'dark'}
        class:active={currentTheme === 'dark'}
        onclick={() => pickTheme('dark')}
      >
        <Moon size={16} aria-hidden="true" />
        {$t('settings.theme.dark')}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === 'auto'}
        class:active={currentTheme === 'auto'}
        onclick={() => pickTheme('auto')}
      >
        <Monitor size={16} aria-hidden="true" />
        {$t('settings.theme.auto')}
      </button>
    </div>
  </section>

  <!-- ============ Language ============ -->
    <section class="card" aria-labelledby="lang-h">
      <div class="card-head">
        <span class="icon-wrap"><Languages size={18} /></span>
        <h2 id="lang-h">{$t('settings.lang')}</h2>
      </div>
      <div class="seg seg-lang" role="radiogroup" aria-label={$t('settings.lang')}>
        {#each LOCALES as loc (loc)}
          <button
            type="button"
            role="radio"
            aria-checked={currentLang === loc}
            class:active={currentLang === loc}
            onclick={() => pickLang(loc)}
            title={LOCALE_META[loc].native}
          >
            <span class="lang-flag" aria-hidden="true">{LOCALE_META[loc].flag}</span>
            <span class="lang-native">{LOCALE_META[loc].native}</span>
          </button>
        {/each}
      </div>
    </section>

  <!-- ============ Account / Password ============ -->
  <section class="card" aria-labelledby="acct-h">
    <div class="card-head">
      <span class="icon-wrap"><Key size={18} /></span>
      <h2 id="acct-h">{$t('settings.reset_password')}</h2>
    </div>
    <p class="muted">
      {$t('settings.reset_password.soon')}
    </p>
    <button type="button" class="btn" onclick={resetPassword} disabled={resetSoon}>
      <Key size={16} aria-hidden="true" />
      {$t('settings.reset_password')}
    </button>
    {#if resetSoon}
      <p class="hint">⏳ {$t('settings.reset_password.soon')}</p>
    {/if}
  </section>

  <!-- ============ Data ============ -->
  <section class="card" aria-labelledby="data-h">
    <div class="card-head">
      <span class="icon-wrap"><Database size={18} /></span>
      <h2 id="data-h">{$t('settings.data')}</h2>
    </div>

    <div class="data-actions">
      <button type="button" class="btn btn-secondary" onclick={exportData} disabled={exporting}>
        <Download size={16} aria-hidden="true" />
        {exporting ? '…' : $t('settings.export')}
      </button>

      <button type="button" class="btn btn-secondary" onclick={triggerImport} disabled={importing}>
        <Upload size={16} aria-hidden="true" />
        {importing ? '…' : $t('settings.import')}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        onchange={onFileSelected}
        hidden
      />

      <button type="button" class="btn btn-danger" onclick={() => (confirmOpen = true)} disabled={clearing}>
        <Trash size={16} aria-hidden="true" />
        {$t('settings.clear_data')}
      </button>
    </div>

    {#if importMessage}
      <p class="hint" class:err={importMessage.kind === 'error'} class:ok={importMessage.kind === 'success'}>
        {importMessage.text}
      </p>
    {/if}
  </section>

  <!-- ============ About ============ -->
  <section class="card" aria-labelledby="about-h">
    <div class="card-head">
      <span class="icon-wrap"><Info size={18} /></span>
      <h2 id="about-h">{$t('settings.about')}</h2>
    </div>
    <p class="muted">
      <Heart size={14} aria-hidden="true" fill="currentColor" />
      {$t('splash.credit').replace('❤️ ', '')}
    </p>
    <ul class="about-list">
      <li>
        <Globe size={14} aria-hidden="true" />
        {$t('settings.version')} · {today}
      </li>
      <li>
        <a href="/legacy/" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          {$t('settings.about.legacy')}
        </a>
      </li>
      <li>
        <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
          <Github size={14} aria-hidden="true" />
          {$t('settings.about.repo')}
        </a>
      </li>
    </ul>
  </section>
</div>

<!-- ============ Import confirmation modal ============ -->
{#if pendingPayload}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-h"
    tabindex="-1"
  >
    <button
      type="button"
      class="modal-backdrop-btn"
      aria-label="{$t('a11y.aria.fechar', { default: 'Fechar' })}"
      onclick={cancelImport}
      disabled={importing}
    ></button>
    <div class="modal" role="document">
      <h2 id="import-h">{$t('settings.import.confirm_title')}</h2>
      <p class="muted">
        {$t('settings.import.confirm', { values: { file: pendingFileName } })}
      </p>
      {#if pendingFileDate}
        <p class="hint">{$t('settings.import.exported_at', { values: { date: pendingFileDate } })}</p>
      {/if}
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelImport} disabled={importing}>
          {$t('settings.cancel')}
        </button>
        <button type="button" class="btn btn-danger" onclick={confirmImport} disabled={importing}>
          <Upload size={14} aria-hidden="true" />
          {importing ? '…' : $t('settings.import.confirm_button')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ============ Confirm modal ============ -->
{#if confirmOpen}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-h"
    tabindex="-1"
  >
    <button
      type="button"
      class="modal-backdrop-btn"
      aria-label="{$t('a11y.aria.fechar', { default: 'Fechar' })}"
      onclick={() => (confirmOpen = false)}
    ></button>
    <div class="modal" role="document">
      <h2 id="confirm-h">{$t('settings.clear_data')}</h2>
      <p class="muted">{$t('settings.clear.confirm')}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={() => (confirmOpen = false)} disabled={clearing}>
          {$t('settings.cancel')}
        </button>
        <button type="button" class="btn btn-danger" onclick={clearAllData} disabled={clearing}>
          <Trash size={14} aria-hidden="true" />
          {clearing ? '…' : $t('settings.clear.confirm_button')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .definicoes {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    color: #fff;
  }
  .card {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    padding: 1.25rem;
    backdrop-filter: blur(10px);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .card-head h2 {
    margin: 0;
    font-size: 1.05rem;
    color: #fff;
  }
  .icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 0.5rem;
    background: rgba(236, 72, 153, 0.18);
    color: #ec4899;
  }
  .seg {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .seg button {
    flex: 1 1 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.6rem 0.8rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.6rem;
    color: #cbd5e1;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .seg button:hover,
  .seg button:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    outline: none;
  }
  .seg button.active {
      background: rgba(236, 72, 153, 0.18);
      border-color: #ec4899;
      color: #fff;
    }
    /* Language switcher: 5 buttons laid out as a wrapping grid so they
       stay touch-friendly on narrow phones without overflowing. */
    .seg-lang {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.5rem;
    }
    .seg-lang button {
      flex: initial;            /* override .seg button flex: 1 1 auto */
      justify-content: flex-start;
      gap: 0.55rem;
      padding: 0.65rem 0.8rem;
      font-weight: 500;
    }
    .lang-flag {
      font-size: 1.1rem;
      line-height: 1;
    }
    .lang-native {
      font-size: 0.92rem;
      /* Allow the native label to truncate gracefully on tiny viewports. */
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.65rem 1rem;
    background: #ec4899;
    color: #fff;
    border: 0;
    border-radius: 0.6rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
  }
  .btn:hover:not(:disabled) {
    background: #db2777;
    transform: translateY(-1px);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }
  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
  }
  .btn-danger {
    background: #ef4444;
  }
  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }
  .data-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .muted {
    color: #cbd5e1;
    font-size: 0.9rem;
    margin: 0 0 0.75rem 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .hint {
    color: #cbd5e1;
    font-size: 0.85rem;
    margin: 0.75rem 0 0 0;
  }
  .hint.ok { color: #6ee7b7; }
  .hint.err { color: #fca5a5; }
  .about-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    color: #cbd5e1;
    font-size: 0.9rem;
  }
  .about-list li,
  .about-list a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #cbd5e1;
    text-decoration: none;
  }
  .about-list a:hover {
    color: #ec4899;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 50;
    backdrop-filter: blur(4px);
  }
  .modal {
    background: #1f2e4a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1rem;
    padding: 1.5rem;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
  .modal h2 {
    margin: 0 0 0.5rem 0;
    color: #fff;
    font-size: 1.15rem;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  @media (min-width: 640px) {
    .definicoes {
      padding: 2rem 1.5rem 3rem;
    }
    .header h1 {
      font-size: 2rem;
    }
  }
</style>
