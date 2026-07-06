// Manual "atualizar a app" — force the newest deploy even when a stale service
// worker or cache is still serving an old bundle. This is the exact failure the
// user hit before (black screen after a deploy that a hard-refresh fixed); a
// button makes the fix one tap instead of clear-site-data gymnastics.
//
// The layout hands us the vite-pwa `updateSW` callback via setUpdateSW(). The
// button prefers that flow (activate the waiting worker → controllerchange →
// reload); if nothing is waiting it clears the caches and reloads anyway, so
// the user is ALWAYS guaranteed a fresh load when they ask for one.

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

/** Called once from +layout.svelte after registerSW() resolves. */
export function setUpdateSW(fn: (reload?: boolean) => Promise<void>): void {
  updateSW = fn;
}

/** Ask the browser to re-check for a new service worker. Returns true if one is
 *  now waiting to activate. Best-effort; never throws. */
export async function checkForUpdate(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update();
    return Boolean(reg.waiting);
  } catch {
    return false;
  }
}

/**
 * Force the app to the latest version. Prefers the vite-pwa flow (activate a
 * waiting worker, which reloads on controllerchange); otherwise clears the
 * runtime caches and reloads so a stale precache can't survive. Always ends in
 * a reload, so it does not resolve in practice — the return type is for callers
 * that want to await it before showing a spinner.
 */
export async function forceAppUpdate(): Promise<void> {
  // 1) Preferred: a fresh worker is (or becomes) waiting → apply + reload.
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
      if (reg?.waiting && updateSW) {
        await updateSW(true); // vite-pwa: skipWaiting + reload on controllerchange
        return;
      }
    }
  } catch {
    // fall through to the hard path
  }

  // 2) Fallback: drop every cache so an old precache can't keep serving, then
  //    reload straight from the network.
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore — reload still fetches a fresh document
  }
  if (typeof location !== 'undefined') location.reload();
}
