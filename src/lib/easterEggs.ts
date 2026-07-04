// Easter egg triggers ported from V3 (static/legacy/assets/js/easter-eggs.js).
//
// Each trigger:
//   - Updates the relevant Svelte store (which auto-persists to Dexie)
//   - Awards badges via awardBadge()
//   - Discovers secrets via discoverSecret()
//   - Fires confetti / toast via window custom events
//
// V3 behaviour preserved exactly:
//   - Heart click: 22-tier XP escalation, speed bonus (350ms), mini-confetti
//     streaks past 100, body-pulse animation hook past 100 (we emit a custom
//     event 'presuntinho:heart-pulse' that the UI can listen for).
//   - Logo click: 3 = confetti+30 XP, 4 = hint toast, 5–10 = Secret Room
//     opens + b14 + 100 XP + toast.
//   - Konami: ↑↑↓↓←→←→BA → b8 + confetti + 100 XP.
//   - Keywords: perfume/behi/fatma/help → respective rewards.
//   - Footer: 5 clicks → b15 + hint toast about perfume/behi.
//   - Mascot: random pro-tip + 5 XP.
//
// V8 additions:
//   - HEART_TIERS / MASCOT_TIPS now come from /config/easterEggs.json via
//     easterEggsConfig.ts (single source of truth, no inline duplicates).
//   - Heart TIER CROSSINGS are persisted as `heart_tier_<n>` rows in the
//     Dexie `secrets` table so /memorias can show them on the timeline.
//   - New keyword eggs: visca (Barça), clutch (Valorant), nyaa (anime),
//     brutale (MV Agusta), harissa (Tunísia).
//   - Date-aware eggs via checkSeasonalEggs(): Valentine's Day, New Year and
//     any `events` row of kind 'special' matching today (yearly-aware).

import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import {
  heartClicks,
  heartMaxClicks,
  logoClicks,
  konamiProg,
  keyBuf,
  footerClicks,
  sroomOpened,
  awardBadge,
  discoverSecret,
  saveQuizScore
} from './state/stores';
// awardXP substitui addXP — cada easter egg passa pela XP_TABLE central.
import { awardXP } from './state/xp-actions';
import { db } from './state/db';
import { fireConfettiEvent, showToast } from './components/events';
import { playSfx, registerComboHit } from './gamification/sound';
import { getHeartTiers, getMascotTips, type HeartTier } from './easterEggsConfig';

// ---------------------------------------------------------------------------
// i18n helper for this non-component module. svelte-i18n's `t` is a store;
// we snapshot the formatter and always pass a pt-PT default so toasts stay
// readable even before the dictionaries finish loading.
// ---------------------------------------------------------------------------
function tr(
  key: string,
  fallback: string,
  values?: Record<string, string | number>
): string {
  try {
    return get(t)(key, { default: fallback, values }) ?? fallback;
  } catch {
    return fallback;
  }
}

// ============================================================================
// HEART CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 7-31) defines 22 tiers keyed by exact-click count.
// Tiers are matched by EQUALITY (clicks === tier.at), not by `>=`.  We
// preserve that semantics.  Tier 0 (i.e. no tier match) gets continuous
// feedback: +1 XP per click, +2 XP every 5th click, +5 XP speed bonus
// within 350ms, mini-confetti every 10 clicks past 100.
//
// Tiers are loaded from /config/easterEggs.json (cached after first fetch).

function lastHeartTierEmoji(tiers: HeartTier[], n: number): string {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (tiers[i].at <= n) return tiers[i].emoji;
  }
  return '❤️';
}

const HEART_PULSE_EVENT = 'presuntinho:heart-pulse';

