/**
 * A11y audit harness — Lighthouse + axe-core per route.
 * Uses Playwright to seed sessionStorage before navigation, then runs
 * lighthouse programmatically and axe-core via page.evaluate.
 */
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES = [
  { name: 'hub',         path: '/' },
  { name: 'agente',      path: '/agente/' },
  { name: 'financas',    path: '/financas/' },
  { name: 'habitos',     path: '/habitos/' },
  { name: 'biblioteca',  path: '/biblioteca/' },
  { name: 'trabalhos',   path: '/trabalhos/' },
  { name: 'escola',      path: '/escola/' },
  { name: 'aulas',       path: '/aulas/' },
  { name: 'definicoes',  path: '/definicoes/' }
];

const VIEWPORTS = [
  { name: 'mobile',  width: 412,  height: 915,  isMobile: true,  scale: 2,
    screenEmulation: { mobile: true,  width: 412,  height: 915,  deviceScaleFactor: 2,  disabled: false } },
  { name: 'desktop', width: 1366, height: 768,  isMobile: false, scale: 1,
    screenEmulation: { mobile: false, width: 1366, height: 768,  deviceScaleFactor: 1,  disabled: false } }
];

const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const SESSION_VALUE = { unlocked: true, profile: 'daniel', method: 'daniel', unlockedAt: Date.now() };
const SESSION_KEY = 'presuntinho-session-daniel';

const AXE_SRC = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

const outDir = join(process.cwd(), '.state', 'a11y-audit');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext();
await context.addInitScript(
  `(k,v)=>{ try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e){} }`,
  SESSION_KEY, SESSION_VALUE
);

const testPage = await context.newPage();
await testPage.goto(BASE + '/');
const session = await testPage.evaluate(() => sessionStorage.getItem('presuntinho-session-daniel'));
console.log('[seed] sessionStorage value:', session);
await testPage.close();

const results = [];

for (const route of ROUTES) {
  console.log(`\n=== /${route.name} (${route.path}) ===`);
  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const url = BASE + route.path;

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      console.log(`  [${vp.name}] navigation issue: ${e.message.split('\n')[0]}`);
    }

    try {
      await page.waitForSelector('h1, h2', { timeout: 10000 });
    } catch (e) {
      console.log(`  [${vp.name}] no h1/h2 found`);
    }
    await page.waitForTimeout(800);

    // Run axe
    let axeViolations = [];
    try {
      await page.addScriptTag({ content: AXE_SRC });
      const axeResult = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
        });
        return r.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          tags: v.tags,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map(n => ({
            html: n.html.slice(0, 200),
            target: n.target,
            failureSummary: n.failureSummary
          }))
        }));
      });
      axeViolations = axeResult;
    } catch (e) {
      console.log(`  [${vp.name}] axe failed: ${e.message.split('\n')[0]}`);
    }

    const seriousOrCritical = axeViolations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log(`  [${vp.name}] axe: ${axeViolations.length} total, ${seriousOrCritical.length} serious/critical`);

    await page.close();

    // Lighthouse
    let lhScores = null;
    try {
      const wsEndpoint = browser.wsEndpoint();
      const lhResult = await lighthouse(url, {
        port: new URL(wsEndpoint).port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['accessibility', 'performance', 'best-practices', 'seo'],
        formFactor: vp.isMobile ? 'mobile' : 'desktop',
        screenEmulation: vp.screenEmulation,
        throttling: vp.isMobile ? {
          rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4,
          requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0
        } : {
          rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0
        },
        emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        extraHeaders: { Cookie: '' }
      });

      const cats = lhResult.lhr.categories;
      lhScores = {
        performance: Math.round((cats.performance?.score ?? 0) * 100),
        accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
        seo: Math.round((cats.seo?.score ?? 0) * 100)
      };
      console.log(`  [${vp.name}] LH: perf=${lhScores.performance} a11y=${lhScores.accessibility} bp=${lhScores.bestPractices} seo=${lhScores.seo}`);
    } catch (e) {
      console.log(`  [${vp.name}] lighthouse failed: ${e.message.split('\n')[0]}`);
    }

    results.push({
      route: route.name,
      path: route.path,
      viewport: vp.name,
      lh: lhScores,
      axe: {
        total: axeViolations.length,
        seriousCritical: seriousOrCritical.length,
        all: axeViolations
      }
    });
  }
}

await context.close();
await browser.close();

writeFileSync(join(outDir, 'a11y-before.json'), JSON.stringify(results, null, 2));

console.log('\n\n========== A11Y AUDIT SUMMARY ==========');
console.log('\n| Route        | M Perf | M A11y | M BP  | M SEO | D Perf | D A11y | D BP  | D SEO |');
console.log('|--------------|--------|--------|-------|-------|--------|--------|-------|-------|');
for (const route of ROUTES) {
  const m = results.find(r => r.route === route.name && r.viewport === 'mobile');
  const d = results.find(r => r.route === route.name && r.viewport === 'desktop');
  const fmt = (v) => v === null || v === undefined ? 'ERR' : String(v);
  console.log(`| ${route.name.padEnd(12)} | ${fmt(m?.lh?.performance).padEnd(6)} | ${fmt(m?.lh?.accessibility).padEnd(6)} | ${fmt(m?.lh?.bestPractices).padEnd(5)} | ${fmt(m?.lh?.seo).padEnd(5)} | ${fmt(d?.lh?.performance).padEnd(6)} | ${fmt(d?.lh?.accessibility).padEnd(6)} | ${fmt(d?.lh?.bestPractices).padEnd(5)} | ${fmt(d?.lh?.seo).padEnd(5)} |`);
}

console.log('\n========== AXE VIOLATIONS (serious+critical) ==========');
for (const r of results) {
  if (r.viewport !== 'mobile') continue;
  if (r.axe.seriousCritical === 0) continue;
  console.log(`\n/${r.route}:`);
  for (const v of r.axe.all.filter(v => v.impact === 'serious' || v.impact === 'critical')) {
    console.log(`  [${v.impact}] ${v.id} — ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) {
      console.log(`    target: ${n.target.join(' > ')}`);
      console.log(`    html: ${n.html.replace(/\s+/g, ' ').slice(0, 160)}`);
      if (n.failureSummary) console.log(`    why: ${n.failureSummary.split('\n')[0]}`);
    }
  }
}

console.log(`\nReport: ${outDir}/a11y-before.json`);
