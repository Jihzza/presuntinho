// svelte-i18n setup for Presuntinho V4.
//
// pt-PT is the primary language (Fatma's native language).  en is the
// fallback for any key that the pt-PT dictionary hasn't translated yet.
//
// Locale persistence: the user's chosen language is stored in
// localStorage under the key `fat-pref-lang`.  We read it eagerly on
// module load (before init()) so the very first render can show the
// right strings — svelte-i18n's loadingDelay would otherwise flash the
// fallback strings.
//
// This module is safe to import from anywhere; init() is called once
// at module load and is idempotent for repeated invocations.

import { addMessages, init, locale as localeStore } from 'svelte-i18n';
import pt from './pt-PT.json';
import en from './en.json';

addMessages('pt-PT', pt);
addMessages('en', en);

// Read the persisted preference before calling init() so the very first
// render in the user's browser already has the right locale.  In SSR
// (or any non-browser context) localStorage is undefined; the explicit
// guard keeps this module SSR-safe.
function detectInitialLocale(): 'pt-PT' | 'en' {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('fat-pref-lang');
    if (stored === 'pt-PT' || stored === 'en') return stored;
  }
  return 'pt-PT';
}

const initial = detectInitialLocale();

init({
  fallbackLocale: 'pt-PT',
  initialLocale: initial
});

/**
 * Switch the active locale at runtime and persist the choice.
 * Call this from any UI element (e.g. the language toggle in
 * /definicoes).  After the call, $t() updates everywhere on the next
 * reactive tick.
 */
export function setLocale(loc: 'pt-PT' | 'en'): void {
  localeStore.set(loc);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('fat-pref-lang', loc);
  }
}

/** Re-export the svelte-i18n locale store so callers can subscribe directly. */
export const locale = localeStore;

/** Convenience: read the current locale synchronously (initial value only). */
export function getLocale(): 'pt-PT' | 'en' {
  return initial;
}
