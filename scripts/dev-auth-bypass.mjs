#!/usr/bin/env node
/**
 * dev-auth-bypass.mjs — DEV-ONLY smoke helper for the visual audit.
 *
 * Injects a fake "unlocked" session for one of the predefined profiles
 * into the *exact* sessionStorage shape the app expects (see
 * `src/lib/auth/session.ts`). It does NOT bypass any password check,
 * does NOT touch /auth/hashes.json, and does NOT mutate IndexedDB —
 * the session is the only thing the layout guard reads, so a forged
 * entry is enough to enter the app for visual inspection.
 *
 * USAGE
 *   node scripts/dev-auth-bypass.mjs <profile>
 *
 *   profiles: daniel | fatma          (anything else ⇒ exit 2)
 *
 * FLAGS
 *   --out=PATH     Write a self-contained HTML file that pre-seeds
 *                  sessionStorage and redirects to "/". The file lives
 *                  OUTSIDE `static/` so it never ships to production.
 *                  Default: print the JS payload to stdout.
 *   --redirect=URL Path to redirect to after seeding. Default: "/".
 *
 * GATING
 *   Refuses to run if NODE_ENV === "production" or if the optional
 *   `VITE_PROD` env var is "true". This is the dev-only contract — the
 *   script can also be wired through a CLI flag from `npm run` that
 *   sets NODE_ENV.
 *
 * NOT A BACKDOOR
 *   The forged session is tab-local (sessionStorage) and only lets you
 *   enter the UI the layout guard unlocks. Server-side fetches still
 *   require real credentials where they exist.
 *
 * AVAILABLE PROFILES
 *   daniel  → profile id "daniel",  hash slot "daniel"
 *   fatma   → profile id "fatma",   hash slot "primary"
 *
 *   Source of truth: src/lib/auth/hash.ts (ProfileId) and
 *   src/lib/auth/session.ts (KNOWN_PROFILES).
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// ---------------------------------------------------------------------------
// Gating — refuse in production. import.meta.env.PROD doesn't exist in a
// plain node script, so we read NODE_ENV + an explicit override flag.
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production' || process.env.VITE_PROD === 'true') {
  console.error(
    '[dev-auth-bypass] REFUSED: NODE_ENV=production / VITE_PROD=true. ' +
      'This script is dev-only and may NOT run in a production build.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Enum — hard-coded mirror of src/lib/auth/hash.ts (ProfileId) and
// src/lib/auth/session.ts (KNOWN_PROFILES). Treat this list as the
// authority if the TS source diverges — both files must agree.
// ---------------------------------------------------------------------------

const PROFILE_TO_SLOT = Object.freeze({
  fatma: 'primary',
  daniel: 'daniel'
});

const KNOWN_PROFILES = Object.freeze(Object.keys(PROFILE_TO_SLOT));

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { profile: null, out: null, redirect: '/' };
  for (const arg of argv) {
    if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
    else if (arg.startsWith('--redirect=')) out.redirect = arg.slice('--redirect='.length);
    else if (!arg.startsWith('--')) out.profile = arg.toLowerCase();
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.profile) {
  console.error(
    `[dev-auth-bypass] missing profile argument.\n` +
      `  usage: node scripts/dev-auth-bypass.mjs <profile> [--out=PATH] [--redirect=URL]\n` +
      `  known: ${KNOWN_PROFILES.join(', ')}`
  );
  process.exit(2);
}

if (!KNOWN_PROFILES.includes(args.profile)) {
  console.error(
    `[dev-auth-bypass] REJECTED profile "${args.profile}".\n` +
      `  allowed values (must come from internal enum, not arbitrary strings):\n` +
      KNOWN_PROFILES.map((p) => `    - ${p}`).join('\n') +
      `\n  Source: src/lib/auth/hash.ts → ProfileId.`
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Build the session payload. Shape MUST match `Session` in
// src/lib/auth/session.ts:
//   { unlocked: true, profile: ProfileId, method: HashSlot, unlockedAt: number }
// The key MUST match the `${SESSION_KEY_PREFIX}-${profile}` pattern.
// ---------------------------------------------------------------------------

const SESSION_KEY_PREFIX = 'presuntinho-session';

const profile = args.profile;
const slot = PROFILE_TO_SLOT[profile];
const sessionKey = `${SESSION_KEY_PREFIX}-${profile}`;
const sessionValue = {
  unlocked: true,
  profile,
  method: slot,
  unlockedAt: Date.now()
};

// ---------------------------------------------------------------------------
// Payload — JSON the auditor can paste into DevTools, plus an optional
// HTML file that pre-seeds and redirects.
// ---------------------------------------------------------------------------

const setItemJs =
  `try { sessionStorage.setItem(${JSON.stringify(sessionKey)}, ${JSON.stringify(
    JSON.stringify(sessionValue)
  )}); }` +
  ` catch (e) { console.error('seed failed', e); }`;

const html = `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <title>dev-auth-bypass · ${profile}</title>
  <meta name="robots" content="noindex" />
</head>
<body>
  <p>Seeding dev session for <strong>${profile}</strong>…</p>
  <script>${setItemJs}location.replace(${JSON.stringify(args.redirect)});</script>
</body>
</html>
`;

console.log(
  `[dev-auth-bypass] profile=${profile} slot=${slot} ` +
    `sessionStorage key=${sessionKey} unlockedAt=${sessionValue.unlockedAt}`
);

// Always print the JS one-liner so the auditor can paste it into DevTools
// without depending on a HTML file.
console.log('\n--- paste into DevTools console ---\n');
console.log(setItemJs);
console.log('\n--- end ---\n');

if (args.out) {
  const outPath = resolve(args.out);
  writeFileSync(outPath, html, 'utf8');
  console.log(`[dev-auth-bypass] wrote HTML seeder → ${outPath}`);
  console.log(`[dev-auth-bypass] open it in a browser tab and you will be redirected to ${args.redirect}`);
}

console.log('[dev-auth-bypass] done.');
