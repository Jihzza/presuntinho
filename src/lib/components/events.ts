// Helpers to fire the confetti / toast custom events.
// Confetti.svelte and Toast.svelte listen for these events on window.

export const CONFETTI_EVENT = 'presuntinho:confetti';
export const TOAST_EVENT = 'presuntinho:toast';

/** Returns true when the user has requested reduced motion (OS-level a11y). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Dispatch a confetti burst.
 * Respects `prefers-reduced-motion: reduce` — when the user opts out, we
 * no-op so no DOM is created (Confetti.svelte's CSS also hides pieces, but
 * the JS guard avoids the wasted work and any layout churn).
 */
export function fireConfettiEvent(count: number = 60): void {
  if (typeof window === 'undefined') return;
  if (prefersReducedMotion()) return;
  window.dispatchEvent(new CustomEvent(CONFETTI_EVENT, { detail: count }));
}

/** Show a toast notification. */
export function showToast(msg: string, duration?: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { msg, duration } }));
}