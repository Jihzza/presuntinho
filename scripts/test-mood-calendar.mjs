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

console.log('\nMood/Vibe architecture');
assert('mood.ts defines ActiveMood', /export interface ActiveMood/.test(mood));
assert('mood.ts exposes agent-ready activateMood', /export async function activateMood\(kind: MoodKind, _source: MoodTriggerSource = 'password'\)/.test(mood));
assert('mood metadata includes sick/sad/love', /sick:\s*{[\s\S]*sad:\s*{[\s\S]*love:\s*{/.test(mood));
assert('mood change event exists', mood.includes("presuntinho:mood-changed"));
assert('splash acknowledges intro instead of clearing mood', splash.includes('acknowledgeMoodIntro(loveLockState)') && !splash.includes('await clearLoveLock()'));
assert('layout renders MoodLayer after acknowledged mood', layout.includes('<MoodLayer mood={activeMood}') && layout.includes('isMoodIntroAcknowledged'));
assert('layout listens to mood event', layout.includes('window.addEventListener(MOOD_EVENT'));
assert('MoodLayer has recovery CTA', layer.includes('Já me sinto melhor 🤍') || layer.includes('meta.action'));

console.log('\nFloating button stability');
assert('fab stack reserves fixed dimensions', /\.fab-stack\s*{[\s\S]*width:\s*9\.25rem;[\s\S]*height:\s*6\.9rem;/.test(layout));
assert('heart anchored to bottom-right independent of XP pill', /\.fab-stack > :global\(:last-child\)\s*{[\s\S]*position:\s*absolute;[\s\S]*bottom:\s*0;/.test(layout));
assert('xp anchored above heart', /\.fab-stack > :global\(:first-child\)\s*{[\s\S]*bottom:\s*4\.05rem;/.test(layout));

console.log('\nCalendar gesture/design');
assert('calendar uses pointer capture with guarded fallback', calendar.includes('setPointerCapture') && calendar.includes('catch'));
assert('calendar includes explicit touch fallback', calendar.includes('ontouchstart={beginTouch}') && calendar.includes('ontouchmove={moveTouch}') && calendar.includes('ontouchend={endTouch}'));
assert('calendar supports down expand and up collapse thresholds', calendar.includes('delta > threshold') && calendar.includes('delta < threshold'));
assert('calendar does not globally disable touch scroll', calendar.includes('touch-action: auto'));
assert('calendar has explicit drag handle', calendar.includes('class="drag-handle"'));
assert('month view is compact', /\.month-view \.day-cell \{ min-height: 48px/.test(calendar) && /max-width: 420px/.test(layer));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
