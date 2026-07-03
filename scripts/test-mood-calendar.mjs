#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const mood = read('src/lib/mood.ts');
const layout = read('src/routes/+layout.svelte');
const splash = read('src/routes/splash/+page.svelte');
const layer = read('src/lib/components/MoodLayer.svelte');
const calendar = read('src/routes/calendario/+page.svelte');
const settings = read('src/routes/definicoes/+page.svelte');
const heart = read('src/lib/components/HeartButton.svelte');
const confetti = read('src/lib/components/Confetti.svelte');
const events = read('src/lib/components/events.ts');
const easter = read('src/lib/easterEggs.ts');
const home = read('src/routes/+page.svelte');
const school = read('src/routes/escola/+page.svelte');
const appCss = read('src/app.css');
const db = read('src/lib/state/db.ts');

console.log('\nMood/Vibe architecture');
assert('mood.ts defines ActiveMood', /export interface ActiveMood/.test(mood));
assert('mood.ts exposes agent-ready activateMood', /export async function activateMood\(kind: MoodKind, _source: MoodTriggerSource = 'password'\)/.test(mood));
assert('mood metadata includes sick/sad/love', /sick:\s*{[\s\S]*sad:\s*{[\s\S]*love:\s*{/.test(mood));
assert('mood change event exists', mood.includes("presuntinho:mood-changed"));
assert('splash acknowledges intro instead of clearing mood', splash.includes('acknowledgeMoodIntro(loveLockState)') && !splash.includes('await clearLoveLock()'));
assert('splash grants normal app session after mood intro', splash.includes("setSession('fatma', 'secret')") && splash.includes("resetAttempts('fatma')"));
assert('layout renders MoodLayer after acknowledged mood', layout.includes('<MoodLayer mood={activeMood}') && layout.includes('isMoodIntroAcknowledged'));
assert('layout listens to mood event', layout.includes('window.addEventListener(MOOD_EVENT'));
assert('layout keeps footer navigation enabled during active mood', layout.includes("setSession('fatma', 'secret')") && layout.includes('await initStores(session.profile)'));
assert('mood bottom nav stays above mood layer', layout.includes('z-index: 9701'));
assert('MoodLayer has recovery CTA', layer.includes('Já me sinto melhor 🤍') || layer.includes('meta.action'));
assert('MoodLayer has interactive care actions', layer.includes('careActions') && layer.includes('care-grid') && layer.includes('comfort-note'));
assert('layout applies app-wide mood ambience', layout.includes('app-mood') && layout.includes('--mood-accent'));
assert('MoodLayer keeps app usable while active', layer.includes('class:compact={!expanded}') && layer.includes('pointer-events: none') && layer.includes('pointer-events: auto') && layer.includes('max-height: min(54vh, 460px)'));
assert('settings exposes mood selector using existing mood helpers', settings.includes('MOOD_OPTIONS') && settings.includes('activateMood(kind, \'manual\')') && settings.includes('clearActiveMood()'));
assert('home adapts hero/quest copy to active mood', home.includes('readActiveMood') && home.includes('presuntinho-quest') && home.includes('moodMicrocopy'));

console.log('\nFloating button stability');
assert('fab stack reserves fixed dimensions', /\.fab-stack\s*{[\s\S]*width:\s*9\.25rem;[\s\S]*height:\s*6\.9rem;/.test(layout));
assert('heart anchored to bottom-right independent of XP pill', /\.fab-stack > :global\(:last-child\)\s*{[\s\S]*position:\s*absolute;[\s\S]*bottom:\s*0;/.test(layout));
assert('xp anchored above heart', /\.fab-stack > :global\(:first-child\)\s*{[\s\S]*bottom:\s*4\.05rem;/.test(layout));
assert('heart removes native blue tap highlight and keeps custom focus', heart.includes('-webkit-tap-highlight-color: transparent') && heart.includes('.heart-btn:focus-visible') && heart.includes('box-shadow: 0 0 0 3px'));
assert('heart animations avoid layout-changing properties', heart.includes('only inner transform/opacity/glow') && !/\.heart-btn\.burst-[\s\S]*?(?:width|height|right|bottom):/.test(heart));

console.log('\nDeep polish / themes / gamification');
assert('confetti supports structured heart-origin bursts', events.includes('export interface ConfettiBurst') && confetti.includes('confetti-heart') && confetti.includes('origin === \'heart\''));
assert('heart click computes burst density for spam taps', easter.includes('recordHeartBurst') && easter.includes('recentClicks * recentClicks') && easter.includes('burstLevel'));
assert('theme system includes new professional themes', db.includes("'vanilla'") && db.includes("'garden'") && db.includes("'midnight'") && db.includes("'cozy'") && db.includes("'fresh'"));
assert('theme CSS defines premium palettes', appCss.includes("[data-theme='vanilla']") && appCss.includes("[data-theme='fresh']") && appCss.includes("[data-theme='midnight']"));
assert('school includes Duolingo-inspired lesson path', school.includes('lesson-path') && school.includes("$t('school.loop.streak')") && school.includes("$t('school.path.reward.title')"));

console.log('\nCalendar gesture/design');
assert('calendar uses pointer capture with guarded fallback', calendar.includes('setPointerCapture') && calendar.includes('catch'));
assert('calendar includes explicit touch fallback', calendar.includes('ontouchstart={beginTouch}') && calendar.includes('ontouchmove={moveTouch}') && calendar.includes('ontouchend={endTouch}'));
assert('calendar supports down expand and up collapse thresholds', calendar.includes('delta > threshold') && calendar.includes('delta < threshold'));
assert('calendar does not globally disable touch scroll', calendar.includes('touch-action: auto'));
assert('calendar has explicit drag handle', calendar.includes('class="drag-handle"'));
assert('month view is compact', /\.month-view \.day-cell \{ min-height: 48px/.test(calendar) && /max-width: 4(20|40)px/.test(layer));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
