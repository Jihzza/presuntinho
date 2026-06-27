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
//   - Logo click: 3 = confetti+30 XP, 4/5 = hint toasts, 6–8 = Secret Room
//     opens + b14 + 100 XP + toast.
//   - Konami: ↑↑↓↓←→←→BA → b8 + confetti + 100 XP.
//   - Keywords: perfume/behi/fatma/help → respective rewards.
//   - Footer: 5 clicks → b15 + hint toast about perfume/behi.
//   - Mascot: random pro-tip + 5 XP.
//
// V4 additions (kept minimal, no behaviour drift):
//   - All persisted to Dexie via src/lib/state/stores.ts.
//   - Confetti/toast use window CustomEvent so any component can react.

import { get } from 'svelte/store';
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
  addXP,
  saveQuizScore
} from './state/stores';
import { fireConfettiEvent, showToast } from './components/events';

// ============================================================================
// HEART CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 7-31) defines 22 tiers keyed by exact-click count.
// Tiers are matched by EQUALITY (clicks === tier.at), not by `>=`.  We
// preserve that semantics.  Tier 0 (i.e. no tier match) gets continuous
// feedback: +1 XP per click, +2 XP every 5th click, +5 XP speed bonus
// within 350ms, mini-confetti every 10 clicks past 100.

interface HeartTier {
  at: number;
  msg: string;
  xp: number;
  conf: number;
  emoji: string;
  badge?: string;
}

const HEART_TIERS: HeartTier[] = [
  { at: 1,    msg: '❤️ Amo-te, presuntinho!',              xp: 20,  conf: 6,   emoji: '❤️',   badge: 'b10' },
  { at: 2,    msg: '❤️ +1 amor',                            xp: 0,   conf: 0,   emoji: '❤️' },
  { at: 3,    msg: '💕 Sabes que mais?',                    xp: 5,   conf: 0,   emoji: '💕' },
  { at: 5,    msg: '😘 Já sei que me amas — agora estuda!', xp: 10,  conf: 0,   emoji: '💕' },
  { at: 8,    msg: '💖 Ok, isto é ternura...',              xp: 5,   conf: 0,   emoji: '💖' },
  { at: 10,   msg: '🏆 Presuntinho obsessive detected!',    xp: 50,  conf: 30,  emoji: '💖' },
  { at: 15,   msg: '💝 Love bombing nivel: avançado.',      xp: 10,  conf: 10,  emoji: '💝' },
  { at: 20,   msg: '✨ 20 cliques. Still going?',           xp: 10,  conf: 0,   emoji: '💝' },
  { at: 25,   msg: '💀 Ok, agora PARE. Vai estudar.',       xp: 25,  conf: 0,   emoji: '💝' },
  { at: 30,   msg: '🌹 A rose for your dedication.',        xp: 15,  conf: 20,  emoji: '🌹' },
  { at: 40,   msg: '🌹🌹 Two roses. Subiu o nível.',         xp: 15,  conf: 0,   emoji: '🌹' },
  { at: 50,   msg: '⭐ 50! Half-century of love.',          xp: 50,  conf: 40,  emoji: '🌹' },
  { at: 75,   msg: '🐷💕 Pig + heart = unbreakable bond.',  xp: 30,  conf: 0,   emoji: '🐷💕' },
  { at: 100,  msg: '💯 100 cliques! Centenário do amor.',   xp: 100, conf: 60,  emoji: '🐷💕', badge: 'b13' },
  { at: 150,  msg: "🔥 You're in the top tier of clickers.", xp: 50,  conf: 0,   emoji: '🐷💕' },
  { at: 200,  msg: '🌈 200! Rainbow mode activating...',    xp: 100, conf: 80,  emoji: '🌈' },
  { at: 300,  msg: '⚡ 300 clicks. Speed-demon territory.', xp: 75,  conf: 0,   emoji: '🌈' },
  { at: 500,  msg: '👑 500! HALF A THOUSAND. Hall of fame.', xp: 200, conf: 100, emoji: '👑' },
  { at: 750,  msg: '🚀 750 clicks. Approachsing legendary.', xp: 100, conf: 0,   emoji: '👑' },
  { at: 1000, msg: '🎉 1000! LEGENDARY. Heart transformed.', xp: 500, conf: 200, emoji: '🌟', badge: 'b12' },
  { at: 1500, msg: '💎 Beyond legendary. You have no life.', xp: 200, conf: 0,   emoji: '💎' },
  { at: 2000, msg: '🌟 2000! The heart is now eternal.',    xp: 500, conf: 0,   emoji: '🌟' },
  { at: 5000, msg: '🌌 You have transcended clicking.',    xp: 1000, conf: 300, emoji: '🌌' }
];

