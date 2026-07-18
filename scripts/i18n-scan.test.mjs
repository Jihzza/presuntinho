#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scannerSourcePath = fileURLToPath(new URL('./i18n-scan.mjs', import.meta.url));

function runScanner(root, reportOnly) {
  return spawnSync(
    process.execPath,
    [join(root, 'scripts', 'i18n-scan.mjs'), ...(reportOnly ? ['--report-only'] : [])],
    { cwd: root, encoding: 'utf8' }
  );
}

test('aria-describedby IDs are ignored without hiding referenced copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'presuntinho-i18n-scan-'));

  try {
    const scannerPath = join(root, 'scripts', 'i18n-scan.mjs');
    mkdirSync(dirname(scannerPath), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(scannerPath, readFileSync(scannerSourcePath, 'utf8'));
    writeFileSync(
      join(root, 'src', 'Fixture.svelte'),
      `<button
  aria-describedby="fixture-help fixture-status"
  aria-label="Open settings"
>
  {$t('fixture.button')}
</button>
<span id="fixture-help">Hardcoded help copy</span>
<span id="fixture-status">{$t('fixture.status')}</span>
`
    );

    const report = runScanner(root, true);
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /2 hardcoded string\(s\)/);
    assert.match(report.stdout, /\[aria-label\].*"Open settings"/);
    assert.match(report.stdout, /"Hardcoded help copy"/);
    assert.doesNotMatch(report.stdout, /\[aria-describedby\]/);
    assert.doesNotMatch(report.stdout, /fixture-help fixture-status/);

    const strict = runScanner(root, false);
    assert.equal(strict.status, 1, 'strict mode must still fail for real hardcoded copy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