export async function heartClick(): Promise<void> {
  const now = Date.now();

  // Bump clicks + maxClicks
  heartClicks.update((v) => v + 1);
  const clicks = get(heartClicks);
  if (clicks > get(heartMaxClicks)) heartMaxClicks.set(clicks);

  // Speed bonus (V3: 350ms) + burst-density model for spam-taps.
  const speedBonus = now - getLastHeartClickTime() < 350;
  setLastHeartClickTime(now);
  const recentClicks = recordHeartBurst(now);
  const burstLevel = Math.min(5, Math.max(0, recentClicks - 1));
  // V10.3 — cada clique dá um "pop" cujo pitch sobe com o combo: martelar
  // o coração soa a subir uma escada musical. 🎹
  registerComboHit();
  playSfx('pop');
  const burstConfetti = Math.min(260, 8 + recentClicks * recentClicks * 3 + (speedBonus ? 12 : 0));

  // Single source of truth: tiers come from the config loader (cached in
  // memory after the first click, so this await is effectively free).
  const tiers = await getHeartTiers();

  // Find exact-match tier (V3: clicks === tier.at)
  const tier = tiers.find((tr_) => tr_.at === clicks) ?? null;

  // Visual escalation — emit a custom event so the UI can mirror V3's
  // DOM-class manipulation (intensity-1..4 + emoji swap + body pulse).
  const intensity =
    clicks >= 1000 ? 4 :
    clicks >= 200 ? 3 :
    clicks >= 50 ? 2 :
    clicks >= 10 ? 1 : 0;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presuntinho:heart-visual', {
      detail: {
        clicks,
        intensity,
        emoji: lastHeartTierEmoji(tiers, clicks),
        burstLevel,
        recentClicks
      }
    }));
    // Body pulse + micro-confetti on every click keeps the easter egg feeling
    // energetic without requiring the user to hit rare tier thresholds.
    window.dispatchEvent(new CustomEvent(HEART_PULSE_EVENT));
    window.dispatchEvent(new CustomEvent('presuntinho:screen-shake'));
  }

  fireConfettiEvent({ count: burstConfetti, origin: 'heart', intensity: burstLevel });

  // V3 awards b10 + the 'heart' secret at click 1.  Kept OUTSIDE the tier
  // branch so the discovery still happens even if the config fetch failed.
  if (clicks === 1) {
    await awardBadge('b10');
    await discoverSecret('heart');
  }

  if (tier) {
    showToast(tier.msg);
    if (tier.xp) await awardXP('easteregg_heart_tier', tier.xp);
    if (tier.conf) fireConfettiEvent(tier.conf);
    if (tier.badge) await awardBadge(tier.badge);
    // V8: persist the tier crossing with a timestamp so the /memorias
    // timeline can show "the heart reached N clicks" moments.  Rows live in
    // the Dexie `secrets` table under the reserved `heart_tier_<n>` ids —
    // discoverSecret() is idempotent, so each crossing is recorded once.
    await discoverSecret(`heart_tier_${tier.at}`);
  } else {
    // Continuous feedback (V3 lines 78-87)
    const speedNote = speedBonus ? ' ⚡speed bonus +5' : '';
    showToast(`${lastHeartTierEmoji(tiers, clicks)} +1 amor (${clicks})${speedNote}`, 1800);
    if (speedBonus) await awardXP('easteregg_heart_tier', 5);
    if (clicks % 5 === 0 && clicks >= 5) await awardXP('easteregg_heart_tier', 2);
    if (clicks > 100 && clicks % 10 === 0) fireConfettiEvent(8);
  }
}

// Tiny module-scope last-click time (V3's `state.lastHeartClick` lives
// only in memory; we don't persist it).
let _lastHeartClickTime = 0;
function getLastHeartClickTime(): number { return _lastHeartClickTime; }
function setLastHeartClickTime(t_: number): void { _lastHeartClickTime = t_; }
let _heartBurstWindow: number[] = [];
function recordHeartBurst(now: number): number {
  _heartBurstWindow = [..._heartBurstWindow.filter((time) => now - time < 1200), now].slice(-12);
  return _heartBurstWindow.length;
}

// ============================================================================
// LOGO CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 98-129):
//   - 1 click → nothing
//   - 2 clicks → "One more..." toast
//   - 3 clicks → confetti + 30 XP + toast
//   - 4 clicks → "One more click! 🎯"
//   - 5–10 clicks → Secret Room opens + b14 + 100 XP + welcome toast
//   - After that → only tiny easter-egg toast if sroom already opened
// Reset: 5-second window between clicks.

