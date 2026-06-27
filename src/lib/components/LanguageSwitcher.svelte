<!--
  LanguageSwitcher — compact dropdown for the app header.

  Phase 9 / V4.1: shows the active locale as a flag + ISO code on the
  trigger button, expands a list of all supported locales on click.  Uses
  the same `$lib/i18n` exports as the full radio group on /definicoes,
  so picking a language here does exactly the same thing (update
  svelte-i18n + persist to localStorage + apply <html lang/dir>).

  Variants:
    `variant="compact"` (default) — flag + code only, ~44px button.
    `variant="full"`               — flag + native label, larger button.

  The trigger is a real <button>; the panel is a <ul role="menu"> so
  keyboard users get the standard menu-item semantics.  Clicking outside
  or pressing Escape closes the panel.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, waitLocale } from 'svelte-i18n';
  import {
    LOCALES,
    LOCALE_META,
    setLocale,
    type Locale
  } from '$lib/i18n';
  import { tick } from 'svelte';

  type Variant = 'compact' | 'full';

  interface Props {
    /** Visual variant. `compact` fits the header strip; `full` is for cards. */
    variant?: Variant;
    /** Optional extra class added to the root element. */
    class?: string;
  }

  let { variant = 'compact', class: extraClass = '' }: Props = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | null = $state(null);
  let currentLocale: Locale = $state('pt-PT');

  // Sync from svelte-i18n's reactive store.  The store is auto-subscribed
  // by Svelte when we read `$locale` — we mirror it into a local rune so
  // the markup stays trivial.
  onMount(() => {
    const unsub = locale.subscribe((v) => {
      if (v && (LOCALES as string[]).includes(v)) {
        currentLocale = v as Locale;
      }
    });
    return unsub;
  });

  async function pick(loc: Locale): Promise<void> {
    open = false;
    setLocale(loc);          // svelte-i18n + localStorage + <html lang/dir>
    await tick();
    await waitLocale();      // settle dictionary swap before re-render
  }

  function onTriggerClick(): void {
    open = !open;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      open = false;
      // Return focus to trigger.
      const trigger = rootEl?.querySelector<HTMLButtonElement>('.ls-trigger');
      trigger?.focus();
    }
  }

  function onDocClick(e: MouseEvent): void {
    if (!open || !rootEl) return;
    const target = e.target as Node | null;
    if (target && !rootEl.contains(target)) {
      open = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  });

  const meta = $derived(LOCALE_META[currentLocale]);
</script>

<div
  class="ls ls--{variant} {extraClass}"
  bind:this={rootEl}
>
  <button
    type="button"
    class="ls-trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Change language — current: {meta.native}"
    title={meta.native}
    onclick={onTriggerClick}
  >
    <span class="ls-flag" aria-hidden="true">{meta.flag}</span>
    {#if variant === 'full'}
      <span class="ls-label">{meta.native}</span>
    {:else}
      <span class="ls-code">{currentLocale}</span>
    {/if}
    <svg
      class="ls-caret"
      class:open
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  {#if open}
    <ul class="ls-menu" role="menu" aria-label="Choose language">
      {#each LOCALES as loc (loc)}
        {@const m = LOCALE_META[loc]}
        <li role="none">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={currentLocale === loc}
            class:active={currentLocale === loc}
            onclick={() => pick(loc)}
          >
            <span class="ls-flag" aria-hidden="true">{m.flag}</span>
            <span class="ls-native">{m.native}</span>
            <span class="ls-code-inline" aria-hidden="true">{loc}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .ls {
    position: relative;
    display: inline-block;
  }
  .ls-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;          /* WCAG touch target */
    padding: 0 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: #fff;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .ls-trigger:hover,
  .ls-trigger:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
    outline: none;
  }
  .ls-trigger:focus-visible {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  .ls-flag {
    font-size: 1.05rem;
    line-height: 1;
  }
  .ls-code {
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  .ls-label {
    font-size: 0.9rem;
  }
  .ls-caret {
    transition: transform 0.15s ease;
    opacity: 0.7;
  }
  .ls-caret.open {
    transform: rotate(180deg);
  }

  .ls-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 100;
    list-style: none;
    margin: 0;
    padding: 0.35rem;
    min-width: 200px;
    background: rgba(20, 28, 48, 0.97);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }
  .ls-menu li {
    margin: 0;
    padding: 0;
  }
  .ls-menu button {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 40px;
    padding: 0.45rem 0.6rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: rgba(255, 255, 255, 0.88);
    font: inherit;
    font-size: 0.9rem;
    text-align: start;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .ls-menu button:hover,
  .ls-menu button:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    outline: none;
  }
  .ls-menu button.active {
    background: rgba(236, 72, 153, 0.22);
    color: #fff;
  }
  .ls-native {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ls-code-inline {
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.55;
  }

  /* Full variant: bigger trigger with the native label visible. */
  .ls--full .ls-trigger {
    min-height: 48px;
    padding: 0 0.9rem;
    gap: 0.55rem;
  }
</style>