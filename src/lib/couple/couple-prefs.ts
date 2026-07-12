// Per-device preferences for the couple features, chosen during the couple
// onboarding (/casal/bemvindos) and editable later in /definicoes. Local on
// purpose: whether the surprise heart pops on THIS phone is a device choice,
// not shared state.

export interface CouplePrefs {
  /** Surprise heart button appears at random moments. */
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
