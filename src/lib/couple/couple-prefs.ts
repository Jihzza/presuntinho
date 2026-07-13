// Per-device preferences for the couple features, chosen during the couple
// onboarding (/casal/bemvindos). Love/nudge presentation remains a local
// device choice. The heart itself is now mandatory for an active account
// couple because its server window must match on both phones.

export interface CouplePrefs {
  /** Legacy persisted field; active account couples always use the shared heart. */
  heart: boolean;
  /** Love/nudge pings from the partner buzz this device. */
  pings: boolean;
}

const KEY = 'presuntinho-couple-prefs';
export const COUPLE_PREFS_EVENT = 'presuntinho-couple-prefs-changed';

const DEFAULTS: CouplePrefs = { heart: true, pings: true };

export function readCouplePrefs(): CouplePrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<CouplePrefs>;
    return { heart: parsed.heart !== false, pings: parsed.pings !== false };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeCouplePrefs(prefs: CouplePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota — defaults still apply */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COUPLE_PREFS_EVENT));
}
