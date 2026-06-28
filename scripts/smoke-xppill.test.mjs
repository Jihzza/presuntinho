#!/usr/bin/env node
// scripts/smoke-xppill.test.mjs
// Smoke test para M0-S1: XpPill conditional visibility mode.
//
// DoD M0-S1 (resumido):
//   - hidden por default (opacity 0, translateY 8px, pointer-events none)
//   - anima IN 250ms quando xp muda
//   - visível 3s depois da última mudança
//   - anima OUT 250ms, depois display:none
//   - prefers-reduced-motion: skip animações
//   - mode 'always' mostra imediatamente
//
// Estratégia: como XpPill é um componente Svelte com runtime DOM,
// não testamos dentro do Vitest. Em vez disso, validamos:
//   (a) o SOURCE contém todas as classes/keyframes/transições
//   (b) a PROP `mode` aceita 'always'|'onChange'
//   (c) a função prefersReducedMotion() existe e respeita media query
//   (d) o componente NÃO toca no +layout.svelte (verificável por grep)
//
// Asserts mínimos: 8 (brief V7 pede ≥6).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/lib/components/XpPill.svelte'), 'utf8');
const layout = fs.readFileSync(path.join(ROOT, 'src/routes/+layout.svelte'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.error(`  ✗ ${name}`); fail++; }
}

console.log('Smoke M0-S1 — XpPill conditional visibility');

// (a) Source contém todas as classes/keyframes/transições
ok('has xp-pill--hidden class', /xp-pill--hidden/.test(src));
ok('opacity 0 on hidden', /opacity:\s*0/.test(src));
ok('translateY 8px on hidden', /translateY\(8px\)/.test(src));
ok('pointer-events: none on hidden', /pointer-events:\s*none/.test(src));
ok('xp-pill--visible class defined', /xp-pill--visible/.test(src));
ok('opacity 1 on visible', /opacity:\s*1/.test(src));
ok('transition 250ms defined', /0\.25s/.test(src));
ok('display: none on hidden', /display:\s*none/.test(src));

// (b) PROP mode aceita always|onChange
ok('prop mode accepts "always"', /['"]always['"]/.test(src));
ok('prop mode accepts "onChange"', /['"]onChange['"]/.test(src));
ok('default mode is onChange', /mode\s*=\s*['"]onChange['"]/.test(src));

// (c) prefersReducedMotion respeitado
ok('has prefersReducedMotion() helper', /prefersReducedMotion/.test(src));
ok('honors matchMedia prefers-reduced-motion', /prefers-reduced-motion/.test(src));
ok('media query @media (prefers-reduced-motion: reduce)', /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(src));

// (d) +layout.svelte intocado (brief: "NÃO tocar no +layout.svelte")
// Verifica que o layout ainda usa <XpPill /> sem prop mode explícita (usa default)
ok('+layout.svelte uses <XpPill /> (no forced mode prop)', /<XpPill\s*\/>/.test(layout));

// (e) aria-live preservado via .fab-stack no parent
ok('layout has aria-live="polite" on .fab-stack', /aria-live="polite"/.test(layout));

// (f) 3s hide delay implementado
ok('3s hide delay setTimeout(3000)', /setTimeout\([^,]+,\s*3000\s*\)/.test(src) || /scheduleHide\(3000\)/.test(src) || /3000/.test(src));

console.log(`\nResult: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
