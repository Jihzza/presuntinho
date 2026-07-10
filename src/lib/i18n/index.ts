// svelte-i18n setup for Presuntinho V4.
//
// pt-PT is the primary language (Fatma's native language).  en is the
// fallback for any key that the pt-PT dictionary hasn't translated yet.
// V4.1 adds tn (Tunisian Arabic transliteration, latin script — NOT
// Arabic script), fr (French) and ar (Arabic, RTL).
//
// Locale persistence: the user's chosen language is stored in
// localStorage under the key `fat-pref-lang`.  We read it eagerly on
// module load (before init()) so the very first render can show the
// right strings — svelte-i18n's loadingDelay would otherwise flash the
// fallback strings.
//
// This module is safe to import from anywhere; init() is called once
// at module load and is idempotent for repeated invocations.

import { addMessages, init, locale as localeStore, waitLocale } from 'svelte-i18n';
import { get } from 'svelte/store';
import pt from './pt-PT.json';
import en from './en.json';
import tn from './tn.json';
import fr from './fr.json';
import ar from './ar.json';

/** The full list of supported UI locales. Order = display order in switchers. */
export type Locale = 'pt-PT' | 'en' | 'tn' | 'fr' | 'ar';

/** Every supported locale is listed in the localStorage check. */
export const LOCALES: Locale[] = ['pt-PT', 'en', 'tn', 'fr', 'ar'];

/** Default locale when nothing is persisted / matched. */
export const DEFAULT_LOCALE: Locale = 'pt-PT';

/**
 * Per-locale metadata. The `native` label is the language's name in
 * itself (e.g. "Deutsch" not "German"); `flag` is a unicode regional
 * indicator pair emoji used by the switcher; `dir` is the document
 * direction (right-to-left for ar, left-to-right for the rest).
 */
export interface LocaleMeta {
  code: Locale;
  native: string;   // label shown in the dropdown
  flag: string;     // emoji flag (regional indicator pair)
  dir: 'ltr' | 'rtl';
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  'pt-PT': { code: 'pt-PT', native: 'Português (PT)', flag: '🇵🇹', dir: 'ltr' },
  'en':    { code: 'en',    native: 'English',        flag: '🇬🇧', dir: 'ltr' },
  'tn':    { code: 'tn',    native: 'Tounsi',         flag: '🇹🇳', dir: 'ltr' },
  'fr':    { code: 'fr',    native: 'Français',       flag: '🇫🇷', dir: 'ltr' },
  'ar':    { code: 'ar',    native: 'العربية',        flag: '🇹🇳', dir: 'rtl' }
};

addMessages('pt-PT', pt);
addMessages('en', en);
addMessages('tn', tn);
addMessages('fr', fr);
addMessages('ar', ar);

// Read the persisted preference before calling init() so the very first
// render in the user's browser already has the right locale.  In SSR
// (or any non-browser context) localStorage is undefined; the explicit
// guard keeps this module SSR-safe.
/**
 * Best UI locale for a first-time visitor with no saved preference: match the
 * browser's language list against our locales (exact, then primary-subtag).
 * 'tn' has no BCP-47 code browsers report, so Tunisian users land on ar/fr and
 * can switch manually. SSR-safe. Returns null when nothing matches.
 */
function matchNavigatorLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null;
  const prefs =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
  for (const raw of prefs) {
    const lc = raw.toLowerCase();
    const exact = LOCALES.find((l) => l.toLowerCase() === lc);
    if (exact) return exact;
    const primary = lc.split('-')[0];
    if (primary === 'pt') return 'pt-PT';
    if (primary === 'en') return 'en';
    if (primary === 'fr') return 'fr';
    if (primary === 'ar') return 'ar';
  }
  return null;
}

function detectInitialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('fat-pref-lang');
    if (stored && (LOCALES as string[]).includes(stored)) {
      return stored as Locale;
    }
  }
  // No saved choice yet — follow the browser's language before defaulting to PT.
  return matchNavigatorLocale() ?? DEFAULT_LOCALE;
}

const initial = detectInitialLocale();

init({
  fallbackLocale: 'pt-PT',
  initialLocale: initial
});

/** Storage key used both for reads and writes. Exported so tests can poke it. */
export const LOCALE_STORAGE_KEY = 'fat-pref-lang';

/**
 * Apply the locale's document-level side effects: <html lang> attribute
 * and <html dir> for RTL languages.  Safe to call on the server (no-op
 * when document is undefined).
 */
function applyDocumentLocale(loc: Locale): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('lang', loc);
  root.setAttribute('dir', LOCALE_META[loc].dir);
}

/**
 * Switch the active locale at runtime, persist the choice to
 * localStorage and apply the matching <html lang/dir>.  Call this from
 * any UI element (e.g. the language switcher in the header or the
 * radio group in /definicoes).  After the call, $t() updates everywhere
 * on the next reactive tick.
 */
export function setLocale(loc: Locale): void {
  localeStore.set(loc);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, loc);
  }
  applyDocumentLocale(loc);
}

/**
 * Initialise <html lang/dir> from the persisted locale.  Called once
 * from the root layout's onMount so the first paint already has the
 * right `lang` (matters for screen readers and CSS `:lang(...)`).
 */
export function applyInitialDocumentLocale(): void {
  applyDocumentLocale(initial);
}

/** Re-export the svelte-i18n locale store so callers can subscribe directly. */
export const locale = localeStore;

/**
 * Re-export waitLocale so callers don't need to import it from
 * svelte-i18n directly.  `await waitLocale()` is the canonical way to
 * ensure dictionary swap is settled before reading a translation.
 */
export { waitLocale };

/**
 * Read the current locale synchronously.
 *
 * Reads the svelte-i18n store directly so callers see the *live* value
 * after `setLocale()` (the previous implementation returned the boot-time
 * `initial` snapshot, which silently went stale).  Falls back to the
 * boot-time default if the store is empty (early SSR or before init).
 */
export function getLocale(): Locale {
  const live = get(localeStore) as string | null | undefined;
  if (live && (LOCALES as string[]).includes(live)) {
    return live as Locale;
  }
  return initial;
}