function lastHeartTierEmoji(n: number): string {
  for (let i = HEART_TIERS.length - 1; i >= 0; i--) {
    if (HEART_TIERS[i].at <= n) return HEART_TIERS[i].emoji;
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

  // Speed bonus (V3: 350ms)
  const speedBonus = now - getLastHeartClickTime() < 350;
  setLastHeartClickTime(now);

  // Find exact-match tier (V3: clicks === tier.at)
  const tier = HEART_TIERS.find((t) => t.at === clicks) ?? null;

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
        emoji: lastHeartTierEmoji(clicks)
      }
    }));
    // Body pulse for every click past 100 (300ms)
    if (clicks >= 100) {
      window.dispatchEvent(new CustomEvent(HEART_PULSE_EVENT));
    }
  }

  if (tier) {
    showToast(tier.msg);
    if (tier.xp) await addXP(tier.xp);
    if (tier.conf) fireConfettiEvent(tier.conf);
    if (tier.badge) await awardBadge(tier.badge);
    if (tier.at === 1) {
      // V3 awards b10 at heart click 1
      await awardBadge('b10');
      await discoverSecret('heart');
    }
  } else {
    // Continuous feedback (V3 lines 78-87)
    const speedNote = speedBonus ? ' ⚡speed bonus +5' : '';
    showToast(`${lastHeartTierEmoji(clicks)} +1 amor (${clicks})${speedNote}`, 1800);
    if (speedBonus) await addXP(5);
    if (clicks % 5 === 0 && clicks >= 5) await addXP(2);
    if (clicks > 100 && clicks % 10 === 0) fireConfettiEvent(8);
  }
}

// Tiny module-scope last-click time (V3's `state.lastHeartClick` lives
// only in memory; we don't persist it).
let _lastHeartClickTime = 0;
function getLastHeartClickTime(): number { return _lastHeartClickTime; }
function setLastHeartClickTime(t: number): void { _lastHeartClickTime = t; }

// ============================================================================
// LOGO CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 98-129):
//   - 1 click → nothing
//   - 2 clicks → "One more..." toast
//   - 3 clicks → confetti + 30 XP + toast
//   - 4 clicks → "One more click! 🎯"
//   - 5 clicks → "Almost there... 2 more clicks!"
//   - 6–8 clicks → Secret Room opens + b14 + 100 XP + welcome toast
//   - After 8 → only tiny easter-egg toast if sroom already opened
// Reset: 3-second window between clicks (state.logoTimer = setTimeout(...)).

const LOGO_RESET_MS = 3000;
const SECRET_ROOM_MIN = 6;
const SECRET_ROOM_MAX = 8;
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
    await addXP(30);
    await discoverSecret('logo3');
  } else if (next >= SECRET_ROOM_MIN && next <= SECRET_ROOM_MAX) {
    showToast('🧴 Welcome to the Secret Room!');
    sroomOpened.set(true);
    await addXP(100);
    await awardBadge('b14');
    await discoverSecret('logo7');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('presuntinho:open-secret-room'));
    }
  } else if (next === 2) {
    showToast('🐷 One more...');
  } else if (next === 4) {
    showToast('🐷 One more click! 🎯');
  } else if (next === 5) {
    showToast('🐷 Almost there... 2 more clicks!');
  }
}

// ============================================================================
// MASCOT CLICK
// ============================================================================
//
// V3 (easter-eggs.js lines 131-141): random pro-tip + 5 XP.

const MASCOT_TIPS = [
  '🧴 Pro tip: vary your sentence length!',
  '🧴 Pro tip: cite specific numbers from the case!',
  '🧴 Pro tip: SCQA > generic intro',
  '🧴 Pro tip: TOWS without action = waste',
  "🧴 You've got this, Fatma! 💪"
];

export async function mascotClick(): Promise<void> {
  const tip = MASCOT_TIPS[Math.floor(Math.random() * MASCOT_TIPS.length)];
  showToast(tip);
  await addXP(5);
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
    await addXP(100);
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
// KEYWORD DETECTOR (perfume, behi, fatma, help)
// ============================================================================
//
// V3 (easter-eggs.js lines 280-300): rolling 20-char buffer; matches ANY of
// the keywords (not just suffix).  V4 uses the same semantics, but stores
// `keyBuf` persistently.  On match, the buffer is cleared and the reward
// fires.  We map V3 badges to the V4 awardBadge ids:
//   perfume → b7 (Scent Discovery), +50 XP, confetti
//   behi    → b9 (Tunisian Secret), +50 XP, confetti
//   help    → hint toast (no badge)
//   fatma   → b14 (Secret Keeper), confetti (V4 addition: V3 had no fatma)

export async function handleKeywordKey(key: string): Promise<void> {
  const ch = key.toLowerCase();
  keyBuf.update((buf) => {
    const next = (buf + ch).slice(-20);
    return next;
  });
  const buf = get(keyBuf);

  if (buf.includes('perfume')) {
    showToast('🌸 Scent Discovery! You smell the strategy.');
    await addXP(50);
    await awardBadge('b7');
    fireConfettiEvent();
    await discoverSecret('perfume');
    keyBuf.set('');
  } else if (buf.includes('behi')) {
    showToast('🇹🇳 Tunisian Secret! Behi — beautiful in Tunisian Arabic.');
    await addXP(50);
    await awardBadge('b9');
    fireConfettiEvent();
    await discoverSecret('behi');
    keyBuf.set('');
  } else if (buf.includes('help')) {
    showToast('💡 Hint: click the ❤️, triple-click 🐷, try Konami code, type "perfume" or "behi"', 5000);
    keyBuf.set('');
  } else if (buf.includes('fatma')) {
    // V4 addition (V3 didn't have fatma). Mirrors the brief.
    showToast('🔐 Para Fatma, com amor.', 5000);
    await awardBadge('b14');
    fireConfettiEvent(70);
    await discoverSecret('fatma');
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
    await addXP(50);
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