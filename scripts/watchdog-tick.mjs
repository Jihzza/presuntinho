#!/usr/bin/env node
/**
 * watchdog-tick.mjs — Orquestrador do Watchdog Presuntinho (task-037).
 *
 * Faz UMA auditoria leve por tick:
 *   1. Chama scripts/audit-i18n.py (se existir) — recolhe paridade 5-way.
 *   2. Scan PT-leak via regex nos src/routes/** e src/lib/** (.svelte/.ts).
 *   3. Lê tasks.html e conta tasks com data-status='open'/'in_progress' sem
 *      bloco .exec (heurística rápida de pendentes).
 *   4. Reconcilia com .state/watchdog-todos.json: items que já não aparecem
 *      nos scans viram closed (commitSha pode ser null).
 *   5. Imprime resumo e exit 0 (mesmo com warnings de scans parciais).
 *
 * NÃO inventa gaps — só regista scans REAIS.
 * Standalone Node 18+ — só fs + path (sem deps externos).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..');
const STATE_DIR  = join(REPO_ROOT, '.state');
const STATE_FILE = join(STATE_DIR, 'watchdog-todos.json');
const AUDIT_PY   = join(REPO_ROOT, 'scripts', 'audit-i18n.py');
const TASKS_HTML = process.env.WATCHDOG_TASKS_HTML
  || join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local'),
          'hermes', 'presuntinho-pipeline', 'tasks.html');

const PT_LEAK = /[áàéêíóôúçãõÁÀÉÊÍÓÔÚÇÃÕ]/g;
const SCAN_EXTS = new Set(['.svelte', '.ts']);
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', '.state']);

const VALID_SEVS      = new Set(['HIGH', 'MED', 'LOW']);
const VALID_CATEGORIES = new Set(['i18n', 'nav', 'a11y', 'data', 'build', 'ux', 'pipeline', 'content']);

const C = {
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow:(s) => `\x1b[33m${s}\x1b[0m`,
  cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[0m`,
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
};
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = USE_COLOR ? C : new Proxy({}, { get: (_, k) => (s) => s });

const warn = (m) => console.error(c.yellow(`⚠ ${m}`));
const ok   = (m) => console.log(c.green(`✓ ${m}`));

// ---------- IO ------------------------------------------------------------

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { openItems: [], closedItems: [], nextCounter: 1, lastUpdated: null };
  }
  const raw = readFileSync(STATE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.openItems))   parsed.openItems   = [];
  if (!Array.isArray(parsed.closedItems)) parsed.closedItems = [];
  if (typeof parsed.nextCounter !== 'number' || parsed.nextCounter < 1) {
    let max = 0;
    for (const it of [...parsed.openItems, ...parsed.closedItems]) {
      if (typeof it?.id === 'string') {
        const m = it.id.match(/^gap-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
    }
    parsed.nextCounter = max + 1;
  }
  return parsed;
}

function saveState(state) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ---------- file walker ---------------------------------------------------

function* walkFiles(root) {
  // DFS manual, sem deps.
  function* recurse(dir) {
    let entries;
    try {
      entries = readdirSyncSafe(dir);
    } catch (e) {
      warn(`Não consegui ler ${dir}: ${e.message}`);
      return;
    }
    for (const ent of entries) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = join(dir, ent.name);
      let st;
      try { st = statSyncSafe(full); } catch { continue; }
      if (st.isDirectory()) {
        yield* recurse(full);
      } else if (st.isFile()) {
        yield full;
      }
    }
  }
  yield* recurse(root);
}

// Lazy require para fs.stat/readdir (evita top-level cost).
import { statSync, readdirSync } from 'node:fs';
function statSyncSafe(p)   { return statSync(p); }
function readdirSyncSafe(p) { return readdirSync(p, { withFileTypes: true }); }

// ---------- scans ---------------------------------------------------------

function scanPTLeak(root) {
  const hits = [];
  if (!existsSync(root)) return hits;
  for (const file of walkFiles(root)) {
    const ext = file.slice(file.lastIndexOf('.'));
    if (!SCAN_EXTS.has(ext)) continue;
    let content;
    try { content = readFileSync(file, 'utf8'); } catch (e) { continue; }
    const matches = content.match(PT_LEAK);
    if (matches && matches.length > 0) {
      hits.push({ file: relative(REPO_ROOT, file).split(sep).join('/'), hits: matches.length });
    }
  }
  return hits;
}

function runI18nAudit() {
  if (!existsSync(AUDIT_PY)) {
    warn(`audit-i18n.py não encontrado em ${AUDIT_PY} — pulando.`);
    return null;
  }
  // Tenta python3 depois python.
  const cmds = [];
  if (process.env.PYTHON)        cmds.push(process.env.PYTHON);
  cmds.push('python3', 'python');
  let lastErr = null;
  for (const py of cmds) {
    try {
      const r = spawnSync(py, [AUDIT_PY], { encoding: 'utf8', cwd: REPO_ROOT });
      if (r.status === 0 && r.stdout) {
        return { python: py, stdout: r.stdout, stderr: r.stderr || '' };
      }
      lastErr = `${py} falhou (status=${r.status}): ${(r.stderr || '').split('\n').slice(0, 3).join(' | ')}`;
    } catch (e) {
      lastErr = `${py} não correu: ${e.message}`;
    }
  }
  warn(`audit-i18n.py não correu em nenhum interpreter (${lastErr || 'sem python?'}).`);
  return null;
}

function scanTasksHtml() {
  if (!existsSync(TASKS_HTML)) {
    warn(`tasks.html não existe em ${TASKS_HTML} — pulando.`);
    return { open: [], inProgress: [], source: TASKS_HTML };
  }
  const html = readFileSync(TASKS_HTML, 'utf8');
  // Heurística: blocos <div ... class="task status-XXX" id="task-NNN" ...> ... </div>
  // Captura greedy até ao próximo "task status-" ou </main>.
  // Para simplicidade, dividimos por '<div class="task' (e variações) e olhamos o header.
  const blocks = html.split(/<div\s+class="task\s+status-/).slice(1);
  const open = [];
  const inProgress = [];
  const cancelled = [];
  const done = [];
  for (const chunk of blocks) {
    const head = chunk.slice(0, 600);
    const idMatch = head.match(/id="(task-\d+)"/);
    const id = idMatch ? idMatch[1] : 'task-?';
    const statusMatch = head.match(/data-status="(\w+)"/);
    const status = statusMatch ? statusMatch[1] : head.match(/status-(\w+)/)?.[1] || 'unknown';
    // Pula se o bloco na verdade é o "done" (tem <div class="exec"> recente) — heurística simples.
    const hasExec = /<div class="exec">/.test(chunk.split('</div>').slice(0, 8).join('</div>'));
    if (status === 'open')        open.push({ id, hasExec });
    else if (status === 'in_progress') inProgress.push({ id, hasExec });
    else if (status === 'cancelled')   cancelled.push({ id });
    else if (status === 'done')        done.push({ id });
  }
  return { open, inProgress, cancelled, done, source: TASKS_HTML };
}

// ---------- reconcile -----------------------------------------------------

function ensureItem(state, partial) {
  // partial: { text, category, sev, source }
  const exists = [...state.openItems, ...state.closedItems]
    .find(i => i.text === partial.text && i.category === partial.category);
  if (exists) return { item: exists, created: false };
  const id = `gap-${state.nextCounter}`;
  const item = {
    id,
    sev: partial.sev,
    category: partial.category,
    source: partial.source,
    text: partial.text,
    createdAt: new Date().toISOString()
  };
  state.openItems.push(item);
  state.nextCounter += 1;
  return { item, created: true };
}

function reconcile(state, scanKeys) {
  // Set de assinaturas (text + category) actualmente abertas.
  const openSignatures = new Set(
    state.openItems.map(i => `${i.category}::${i.text}`)
  );
  // Items abertos cujas assinaturas já não aparecem nos scans → close.
  let autoClosed = 0;
  state.openItems = state.openItems.filter(i => {
    const sig = `${i.category}::${i.text}`;
    if (scanKeys.has(sig)) return true; // ainda visível → mantém
    autoClosed += 1;
    state.closedItems.push({
      ...i,
      closedAt: new Date().toISOString()
      // commitSha omitido (não temos commit local)
    });
    return false;
  });
  return { autoClosed };
}

// ---------- main ----------------------------------------------------------

function main() {
  console.log(c.bold(c.cyan(`\n🐽 watchdog-tick — ${new Date().toISOString()}\n`)));

  const state = loadState();
  const scanKeys = new Set(); // assinaturas (category::text) detectadas nos scans

  // 1) i18n audit
  console.log(c.bold('[1/3] audit-i18n.py'));
  const i18n = runI18nAudit();
  if (i18n) {
    const lines = i18n.stdout.trim().split('\n');
    // Extrair 5-way intersection + missing por locale.
    const intersect = lines.find(l => l.startsWith('5-way intersection:')) || '';
    const missing = {};
    for (const l of lines) {
      const m = l.match(/^Missing in (\w+): (\d+)$/);
      if (m) missing[m[1]] = parseInt(m[2], 10);
    }
    console.log(`  ${c.dim(intersect)}`);
    if (Object.keys(missing).length) {
      for (const [k, v] of Object.entries(missing)) {
        if (v > 0) console.log(`  ${c.yellow(`Missing in ${k}: ${v}`)}`);
      }
      const totalMissing = Object.values(missing).reduce((a, b) => a + b, 0);
      if (totalMissing > 0) {
        const text = `i18n parity: ${totalMissing} keys em falta (${Object.entries(missing).filter(([,v]) => v > 0).map(([k,v]) => `${k}=${v}`).join(', ')})`;
        const { item, created } = ensureItem(state, {
          text, sev: 'HIGH', category: 'i18n',
          source: { sessionId: 'watchdog-tick', msgId: 'auto-i18n' }
        });
        if (created) ok(`Registo automático: ${c.yellow(item.id)} [HIGH/i18n]`);
        scanKeys.add(`i18n::${text}`);
      }
    } else {
      ok('i18n parity 100% (5-way).');
    }
  }

  // 2) PT-leak scan
  console.log(c.bold('[2/3] PT-leak scan'));
  const routesHits = scanPTLeak(join(REPO_ROOT, 'src', 'routes'));
  const libHits    = scanPTLeak(join(REPO_ROOT, 'src', 'lib'));
  const allHits = [...routesHits, ...libHits];
  const totalHits = allHits.reduce((acc, h) => acc + h.hits, 0);
  const topFiles = [...allHits].sort((a, b) => b.hits - a.hits).slice(0, 5);
  console.log(`  ${allHits.length} ficheiros com PT-hardcoded, ${totalHits} hits totais.`);
  for (const f of topFiles) console.log(`    ${c.dim(f.file)}  ${c.yellow(`${f.hits} hits`)}`);
  if (allHits.length > 0) {
    const text = `PT-leak: ${allHits.length} ficheiros com strings PT-hardcoded (${totalHits} hits)`;
    const { item, created } = ensureItem(state, {
      text, sev: totalHits > 100 ? 'HIGH' : 'MED', category: 'i18n',
      source: { sessionId: 'watchdog-tick', msgId: 'auto-ptleak' }
    });
    if (created) ok(`Registo automático: ${c.yellow(item.id)} [i18n]`);
    scanKeys.add(`i18n::${text}`);
  } else {
    ok('Zero PT-leak detectado.');
  }

  // 3) tasks.html
  console.log(c.bold('[3/3] tasks.html scan'));
  const tasks = scanTasksHtml();
  console.log(`  ${c.dim(`fonte: ${tasks.source}`)}`);
  console.log(`  open=${tasks.open.length}  in_progress=${tasks.inProgress.length}  done=${tasks.done.length}  cancelled=${tasks.cancelled.length}`);
  // Tasks pendentes (open + in_progress sem .exec) — registamos apenas 1 item agregado.
  const pending = [...tasks.open, ...tasks.inProgress].filter(t => !t.hasExec);
  if (pending.length > 0) {
    const text = `tasks.html: ${pending.length} tasks pendentes (open/in_progress) — ${pending.slice(0, 5).map(t => t.id).join(', ')}${pending.length > 5 ? '…' : ''}`;
    const { item, created } = ensureItem(state, {
      text, sev: 'MED', category: 'pipeline',
      source: { sessionId: 'watchdog-tick', msgId: 'auto-tasks' }
    });
    if (created) ok(`Registo automático: ${c.yellow(item.id)} [MED/pipeline]`);
    scanKeys.add(`pipeline::${text}`);
  } else {
    ok('Zero tasks pendentes em tasks.html.');
  }

  // 4) Reconcile
  console.log(c.bold('[4/4] reconcile'));
  const { autoClosed } = reconcile(state, scanKeys);
  if (autoClosed > 0) ok(`Auto-fechados ${autoClosed} items (já não aparecem nos scans).`);
  else console.log(`  ${c.dim('Nada a auto-fechar.')}`);

  // 5) Persist + resumo
  state.lastUpdated = new Date().toISOString();
  saveState(state);

  const high = state.openItems.filter(i => i.sev === 'HIGH').length;
  const med  = state.openItems.filter(i => i.sev === 'MED').length;
  const low  = state.openItems.filter(i => i.sev === 'LOW').length;
  console.log(c.bold('\n=== RESUMO ==='));
  console.log(`  ${state.openItems.length} open (HIGH:${high} MED:${med} LOW:${low})`);
  console.log(`  ${state.closedItems.length} closed`);
  console.log(`  ${scanKeys.size} assinaturas reportadas pelos scans`);
  console.log(c.dim(`\n  state: ${STATE_FILE}`));
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(c.red(`✗ Excepção não tratada: ${e.stack || e.message || e}`));
  process.exit(1);
}