const LOGO_RESET_MS = 5000;          // window between clicks (was 3000 — too tight)
const SECRET_ROOM_MIN = 5;          // lowered from 6 — easier to discover
const SECRET_ROOM_MAX = 10;         // wider top end so accidental double-clicks still count
let _logoResetTimer: ReturnType<typeof setTimeout> | null = null;

export async function logoClick(): Promise<void> {
  if (get(sroomOpened)) {
    showToast('🐷 You already found the Secret Room! Tap the logo 3× to see a hint.', 4000);
    return;
  }

  const next = get(logoClicks) + 1;
  logoClicks.set(next);

  // Reset counter after LOGO_RESET_MS of inactivity
  if (_logoResetTimer) clearTimeout(_logoResetTimer);
  _logoResetTimer = setTimeout(() => {
    logoClicks.set(0);
    _logoResetTimer = null;
  }, LOGO_RESET_MS);

  if (next === 3) {
    fireConfettiEvent();
    showToast('🎉 Logo triple-click! Confetti unlocked!');
    await awardXP('easteregg_logo_3click', 30);
    // The persisted `secrets` row is the unlock truth /secrets consults —
    // logoClicks itself resets after 5s, so it can never be the indicator.
    await discoverSecret('logo3');
  } else if (next === 4) {
    showToast('🐷 One more click! 🎯');
  } else if (next >= SECRET_ROOM_MIN && next <= SECRET_ROOM_MAX) {
    showToast('🧴 Welcome to the Secret Room!');
    sroomOpened.set(true);
    await awardXP('easteregg_secret_room', 100);
    await awardBadge('b14');
    await discoverSecret('logo7');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('presuntinho:open-secret-room'));
    }
  } else if (next === 2) {
    showToast('🐷 One more...');
  }
}

// ============================================================================
// MASCOT CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 131-141): random pro-tip + 5 XP.
// Tips now come from /config/easterEggs.json (single source of truth).

export async function mascotClick(): Promise<void> {
  const tips = await getMascotTips();
  const tip = tips.length
    ? tips[Math.floor(Math.random() * tips.length)]
    : tr('eggs.mascot.fallback', '🧴 Tu consegues, Fatma! 💪');
  showToast(tip);
  await awardXP('easteregg_mascot', 5);
}

// ============================================================================
// KONAMI CODE
// ============================================================================
//
// V3 (easter-eggs.js lines 268-277): keyCode array rolling window of size 10,
// matched against [38,38,40,40,37,39,37,39,66,65] = ↑↑↓↓←→←→BA.
// V4 stores `konamiProg` as a number[] of keyCodes (same shape).

const KONAMI_KEYCODES = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];

export async function handleKonamiKey(key: string, keyCode: number): Promise<void> {
  // Roll the buffer
  konamiProg.update((buf) => {
    const next = [...buf, keyCode];
    if (next.length > KONAMI_KEYCODES.length) next.shift();
    return next;
  });

  // Match
  const buf = get(konamiProg);
  const matches = buf.length === KONAMI_KEYCODES.length &&
    buf.every((k, i) => k === KONAMI_KEYCODES[i]);
  if (matches) {
    showToast('🎮 KONAMI CODE! +100 XP');
    await awardXP('easteregg_konami', 100);
    await awardBadge('b8');
    fireConfettiEvent();
    await discoverSecret('konami');
    konamiProg.set([]);
  }

  // Also run keyword detection on printable keys (V3: same keydown handler)
  if (key.length === 1) {
    await handleKeywordKey(key);
  }
}

// ============================================================================
// KEYWORD DETECTOR
// (perfume, behi, help, fatma + V8: visca, clutch, nyaa, brutale, harissa)
// ============================================================================
//
// V3 (easter-eggs.js lines 280-300): rolling 20-char buffer; matches ANY of
// the keywords (not just suffix).  V4 uses the same semantics, but stores
// `keyBuf` persistently.  On match, the buffer is cleared and the reward
// fires.  Badge mapping:
//   perfume → b7 (Scent Discovery), +50 XP, confetti
//   behi    → b9 (Tunisian Secret), +50 XP, confetti
//   help    → hint toast + 'help' secret (no badge)
//   fatma   → b14 (Secret Keeper), confetti
//   visca / clutch / nyaa / brutale / harissa → +50 XP via the existing
//   easteregg_keyword reason + confetti + secret discovery (no badge).

