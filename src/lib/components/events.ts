// Helpers to fire the confetti / toast custom events.
// Confetti.svelte and Toast.svelte listen for these events on window.

export const CONFETTI_EVENT = 'presuntinho:confetti';
export const TOAST_EVENT = 'presuntinho:toast';

/** Visual tone of a toast — drives colour + icon in Toast.svelte. */
export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastDetail {
  msg: string;
  duration?: number;
  type?: ToastType;
}

export interface ConfettiBurst {
  count: number;
  intensity?: number;
  origin?: 'heart' | 'center' | 'top';
  palette?: string[];
}

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
export function fireConfettiEvent(count: number | ConfettiBurst = 60): void {
  if (typeof window === 'undefined') return;
  if (prefersReducedMotion()) return;
  window.dispatchEvent(new CustomEvent(CONFETTI_EVENT, { detail: count }));
}

/** Show a toast notification. Toasts queue rather than overwrite each other. */
export function showToast(msg: string, duration?: number, type: ToastType = 'info'): void {
  if (typeof window === 'undefined') return;
  const detail: ToastDetail = { msg, duration, type };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}