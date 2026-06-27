// Helpers to fire the confetti / toast custom events.
// Confetti.svelte and Toast.svelte listen for these events on window.

export const CONFETTI_EVENT = 'presuntinho:confetti';
export const TOAST_EVENT = 'presuntinho:toast';

/** Dispatch a confetti burst. */
export function fireConfettiEvent(count: number = 60): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONFETTI_EVENT, { detail: count }));
}

/** Show a toast notification. */
export function showToast(msg: string, duration?: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { msg, duration } }));
}