export async function handleKeywordKey(key: string): Promise<void> {
  const ch = key.toLowerCase();
  keyBuf.update((buf) => {
    const next = (buf + ch).slice(-20);
    return next;
  });
  const buf = get(keyBuf);

  if (buf.includes('perfume')) {
    showToast('🌸 Scent Discovery! You smell the strategy.');
    await awardXP('easteregg_keyword', 50);
    await awardBadge('b7');
    fireConfettiEvent();
    await discoverSecret('perfume');
    keyBuf.set('');
  } else if (buf.includes('behi')) {
    showToast('🇹🇳 Tunisian Secret! Behi — beautiful in Tunisian Arabic.');
    await awardXP('easteregg_keyword', 50);
    await awardBadge('b9');
    fireConfettiEvent();
    await discoverSecret('behi');
    keyBuf.set('');
  } else if (buf.includes('help')) {
    showToast(
      tr(
        'eggs.toast.help',
        '💡 Dica: clica no ❤️, triplo-clique no 🐷, código Konami, ou escreve "perfume", "behi", "visca", "clutch", "nyaa", "brutale" ou "harissa"…'
      ),
      6000
    );
    await discoverSecret('help');
    keyBuf.set('');
  } else if (buf.includes('fatma')) {
    showToast('🔐 Para Fatma, com amor.', 5000);
    await awardBadge('b14');
    fireConfettiEvent(70);
    await discoverSecret('fatma');
    keyBuf.set('');
  } else if (buf.includes('visca')) {
    showToast(tr('eggs.toast.visca', '⚽ Visca el Barça! Més que un club — golo de XP para ti.'));
    await awardXP('easteregg_keyword', 50);
    fireConfettiEvent(60);
    await discoverSecret('visca');
    keyBuf.set('');
  } else if (buf.includes('clutch')) {
    showToast(tr('eggs.toast.clutch', '🎯 Clutch! Ace 1v5 — és a MVP do Presuntinho.'));
    await awardXP('easteregg_keyword', 50);
    fireConfettiEvent(60);
    await discoverSecret('clutch');
    keyBuf.set('');
  } else if (buf.includes('nyaa')) {
    showToast(tr('eggs.toast.nyaa', '🐱 Nyaa~! Modo anime ativado, senpai.'));
    await awardXP('easteregg_keyword', 50);
    fireConfettiEvent(60);
    await discoverSecret('nyaa');
    keyBuf.set('');
  } else if (buf.includes('brutale')) {
    showToast(tr('eggs.toast.brutale', '🏍️ MV Agusta Brutale! Até daqui se ouve o motor.'));
    await awardXP('easteregg_keyword', 50);
    fireConfettiEvent(60);
    await discoverSecret('brutale');
    keyBuf.set('');
  } else if (buf.includes('harissa')) {
    showToast(tr('eggs.toast.harissa', '🌶️ Harissa! Picante como a Tunísia — saha!'));
    await awardXP('easteregg_keyword', 50);
    fireConfettiEvent(60);
    await discoverSecret('harissa');
    keyBuf.set('');
  }
}

// ============================================================================
// FOOTER CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 143-152): 5 clicks → hint toast + b15, then reset.

const FOOTER_THRESHOLD = 5;

export async function footerClick(): Promise<void> {
  const next = get(footerClicks) + 1;
  footerClicks.set(next);
  if (next >= FOOTER_THRESHOLD) {
    showToast('🔐 Try typing "perfume" or "behi" anywhere...');
    footerClicks.set(0);
    await awardBadge('b15');
    await discoverSecret('footer');
  }
}

// ============================================================================
// SEASONAL / DATE-AWARE EGGS (V8)
// ============================================================================
//
// Called once shortly after app boot (HeartButton mounts in the global
// layout and triggers this).  Celebrations fire at most once per LOCAL day
// (guarded by a small localStorage marker) so reloading the app on a special
// day doesn't spam toasts.  Secret discovery itself is idempotent via the
// Dexie `secrets` table.
//
// Religious dates are deliberately NOT included — only civil/seasonal dates
// plus whatever the user herself saved in the `events` table (kind 'special',
// optionally yearly — birthdays and anniversaries).

