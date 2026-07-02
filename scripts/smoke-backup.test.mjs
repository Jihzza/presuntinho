import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const backup = readFileSync(join(ROOT, 'src/lib/backup.ts'), 'utf8');
const db = readFileSync(join(ROOT, 'src/lib/state/db.ts'), 'utf8');
const settings = readFileSync(join(ROOT, 'src/routes/definicoes/+page.svelte'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

console.log('=== smoke: backup/import ===');

const tableMatch = backup.match(/export const BACKUP_TABLES = \[([\s\S]*?)\] as const;/);
const backupTables = tableMatch
  ? [...tableMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

for (const table of [
  'state', 'settings', 'badges', 'visited', 'quizScores', 'secrets',
  'transacoes', 'orcamentos', 'categorias', 'habitos', 'habit_logs',
  'biblioteca', 'notes', 'chat_messages', 'assignments'
]) {
  check(`BACKUP_TABLES includes ${table}`, backupTables.includes(table));
  check(`db declares table ${table}`, new RegExp(`${table}!: Table<`).test(db));
}

check('BACKUP_VERSION is current v6+', /BACKUP_VERSION\s*=\s*6/.test(backup));
check('validateBackup exported', /export function validateBackup/.test(backup));
check('downloadBackup exported', /export async function downloadBackup/.test(backup));
check('importBackup supports merge|replace', /mode: 'merge' \| 'replace' = 'replace'/.test(backup));
check('importBackup refuses empty payloads', backup.includes('empty_payload'));
check('merge mode counts replaced rows before bulkPut', backup.includes("mode === 'merge'") && backup.includes("where('id').anyOf"));
check('missing PK rows are skipped', backup.includes('hasPrimaryKey') && backup.includes('skippedCount++'));
check('sessionStorage restore is allowlisted', backup.includes('BACKUP_SESSION_KEYS') && backup.includes('includes(k)'));
check('Definições shows merge/replace selector', settings.includes('settings.backup.import_mode_label') && settings.includes("setImportMode('merge')"));
check('Definições previews backup table counts', settings.includes('TABLE_LABELS') && settings.includes('settings.backup.tables_label'));
check('Definições uses typed BackupError messages', settings.includes('e instanceof BackupError') && settings.includes('settings.backup.errors.'));

const locales = ['pt-PT', 'en', 'fr', 'ar', 'tn'];
const requiredKeys = [
  'settings.backup.export.done',
  'settings.backup.tables_label',
  'settings.backup.import_mode_label',
  'settings.backup.import_mode.merge',
  'settings.backup.import_mode.merge_help',
  'settings.backup.import_mode.replace',
  'settings.backup.import_mode.replace_help',
  'settings.backup.import_mode.merge_button',
  'settings.backup.import_mode.replace_button',
  'settings.backup.import.report',
  'settings.backup.error.export_failed',
  'settings.backup.errors.parse_failed',
  'settings.backup.errors.shape_invalid',
  'settings.backup.errors.too_old',
  'settings.backup.errors.empty_payload',
  'settings.backup.errors.browser_only',
  'settings.backup.errors.file_missing',
  'settings.backup.errors.read_failed',
  'settings.backup.errors.import_failed',
  ...backupTables.map((t) => `settings.backup.tables.${t}`)
];
for (const loc of locales) {
  const dict = JSON.parse(readFileSync(join(ROOT, `src/lib/i18n/${loc}.json`), 'utf8'));
  for (const key of requiredKeys) {
    check(`i18n[${loc}] ${key}`, Object.prototype.hasOwnProperty.call(dict, key));
  }
}

console.log(`\n=== Result: ${passed}/${passed + failed} PASS ===`);
process.exit(failed === 0 ? 0 : 1);
