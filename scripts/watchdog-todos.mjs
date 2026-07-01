#!/usr/bin/env node
/**
 * watchdog-todos.mjs — Persistência do Watchdog Presuntinho (task-037).
 *
 * CLI para gerir .state/watchdog-todos.json.
 *   node scripts/watchdog-todos.mjs --add '<text>' --sev HIGH --category i18n --source 'msg=47231,session=presuntinho-2026-07-01'
 *   node scripts/watchdog-todos.mjs --close <id> --sha <sha>
 *   node scripts/watchdog-todos.mjs --list open|closed|all
 *   node scripts/watchdog-todos.mjs --query '<keyword>'
 *
 * Exit codes:
 *   0  success
 *   1  erro de uso / flag inválida
 *   2  id inválido
 *   3  JSON corrompido
 *
 * Standalone Node 18+ — só fs + path (sem deps externos).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..');
const STATE_DIR  = join(REPO_ROOT, '.state');
const STATE_FILE = join(STATE_DIR, 'watchdog-todos.json');

const VALID_SEVS      = new Set(['HIGH', 'MED', 'LOW']);
const VALID_CATEGORIES = new Set(['i18n', 'nav', 'a11y', 'data', 'build', 'ux', 'pipeline', 'content']);

// Watchlist para o --query (case-insensitive, accents normalizados depois).
const WATCHLIST = [
  'quero que', 'faz', 'falta', 'não tem nada', 'traduz',
  'botão coração', 'lições', 'aulas', 'finanças', 'hábitos',
  'trabalhos', 'i18n', 'PT-leak'
];

// ---------- IO helpers ----------------------------------------------------

function ensureStateFile() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) {
    const empty = { openItems: [], closedItems: [], nextCounter: 1 };
    writeFileSync(STATE_FILE, JSON.stringify(empty, null, 2) + '\n', 'utf8');
    return empty;
  }
  let raw;
  try {
    raw = readFileSync(STATE_FILE, 'utf8');
  } catch (e) {
    err(`Erro a ler ${STATE_FILE}: ${e.message}`);
    process.exit(3);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    err(`JSON corrompido em ${STATE_FILE}: ${e.message}`);
    process.exit(3);
  }
  // Migração suave: garantir estrutura nova sem reescrever ficheiro existente.
  if (!Array.isArray(parsed.openItems))   parsed.openItems   = [];
  if (!Array.isArray(parsed.closedItems)) parsed.closedItems = [];
  if (typeof parsed.nextCounter !== 'number' || parsed.nextCounter < 1) {
    // Derivar counter do maior id existente.
    let max = 0;
    const re = /^gap-(\d+)$/;
    for (const it of [...parsed.openItems, ...parsed.closedItems]) {
      if (typeof it?.id === 'string') {
        const m = it.id.match(re);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
    }
    parsed.nextCounter = max + 1;
  }
  return parsed;
}

function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (e) {
    err(`Erro a escrever ${STATE_FILE}: ${e.message}`);
    process.exit(1);
  }
}

// ---------- helpers de output --------------------------------------------

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = USE_COLOR ? C : { red: s=>s, green: s=>s, yellow: s=>s, dim: s=>s };

function err(msg)  { console.error(c.red(`✗ ${msg}`)); }
function ok(msg)   { console.log(c.green(`✓ ${msg}`)); }
function info(msg) { console.log(msg); }

function stripAccents(s) {
  return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
}

// ---------- CLI parse -----------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function parseSource(spec) {
  // Formato: msg=47231,session=presuntinho-2026-07-01
  if (typeof spec !== 'string') return { sessionId: 'unknown', msgId: 'unknown' };
  const out = { sessionId: 'unknown', msgId: 'unknown' };
  for (const part of spec.split(',')) {
    const [k, v] = part.split('=').map(s => (s ?? '').trim());
    if (k === 'msg' || k === 'msgId')     out.msgId     = v || 'unknown';
    if (k === 'session' || k === 'sessionId') out.sessionId = v || 'unknown';
  }
  return out;
}

function validateId(id) {
  if (typeof id !== 'string' || !/^gap-\d+$/.test(id)) {
    err(`ID inválido: "${id}". Esperado formato gap-<n>.`);
    return false;
  }
  return true;
}

// ---------- sub-comandos --------------------------------------------------

function cmdAdd(state, args) {
  const text = args.add;
  if (!text || typeof text !== 'string' || !text.trim()) {
    err('--add requer texto não vazio.');
    process.exit(1);
  }
  const sev = (args.sev || 'MED').toUpperCase();
  if (!VALID_SEVS.has(sev)) {
    err(`--sev inválido: "${args.sev}". Esperado HIGH|MED|LOW.`);
    process.exit(1);
  }
  const category = (args.category || 'content').toLowerCase();
  if (!VALID_CATEGORIES.has(category)) {
    err(`--category inválido: "${args.category}". Esperado uma de: ${[...VALID_CATEGORIES].join('|')}.`);
    process.exit(1);
  }
  const source = parseSource(args.source);
  const id = `gap-${state.nextCounter}`;
  const item = {
    id,
    sev,
    category,
    source,
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  state.openItems.push(item);
  state.nextCounter += 1;
  saveState(state);
  ok(`Adicionado ${c.yellow(id)} [${sev}/${category}]`);
  info(JSON.stringify(item, null, 2));
}

function cmdClose(state, args) {
  const id = args.close;
  if (!validateId(id)) process.exit(2);
  const idx = state.openItems.findIndex(i => i.id === id);
  if (idx === -1) {
    err(`${id} não está em openItems.`);
    process.exit(2);
  }
  const sha = typeof args.sha === 'string' ? args.sha : null;
  const item = { ...state.openItems[idx], closedAt: new Date().toISOString() };
  if (sha) item.commitSha = sha;
  state.openItems.splice(idx, 1);
  state.closedItems.push(item);
  saveState(state);
  ok(`Fechado ${c.yellow(id)}${sha ? ` @ ${sha.slice(0, 7)}` : ''}.`);
}

function cmdList(state, args) {
  const mode = (args.list || 'all').toString().toLowerCase();
  let items;
  if (mode === 'open')        items = state.openItems;
  else if (mode === 'closed') items = state.closedItems;
  else if (mode === 'all')    items = [...state.openItems, ...state.closedItems];
  else {
    err(`--list inválido: "${mode}". Esperado open|closed|all.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ count: items.length, items }, null, 2));
}

function cmdQuery(state, args) {
  const needle = stripAccents(String(args.query || '').toLowerCase().trim());
  if (!needle) {
    err('--query requer keyword não vazia.');
    process.exit(1);
  }
  const all = [...state.openItems, ...state.closedItems];
  // Tokens derivados da watchlist que estão contidos na query (acents-insensitive).
  const watchlistTokens = WATCHLIST
    .map(t => stripAccents(t.toLowerCase()))
    .filter(t => needle.includes(t));
  const matches = all.filter(it => {
    const hay = stripAccents(String(it.text || '').toLowerCase());
    if (hay.includes(needle)) return true;
    for (const tok of watchlistTokens) {
      if (hay.includes(tok)) return true;
    }
    return false;
  });
  console.log(JSON.stringify({ query: args.query, matches: matches.length, items: matches }, null, 2));
}

// ---------- main ----------------------------------------------------------

function usage() {
  info(`Uso:
  node scripts/watchdog-todos.mjs --add '<texto>' --sev HIGH|MED|LOW --category <cat> --source 'msg=...,session=...'
  node scripts/watchdog-todos.mjs --close <gap-id> --sha <commit-sha>
  node scripts/watchdog-todos.mjs --list [open|closed|all]
  node scripts/watchdog-todos.mjs --query '<keyword>'
  node scripts/watchdog-todos.mjs --prune <gap-id> [<gap-id>...]

Categorias válidas: i18n|nav|a11y|data|build|ux|pipeline|content
`);
}

function cmdPrune(state, args) {
  // Remove items de openItems/closedItems pelo id. Usado para limpar dados de teste.
  // Aceita múltiplos --prune <id> ou um único valor.
  const ids = Array.isArray(args.prune) ? args.prune : [args.prune];
  if (ids.length === 0 || !ids[0]) {
    err('--prune requer pelo menos um id.');
    process.exit(1);
  }
  let removed = 0;
  for (const raw of ids) {
    if (!validateId(raw)) process.exit(2);
    const oi = state.openItems.findIndex(i => i.id === raw);
    if (oi !== -1) { state.openItems.splice(oi, 1); removed += 1; ok(`Removido ${raw} de openItems.`); continue; }
    const ci = state.closedItems.findIndex(i => i.id === raw);
    if (ci !== -1) { state.closedItems.splice(ci, 1); removed += 1; ok(`Removido ${raw} de closedItems.`); continue; }
    warn(`${raw} não encontrado.`);
  }
  // Resetar counter se vazio.
  if (state.openItems.length === 0 && state.closedItems.length === 0) {
    state.nextCounter = 1;
  }
  saveState(state);
  ok(`Prune: ${removed} removidos.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) { usage(); process.exit(0); }
  if (args._.length && !args.add && !args.close && !args.list && !args.query && !args.prune) {
    err(`Argumento posicional inesperado: ${args._.join(' ')}`);
    usage();
    process.exit(1);
  }

  const state = ensureStateFile();

  if (args.add)    return cmdAdd(state, args);
  if (args.close)  return cmdClose(state, args);
  if (args.list)   return cmdList(state, args);
  if (args.query)  return cmdQuery(state, args);
  if (args.prune)  return cmdPrune(state, args);

  // Sem sub-comando: imprime resumo.
  const high = state.openItems.filter(i => i.sev === 'HIGH').length;
  const med  = state.openItems.filter(i => i.sev === 'MED').length;
  const low  = state.openItems.filter(i => i.sev === 'LOW').length;
  info(`N=${state.openItems.length} open (HIGH:${high} MED:${med} LOW:${low}) · M=${state.closedItems.length} closed · counter=${state.nextCounter}`);
  usage();
}

try {
  main();
} catch (e) {
  err(`Excepção não tratada: ${e.stack || e.message || e}`);
  process.exit(1);
}