const SEASONAL_GUARD_PREFIX = 'presuntinho:seasonal:';

function alreadyCelebrated(id: string, today: string): boolean {
  try {
    return localStorage.getItem(`${SEASONAL_GUARD_PREFIX}${id}:${today}`) === '1';
  } catch {
    return true; // storage unavailable → fail closed (no repeated toasts)
  }
}

function markCelebrated(id: string, today: string): void {
  try {
    localStorage.setItem(`${SEASONAL_GUARD_PREFIX}${id}:${today}`, '1');
  } catch {
    /* ignore */
  }
}

export async function checkSeasonalEggs(): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${now.getFullYear()}-${mm}-${dd}`; // LOCAL YYYY-MM-DD

  // 💘 Valentine's Day — Feb 14
  if (mm === '02' && dd === '14' && !alreadyCelebrated('valentine', today)) {
    markCelebrated('valentine', today);
    showToast(tr('eggs.toast.valentine', '💘 Feliz Dia dos Namorados, presuntinho! Amo-te.'), 6000);
    fireConfettiEvent(120);
    await awardXP('easteregg_keyword', 30);
    await discoverSecret('valentine');
  }

  // 🎆 New Year — Jan 1
  if (mm === '01' && dd === '01' && !alreadyCelebrated('newyear', today)) {
    markCelebrated('newyear', today);
    showToast(tr('eggs.toast.newyear', '🎆 Feliz Ano Novo! Este ano vai ser teu.'), 6000);
    fireConfettiEvent(120);
    await awardXP('easteregg_keyword', 30);
    await discoverSecret('newyear');
  }

  // 🎂 Birthdays / anniversaries — `events` rows of kind 'special'.
  // A row matches when its date IS today, or when it repeats yearly and the
  // month-day matches today.
  try {
    const rows = await db().events.where('kind').equals('special').toArray();
    const todayMd = today.slice(5); // 'MM-DD'
    const match = rows.find(
      (r) =>
        typeof r.date === 'string' &&
        (r.date === today || (r.yearly === true && r.date.slice(5) === todayMd))
    );
    if (match && !alreadyCelebrated('specialday', today)) {
      markCelebrated('specialday', today);
      showToast(
        tr('eggs.toast.specialday', '🎂 Hoje é um dia especial: {title} 💗', { title: match.title }),
        6000
      );
      fireConfettiEvent(100);
      await awardXP('easteregg_keyword', 30);
      await discoverSecret('specialday');
    }
  } catch (e) {
    console.error('[easterEggs] seasonal events check failed', e);
  }
}

// ============================================================================
// SECRET ROOM (close)
// ============================================================================

export async function closeSRoom(): Promise<void> {
  sroomOpened.set(false);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presuntinho:close-secret-room'));
  }
}

// ============================================================================
// QUIZ SCORE EVENT HANDLER
// ============================================================================
//
// Bridges to Dexie via saveQuizScore.  Called from QuizRunner.svelte when
// the user submits a quiz.  Bonus: PT quiz perfect score awards b11 (Lusófono)
// + confetti, mirroring V3 quizzes.js lines 96-106.

export async function recordQuizSubmission(
  quizId: string,
  correct: number,
  total: number,
  answeredIndices: number[]
): Promise<{ score: number; perfect: boolean; pt: boolean }> {
  const score = Math.round((correct / total) * 100);
  await saveQuizScore(quizId, correct, answeredIndices);
  const perfect = correct === total;
  const pt = quizId === 'ptq';

  showToast(`🎯 ${correct}/${total} (${score}%)`);

  if (perfect) {
    showToast(`🏆 Perfect score on ${quizId.toUpperCase()}! +50 XP bonus`, 3500);
    await awardXP('quiz_perfect_score', 50);
    await awardBadge('b3');
    if (pt) {
      await awardBadge('b11');
      fireConfettiEvent(80);
      showToast('🇵🇹 Lusófono! Falas Português!', 5000);
    } else {
      fireConfettiEvent(60);
    }
  } else if (score >= 70) {
    fireConfettiEvent(30);
  }

  return { score, perfect, pt };
}
