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
  import { db, DEFAULT_SETTINGS, type ThemeChoice } from '$lib/state/db';
  import { theme as themeStore, lang as langStore, funMode as funModeStore, xp as xpStore } from '$lib/state/stores';
  import { locale, waitLocale } from 'svelte-i18n';
  import { setLocale, LOCALES, LOCALE_META, type Locale } from '$lib/i18n';
  import {
    // task-051 — extended backup surface.
    exportAllData,
    importBackup,
    getTableCounts,
    parseBackup,
    payloadToBlob,
    suggestedFilename,
    BACKUP_TABLES,
    BackupError,
    type BackupPayload,
    type ImportReport
  } from '$lib/backup';
  import Languages from 'lucide-svelte/icons/languages';
  import Key from 'lucide-svelte/icons/key-round';
  import Trash from 'lucide-svelte/icons/trash-2';
  import Download from 'lucide-svelte/icons/download';
  import Upload from 'lucide-svelte/icons/upload';
  import Info from 'lucide-svelte/icons/info';
  import { VERSION, REPO_URL } from '$lib/version';
  import Palette from 'lucide-svelte/icons/palette';
  import Globe from 'lucide-svelte/icons/globe';
  import Database from 'lucide-svelte/icons/database';
  import Heart from 'lucide-svelte/icons/heart';
  import Github from 'lucide-svelte/icons/github';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  // gap-116: real PBKDF2 reset-password flow imports.
  import { getSession } from '$lib/auth/session';
  import {
      verifyAgainstEffectiveHashes,
      setPassword,
      type ProfileId
  } from '$lib/auth/hash';
  import { showToast } from '$lib/components/events';
  import {
    activateMood,
    acknowledgeMoodIntro,
    clearActiveMood,
    isMoodIntroAcknowledged,
    MOOD_EVENT,
    MOOD_META,
    readActiveMood,
    type MoodKind
  } from '$lib/mood';

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
  const THEME_OPTIONS: Array<{ id: ThemeChoice; icon: string; minXp: number }> = [
    { id: 'auto', icon: '🪄', minXp: 0 },
    { id: 'dark', icon: '🌙', minXp: 0 },
    { id: 'light', icon: '☀️', minXp: 0 },
    { id: 'vanilla', icon: '🍦', minXp: 0 },
    { id: 'garden', icon: '🌿', minXp: 0 },
    { id: 'midnight', icon: '💗', minXp: 0 },
    { id: 'cozy', icon: '🧸', minXp: 0 },
    { id: 'fresh', icon: '🟢', minXp: 0 },
    { id: 'barca', icon: '🔵🔴', minXp: 100 },
    { id: 'gamer', icon: '🎮', minXp: 250 },
    { id: 'anime', icon: '🌸', minXp: 500 },
    { id: 'moto', icon: '🏍️', minXp: 750 },
    { id: 'tunisia', icon: '🇹🇳', minXp: 1000 }
  ];

  const THEME_CLASSES = THEME_OPTIONS.map((option) => `theme-${option.id}`);
  // $themeStore auto-subscribes via Svelte's `$` prefix on stores.
  let currentTheme: ThemeChoice = $state('auto');
  let currentXp = $state(0);

  // Hydrate from Dexie once stores are ready (the store factory also
  // hydrates asynchronously; we wait for it).
  onMount(() => {
    // Prefer localStorage 'fat-theme' if set (Phase 13 contract) so
    // the choice survives a Dexie wipe via Definições → Limpar dados.
    try {
      const ls = localStorage.getItem('fat-theme') as ThemeChoice | null;
      const matched = THEME_OPTIONS.find((option) => option.id === ls);
      if (matched) {
        currentTheme = matched.id;
        themeStore.set(matched.id);
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR).
    }
    const unsub = themeStore.subscribe((v) => {
      currentTheme = (v ?? 'auto') as ThemeChoice;
    });
    return unsub;
  });

  onMount(() => xpStore.subscribe((v) => (currentXp = v)));

  /**
   * Apply the chosen theme to documentElement. Uses BOTH the legacy
   * `theme-light` / `theme-dark` classes (already styled) AND the
   * `data-theme` attribute (CSS-variable override hook). For `auto`
   * we follow the OS preference.
   */
  function applyTheme(t: ThemeChoice): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove(...THEME_CLASSES);
    root.removeAttribute('data-theme');
    if (t === 'light') {
      root.classList.add('theme-light');
      root.setAttribute('data-theme', 'light');
    } else if (t === 'dark') {
      root.classList.add('theme-dark');
      root.setAttribute('data-theme', 'dark');
    } else if (t !== 'auto') {
      root.classList.add(`theme-${t}`);
      root.setAttribute('data-theme', t);
    } else {
      // auto: respect OS preference.
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const resolved: 'light' | 'dark' = mql.matches ? 'dark' : 'light';
      root.classList.add(resolved === 'dark' ? 'theme-dark' : 'theme-light');
      root.setAttribute('data-theme', resolved);
    }
  }

  function pickTheme(t: ThemeChoice): void {
    if (!isThemeUnlocked(t)) return;
    currentTheme = t;
    themeStore.set(t);
    try {
      localStorage.setItem('fat-theme', t);
    } catch {
      // Ignore — localStorage unavailable.
    }
    applyTheme(t);
  }

  function isThemeUnlocked(t: ThemeChoice): boolean {
    const option = THEME_OPTIONS.find((item) => item.id === t);
    return !option || currentXp >= option.minXp;
  }

  // Apply on mount (in case settings already exist in Dexie).
  onMount(() => {
    applyTheme(currentTheme);
  });

  // ----- Mood / Vibe -----
  const MOOD_OPTIONS: Array<{ id: 'normal' | MoodKind; emoji: string; accent: string }> = [
    { id: 'normal', emoji: '✨', accent: '#ec4899' },
    { id: 'love', emoji: MOOD_META.love.emoji, accent: MOOD_META.love.accent },
    { id: 'sad', emoji: MOOD_META.sad.emoji, accent: MOOD_META.sad.accent },
    { id: 'sick', emoji: MOOD_META.sick.emoji, accent: MOOD_META.sick.accent }
  ];
  let currentMood: 'normal' | MoodKind = $state('normal');
  let moodBusy = $state(false);

  async function refreshMoodChoice(): Promise<void> {
    const mood = await readActiveMood();
    currentMood = mood && isMoodIntroAcknowledged(mood) ? mood.kind : 'normal';
  }

  onMount(() => {
    void refreshMoodChoice();
    const onMoodChanged = () => void refreshMoodChoice();
    window.addEventListener(MOOD_EVENT, onMoodChanged);
    return () => window.removeEventListener(MOOD_EVENT, onMoodChanged);
  });

  async function pickMoodChoice(kind: 'normal' | MoodKind): Promise<void> {
    if (moodBusy || currentMood === kind) return;
    moodBusy = true;
    try {
      if (kind === 'normal') {
        await clearActiveMood();
        currentMood = 'normal';
        showToast($t('settings.mood.toast.normal'));
        return;
      }
      const mood = await activateMood(kind, 'manual');
      if (mood) acknowledgeMoodIntro(mood);
      currentMood = kind;
      showToast($t('settings.mood.toast.changed', { values: { mood: $t(`settings.mood.${kind}`) } }));
    } finally {
      moodBusy = false;
    }
  }

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

  // ----- Reset password (gap-116: real PBKDF2 flow) -----
  //
  // The Settings page used to render a button that flipped a `resetSoon`
  // flag and showed a "⏳ soon" hint.  Now it opens a modal with three
  // fields, verifies the current password against the /auth/hashes.json
  // PBKDF2 hashes (plus any localStorage override from a prior change),
  // and persists a freshly-derived PBKDF2 hash via `setPassword` from
  // `$lib/auth/hash`.
  //
  // Persistence note: the static hashes.json is deployed via Netlify
  // and can't be mutated from the browser, so the new hash lands in
  // `presuntinho-hashes-override` (see `loadEffectiveHashes` /
  // `verifyAgainstEffectiveHashes` in `src/lib/auth/hash.ts`).
  let resetOpen = $state(false);
  let currentPw = $state('');
  let newPw = $state('');
  let confirmPw = $state('');
  let resetBusy = $state(false);
  let lastFocusedBeforeReset: HTMLElement | null = null;

  // Active profile for the password change.  `getSession()` is
  // authoritative for "who is logged in right now"; we re-read on open
  // so the modal picks up a fresh login (e.g. switch from fatma →
  // daniel in another tab).
  let activeProfileId = $state<ProfileId | null>(null);

  function openResetModal(): void {
    if (resetOpen) return;
    const session = getSession();
    activeProfileId = session?.profile ?? null;
    if (!activeProfileId) {
      // No active session — tell the user to log in first instead of
      // silently succeeding against an unknown profile.
      showToast($t('settings.reset_password.error.wrong_current'));
      return;
    }
    lastFocusedBeforeReset = (document.activeElement as HTMLElement | null) ?? null;
    resetOpen = true;
    currentPw = '';
    newPw = '';
    confirmPw = '';
    resetBusy = false;
  }

  function closeResetModal(): void {
    if (resetBusy) return;
    resetOpen = false;
    currentPw = '';
    newPw = '';
    confirmPw = '';
    // Restore focus to the element that opened the modal — best
    // practice for keyboard / screen-reader users.
    if (lastFocusedBeforeReset && typeof lastFocusedBeforeReset.focus === 'function') {
      try {
        lastFocusedBeforeReset.focus();
      } catch {
        // element may have been removed
      }
    }
  }

  async function submitReset(): Promise<void> {
    if (resetBusy) return;
    const profile = activeProfileId ?? getSession()?.profile ?? null;
    if (!profile) {
      showToast($t('settings.reset_password.error.wrong_current'));
      return;
    }
    const cur = currentPw.trim();
    const nxt = newPw; // do NOT trim the new password; whitespace might be intentional
    const cf = confirmPw;
    if (!cur) {
      showToast($t('settings.reset_password.error.wrong_current'));
      return;
    }
    if (nxt.length === 0) {
      // Treat empty new password as a mismatch so the user gets a
      // meaningful toast instead of a silent no-op.
      showToast($t('settings.reset_password.error.mismatch'));
      return;
    }
    if (nxt !== cf) {
      showToast($t('settings.reset_password.error.mismatch'));
      return;
    }
    resetBusy = true;
    try {
      const verified = await verifyAgainstEffectiveHashes(cur);
      if (!verified || verified.profile !== profile) {
        showToast($t('settings.reset_password.error.wrong_current'));
        resetBusy = false;
        return;
      }
      await setPassword(profile, nxt);
      showToast($t('settings.reset_password.success'));
      // Close modal + clear inputs on success.
      resetOpen = false;
      currentPw = '';
      newPw = '';
      confirmPw = '';
    } catch (e) {
      console.error('[definicoes] reset password failed', e);
      showToast($t('settings.reset_password.error.wrong_current'));
    } finally {
      resetBusy = false;
    }
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
  // Delegates the actual snapshot + download to $lib/backup so the
  // same logic is reusable from any future 'share backup' / Drive-upload
  // flow.  task-051 uses the new `downloadBackup()` helper which is a
  // one-shot version of exportAllData() + anchor-click.
  let exporting = $state(false);
  let exportHint = $state<string | null>(null);
  let tableCounts = $state<Record<string, number>>({});
  let countsLoaded = $state(false);
  const TABLE_LABEL_KEY: Record<string, string> = {
    state: 'settings.backup.tables.state',
    settings: 'settings.backup.tables.settings',
    badges: 'settings.backup.tables.badges',
    visited: 'settings.backup.tables.visited',
    quizScores: 'settings.backup.tables.quizScores',
    secrets: 'settings.backup.tables.secrets',
    transacoes: 'settings.backup.tables.transacoes',
    orcamentos: 'settings.backup.tables.orcamentos',
    categorias: 'settings.backup.tables.categorias',
    habitos: 'settings.backup.tables.habitos',
    habit_logs: 'settings.backup.tables.habit_logs',
    biblioteca: 'settings.backup.tables.biblioteca',
    notes: 'settings.backup.tables.notes',
    chat_messages: 'settings.backup.tables.chat_messages',
    assignments: 'settings.backup.tables.assignments'
  };

  async function refreshCounts(): Promise<void> {
    tableCounts = await getTableCounts();
    countsLoaded = true;
  }

  // task-051: pre-compute the per-table label strings once per locale
  // change so the {#each} block below can render them without forcing
  // svelte-i18n to re-subscribe per row (the compiler refuses `$t(...)`
  // inside an `each` when the key depends on the loop variable, AND
  // inside `$derived.by` lambdas).
  const translate = $derived($t);
  const TABLE_LABELS: { name: string; count: number }[] = $derived(
    BACKUP_TABLES.map((table) => ({
      name: translate(TABLE_LABEL_KEY[table] ?? table),
      count: tableCounts[table] ?? 0
    }))
  );

  // Populate the table-preview list once on first paint so the user
  // sees "what's about to come out" before clicking Export.
  onMount(() => {
    void refreshCounts();
  });

  async function doExport(): Promise<void> {
    if (exporting) return;
    exporting = true;
    exportHint = null;
    try {
      const payload = await exportAllData();
      // Browser-only filename/anchor click here so the function reads
      // just as cleanly from a future Service-Worker context.
      if (typeof document !== 'undefined') {
        const blob = payloadToBlob(payload);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedFilename();
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      // Refresh counts so the next visit reflects any writes done since.
      await refreshCounts();
      exportHint = $t('settings.backup.export.done');
    } catch (e) {
      console.error('[definicoes] export failed', e);
      exportHint = errorMessage(e, 'settings.backup.error.export_failed');
    } finally {
      exporting = false;
    }
  }

  // Translate a BackupError.code into the matching `settings.backup.errors.*` key.
  function errorMessage(e: unknown, fallbackKey: string): string {
    if (e instanceof BackupError) {
      const key = `settings.backup.errors.${e.code}`;
      const localised = $t(key, { default: key });
      // svelte-i18n returns the key itself when missing — fall back to the
      // English-ish message baked into the error, then to the caller's fallback.
      if (localised !== key) return localised;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return $t(fallbackKey, { values: { msg } });
  }

  // ----- Import JSON -----
  // task-051: file-based flow with a merge/replace selector and a
  // per-table preview of what the payload contains.  Two-step flow:
  //   1. file select → parse + validate + show modal with payload meta
  //   2. confirm → importBackup(file, mode) → ImportReport → reload
  let importing = $state(false);
  let importMode = $state<'merge' | 'replace'>('replace');
  let importMessage = $state<{ kind: 'success' | 'error'; text: string } | null>(null);
  let pendingReport = $state<ImportReport | null>(null);
  let fileInput: HTMLInputElement | null = $state(null);

  // Stash the parsed payload between file-select and modal confirmation.
  // Lives only in memory; reload clears it.
  let pendingPayload: BackupPayload | null = $state(null);
  let pendingFile: File | null = $state(null);
  let pendingFileName: string = $state('');
  let pendingFileDate: string = $state('');

  function setImportMode(mode: 'merge' | 'replace'): void {
    importMode = mode;
  }

  function triggerImport(): void {
    if (importing) return;
    importMessage = null;
    pendingReport = null;
    pendingPayload = null;
    pendingFile = null;
    pendingFileName = '';
    pendingFileDate = '';
    fileInput?.click();
  }

  async function onFileSelected(ev: Event): Promise<void> {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    importMessage = null;
    pendingReport = null;
    try {
      // Read once so we can both validate and run importBackup() — the
      // latter re-parses internally but a parse failure here gives us
      // a nicer message in the modal than a late one.
      const text = await file.text();
      const payload = parseBackup(text);
      pendingPayload = payload;
      pendingFile = file;
      pendingFileName = file.name;
      pendingFileDate = (payload.exportedAt ?? '').slice(0, 10);
    } catch (e) {
      console.error('[definicoes] import parse failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      importMessage = {
        kind: 'error',
        text: errorMessage(e, 'settings.import.error')
      };
    } finally {
      if (target) target.value = '';
    }
  }

  function cancelImport(): void {
    if (importing) return;
    pendingPayload = null;
    pendingFile = null;
    pendingFileName = '';
    pendingFileDate = '';
    pendingReport = null;
  }

  async function confirmImport(): Promise<void> {
    if (!pendingFile || importing) return;
    importing = true;
    try {
      const report = await importBackup(pendingFile, importMode);
      pendingReport = report;
      pendingPayload = null;
      // Build a short summary the user can scan before the reload.
      // Cache the i18n strings up here so Svelte's "stores must be
      // subscribed at the top level" rule doesn't trip on $t(...)
      // inside a nested expression.
      const totals = report.totals;
      const modeLabel = $t(`settings.backup.import_mode.${report.mode}`);
      importMessage = {
        kind: 'success',
        text: $t('settings.backup.import.report', {
          values: {
            inserted: totals.inserted,
            replaced: totals.replaced,
            skipped: totals.skipped,
            mode: modeLabel
          }
        })
      };
      // Reload so every store re-hydrates from the freshly-imported data.
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      console.error('[definicoes] import failed', e);
      importMessage = {
        kind: 'error',
        text: errorMessage(e, 'settings.import.error')
      };
    } finally {
      importing = false;
    }
  }

  // Misc — gap-115: read version from a single source of truth
  // (src/lib/version.ts) so the About card never shows a misleading date.
  void REPO_URL;
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
    <p class="theme-intro">{$t('settings.theme.intro', { default: 'Escolhe um visual para a app. Alguns temas desbloqueiam com XP.' })}</p>
    <div class="theme-grid" role="radiogroup" aria-label={$t('settings.theme')}>
      {#each THEME_OPTIONS as option (option.id)}
        {@const unlocked = isThemeUnlocked(option.id)}
        <button
          type="button"
          role="radio"
          aria-checked={currentTheme === option.id}
          aria-disabled={!unlocked}
          class:active={currentTheme === option.id}
          class:locked={!unlocked}
          onclick={() => pickTheme(option.id)}
        >
          <span class="theme-swatch theme-swatch-{option.id}" aria-hidden="true">{option.icon}</span>
          <span class="theme-copy">
            <strong>{$t(`settings.theme.${option.id}`, { default: option.id })}</strong>
            <small>
              {#if unlocked}
                {$t(`settings.theme.${option.id}.desc`, { default: 'Disponível' })}
              {:else}
                {$t('settings.theme.locked', { values: { xp: option.minXp }, default: 'Bloqueado até {xp} XP' })}
              {/if}
            </small>
          </span>
        </button>
      {/each}
    </div>
  </section>

  <!-- ============ Mood / Vibe ============ -->
  <section class="card" aria-labelledby="mood-h">
    <div class="card-head">
      <span class="icon-wrap"><Heart size={18} /></span>
      <h2 id="mood-h">{$t('settings.mood')}</h2>
    </div>
    <p class="theme-intro">{$t('settings.mood.intro')}</p>
    <div class="mood-grid" role="radiogroup" aria-label={$t('settings.mood')}>
      {#each MOOD_OPTIONS as option (option.id)}
        <button
          type="button"
          role="radio"
          aria-checked={currentMood === option.id}
          class:active={currentMood === option.id}
          disabled={moodBusy}
          style={`--mood-option-accent: ${option.accent}`}
          onclick={() => pickMoodChoice(option.id)}
        >
          <span class="mood-swatch" aria-hidden="true">{option.emoji}</span>
          <span class="theme-copy">
            <strong>{$t(`settings.mood.${option.id}`)}</strong>
            <small>{$t(`settings.mood.${option.id}.desc`)}</small>
          </span>
        </button>
      {/each}
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
    <button
      type="button"
      class="btn"
      onclick={openResetModal}
      aria-haspopup="dialog"
      aria-controls="reset-pw-modal"
    >
      <Key size={16} aria-hidden="true" />
      {$t('settings.reset_password.button')}
    </button>
  </section>

  <!-- ============ Data ============ -->
  <section class="card" aria-labelledby="data-h">
    <div class="card-head">
      <span class="icon-wrap"><Database size={18} /></span>
      <h2 id="data-h">{$t('settings.data')}</h2>
    </div>

    <div class="data-actions">
      <button type="button" class="btn btn-secondary" onclick={doExport} disabled={exporting}>
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

    {#if countsLoaded}
      <details class="backup-preview">
        <summary>{$t('settings.backup.tables_label')}</summary>
        <ul class="backup-table-list">
          {#each TABLE_LABELS as row, i (i)}
            <li>
              <span class="t-name">{row.name}</span>
              <span class="t-count" class:zero={row.count === 0}>{row.count}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    {#if exportHint}
      <p class="hint" class:ok={!importMessage || importMessage.kind !== 'error'}>{exportHint}</p>
    {/if}
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
        {$t('settings.version')} · {VERSION}
      </li>
      <li>
        <a href="/legacy/" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          {$t('settings.about.legacy')}
        </a>
      </li>
      <li>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
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

      <fieldset class="mode-select" disabled={importing}>
        <legend>{$t('settings.backup.import_mode_label')}</legend>
        <label class="mode-opt">
          <input
            type="radio"
            name="import-mode"
            value="merge"
            checked={importMode === 'merge'}
            onchange={() => setImportMode('merge')}
            disabled={importing}
          />
          <span>{$t('settings.backup.import_mode.merge')}</span>
          <small class="muted">{$t('settings.backup.import_mode.merge_help')}</small>
        </label>
        <label class="mode-opt">
          <input
            type="radio"
            name="import-mode"
            value="replace"
            checked={importMode === 'replace'}
            onchange={() => setImportMode('replace')}
            disabled={importing}
          />
          <span>{$t('settings.backup.import_mode.replace')}</span>
          <small class="muted">{$t('settings.backup.import_mode.replace_help')}</small>
        </label>
      </fieldset>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelImport} disabled={importing}>
          {$t('settings.cancel')}
        </button>
        <button type="button" class="btn btn-danger" onclick={confirmImport} disabled={importing}>
          <Upload size={14} aria-hidden="true" />
          {importing ? '…' : $t(`settings.backup.import_mode.${importMode}_button`)}
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

<!-- ============ Reset password modal (gap-116) ============ -->
{#if resetOpen}
  <div
    id="reset-pw-modal"
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="reset-pw-h"
    tabindex="-1"
  >
    <button
      type="button"
      class="modal-backdrop-btn"
      aria-label="{$t('a11y.aria.fechar', { default: 'Fechar' })}"
      onclick={closeResetModal}
      disabled={resetBusy}
    ></button>
    <div
      class="modal modal-reset"
      role="document"
        >
      <button
        type="button"
        class="modal-close"
        aria-label="{$t('a11y.aria.fechar', { default: 'Fechar' })}"
        onclick={closeResetModal}
        disabled={resetBusy}
      >×</button>

      <h2 id="reset-pw-h">{$t('settings.reset_password.button')}</h2>

      <form
        class="reset-form"
        onsubmit={(e) => { e.preventDefault(); void submitReset(); }}
      >
        <label class="field">
          <span class="field-label">{$t('settings.reset_password.current')}</span>
          <input
            type="password"
            autocomplete="current-password"
            bind:value={currentPw}
            disabled={resetBusy}
            required
          />
        </label>
        <label class="field">
          <span class="field-label">{$t('settings.reset_password.new')}</span>
          <input
            type="password"
            autocomplete="new-password"
            bind:value={newPw}
            disabled={resetBusy}
            required
            minlength="1"
          />
        </label>
        <label class="field">
          <span class="field-label">{$t('settings.reset_password.confirm')}</span>
          <input
            type="password"
            autocomplete="new-password"
            bind:value={confirmPw}
            disabled={resetBusy}
            required
            minlength="1"
          />
        </label>

        <div class="modal-actions">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={closeResetModal}
            disabled={resetBusy}
          >{$t('settings.reset_password.cancel')}</button>
          <button
            type="submit"
            class="btn"
            disabled={resetBusy}
          >{resetBusy ? '…' : $t('settings.reset_password.submit')}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<svelte:window
  onkeydown={(e) => {
    if (resetOpen && e.key === 'Escape') {
      e.preventDefault();
      closeResetModal();
    }
  }}
/>

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
    .theme-intro {
      margin: 0 0 0.75rem;
      color: var(--txt2);
      font-size: 0.9rem;
    }
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
      gap: 0.65rem;
    }
    .theme-grid button {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 0.7rem;
      min-height: 74px;
      padding: 0.7rem;
      text-align: left;
      background: rgba(255, 255, 255, 0.045);
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 0.8rem;
      color: #fff;
      cursor: pointer;
      transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
    }
    .theme-grid button:hover,
    .theme-grid button:focus-visible {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }
    .theme-grid button.active {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 22%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
    }
    .theme-grid button.locked {
      opacity: 0.58;
      cursor: not-allowed;
      filter: grayscale(0.35);
    }
    .theme-grid button.locked:hover {
      transform: none;
    }
    .theme-swatch {
      width: 2.55rem;
      height: 2.55rem;
      border-radius: 0.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      font-size: 1.1rem;
    }
    .theme-swatch-light { background: linear-gradient(135deg, #fff, #dbeafe); color: #0f172a; }
    .theme-swatch-dark { background: linear-gradient(135deg, #1f2e4a, #ec4899); }
    .theme-swatch-auto { background: linear-gradient(135deg, #fff 0 48%, #1f2e4a 52% 100%); }
    .theme-swatch-barca { background: linear-gradient(135deg, #004d98 0 50%, #a50044 50% 100%); }
    .theme-swatch-gamer { background: linear-gradient(135deg, #050816, #22c55e); }
    .theme-swatch-anime { background: linear-gradient(135deg, #f472b6, #c084fc); }
    .theme-swatch-moto { background: linear-gradient(135deg, #111827, #ef4444); }
    .theme-swatch-tunisia { background: linear-gradient(135deg, #fff, #e70013); }
    .theme-swatch-vanilla { background: linear-gradient(135deg, #fff7ed, #f9a8d4); color: #7c2d12; }
    .theme-swatch-garden { background: linear-gradient(135deg, #ecfdf5, #16a34a); color: #064e3b; }
    .theme-swatch-midnight { background: linear-gradient(135deg, #12091f, #db2777); }
    .theme-swatch-cozy { background: linear-gradient(135deg, #eff6ff, #fdba74); color: #1e3a8a; }
    .theme-swatch-fresh { background: linear-gradient(135deg, #58cc02, #1cb0f6); color: #052e16; }
    .theme-copy { min-width: 0; display: grid; gap: 0.15rem; }
    .theme-copy strong { color: inherit; font-size: 0.92rem; }
    .theme-copy small { color: #cbd5e1; font-size: 0.74rem; line-height: 1.25; }
    .mood-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 0.65rem;
    }
    .mood-grid button {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 0.68rem;
      min-height: 76px;
      padding: 0.72rem;
      text-align: left;
      background: linear-gradient(135deg, color-mix(in srgb, var(--mood-option-accent) 12%, rgba(255,255,255,.045)), rgba(255,255,255,.035));
      border: 1px solid color-mix(in srgb, var(--mood-option-accent) 24%, rgba(255,255,255,.12));
      border-radius: 0.9rem;
      color: #fff;
      cursor: pointer;
      transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease, opacity 0.12s ease;
    }
    .mood-grid button:hover:not(:disabled),
    .mood-grid button:focus-visible {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--mood-option-accent) 60%, white);
      outline: none;
    }
    .mood-grid button.active {
      background: linear-gradient(135deg, color-mix(in srgb, var(--mood-option-accent) 28%, rgba(255,255,255,.08)), rgba(255,255,255,.06));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--mood-option-accent) 50%, transparent), 0 14px 34px color-mix(in srgb, var(--mood-option-accent) 18%, transparent);
    }
    .mood-grid button:disabled { opacity: .72; cursor: wait; }
    .mood-swatch {
      width: 2.6rem;
      height: 2.6rem;
      display: inline-grid;
      place-items: center;
      border-radius: .9rem;
      background: color-mix(in srgb, var(--mood-option-accent) 22%, white);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.32);
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

  /* Transparent button that sits over the entire backdrop so users can
     click anywhere outside the dialog to close it.  We keep it
     accessible by giving it an aria-label (rendered via the existing
     a11y.aria.fechar key) and visually hiding it. */
  .modal-backdrop-btn {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    border: 0;
    cursor: pointer;
    z-index: 0;
  }
  .modal-backdrop > .modal {
    position: relative;
    z-index: 1;
  }

  /* Position the close (X) button in the top-right of the dialog.
     Used by the reset-password modal so users have a visible close
     affordance beyond Escape / click-outside. */
  .modal-close {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
    background: transparent;
    border: 0;
    color: #cbd5e1;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.4rem 0.65rem;
    min-width: 44px;
    min-height: 44px;
    border-radius: 0.375rem;
  }
  .modal-close:hover:not(:disabled),
  .modal-close:focus-visible {
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }
  .modal-close:focus-visible {
    box-shadow: 0 0 0 2px #ec4899;
  }
  .modal-close:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Reset-password modal: stacked password fields above the
     action row.  Matches the dark glass theme used elsewhere. */
  .modal-reset {
    max-width: 460px;
  }
  .reset-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field-label {
    color: #cbd5e1;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .field input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #fff;
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    font-size: 1rem;
    min-height: 44px;
    width: 100%;
    transition: border-color 0.15s, background 0.15s;
  }
  .field input:focus-visible {
    outline: none;
    border-color: #ec4899;
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.35);
  }
  .field input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .reset-form .modal-actions {
    margin-top: 0.25rem;
  }
  /* task-051: per-table preview list of what the export will include */
  .backup-preview {
    margin-top: 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.6rem;
    padding: 0.5rem 0.75rem;
  }
  .backup-preview summary {
    cursor: pointer;
    color: #cbd5e1;
    font-size: 0.9rem;
    list-style: none;
  }
  .backup-preview summary::-webkit-details-marker {
    display: none;
  }
  .backup-preview summary::before {
    content: '▶';
    display: inline-block;
    margin-right: 0.5rem;
    color: #94a3b8;
    transition: transform 0.15s;
  }
  .backup-preview[open] summary::before {
    transform: rotate(90deg);
  }
  .backup-table-list {
    list-style: none;
    padding: 0.5rem 0 0 0;
    margin: 0.5rem 0 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.25rem 0.75rem;
  }
  .backup-table-list li {
    display: flex;
    justify-content: space-between;
    color: #cbd5e1;
    font-size: 0.85rem;
    padding: 0.15rem 0;
  }
  .backup-table-list .t-name {
    color: #e2e8f0;
  }
  .backup-table-list .t-count {
    font-variant-numeric: tabular-nums;
    color: #94a3b8;
  }
  .backup-table-list .t-count.zero {
    color: #475569;
  }
  /* task-051: merge/replace selector in the import modal */
  .mode-select {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.6rem;
    padding: 0.6rem 0.8rem 0.75rem;
    margin: 0.75rem 0 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .mode-select legend {
    color: #cbd5e1;
    font-size: 0.85rem;
    padding: 0 0.25rem;
  }
  .mode-opt {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 0.5rem;
    align-items: center;
    cursor: pointer;
  }
  .mode-opt input[type='radio'] {
    grid-column: 1;
    grid-row: 1 / span 2;
    accent-color: #ec4899;
  }
  .mode-opt span {
    color: #fff;
    font-size: 0.92rem;
  }
  .mode-opt small {
    grid-column: 2;
    grid-row: 2;
    color: #94a3b8;
    font-size: 0.78rem;
    line-height: 1.3;
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
