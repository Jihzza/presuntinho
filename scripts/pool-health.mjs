#!/usr/bin/env node
/**
 * pool-health.mjs — Valida os 12 perfis locais do pipeline Presuntinho.
 *
 * Referencia: plan phase-m5-multi-pool-expansion-msg-76671-76963
 * Item 1/5 da expansao do pool M5.
 *
 * Para cada perfil reporta 4 sinais:
 *   alive    — gateway.pid presente + parseavel + processo vivo
 *   worktree — existe .worktrees/<safe-name> (opcional, NAO criar)
 *   cron     — `hermes --profile <p> cron status` parseavel
 *   sqlite   — state.db existe e mtime < 24h
 *
 * Score = alive + worktree + cron + sqlite (0..4).
 *
 * Uso:
 *   node scripts/pool-health.mjs          # tabela humana, exit 0/1
 *   node scripts/pool-health.mjs --json   # JSON com 12 entries
 *   node scripts/pool-health.mjs --watch  # loop a cada 30min ate SIGINT
 *
 * Exit codes:
 *   0 = todos alive=1
 *   1 = pelo menos um perfil alive=0
 *   2 = erro interno (parse/IO)
 *
 * Zero deps. Node 20+ built-ins. Cross-platform (Windows + POSIX).
 */

import { existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

// ----------------------------------------------------------------- constants

const PROFILES = Object.freeze([
  'skander1', 'skander2',
  'piccolo', 'piccolo1', 'piccolo2',
  'krillin', 'krillin1', 'krillin2',
  'vegeta', 'f0probe', 'presuntinho',
  'central-mensageiros',
]);

// HERMES_HOME e' injectado pelo runtime do agente (contexto skander2); nao usamos.
// Os 12 perfis vivem SEMPRE em %LOCALAPPDATA%\hermes\profiles (raiz do Hermes
// Gateway multi-perfil). Em Windows usamos LOCALAPPDATA; em POSIX assumimos
// XDG_DATA_HOME ou ~/.local/share/hermes.
const HERMES_HOME = (() => {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA
      || join(homedir(), 'AppData', 'Local');
    return join(base, 'hermes');
  }
  return process.env.XDG_DATA_HOME
    ? join(process.env.XDG_DATA_HOME, 'hermes')
    : join(homedir(), '.local', 'share', 'hermes');
})();

const WORKTREE_ROOT = join(process.cwd(), '.worktrees');

const STALE_MS = 24 * 60 * 60 * 1000;
const WATCH_INTERVAL_MS = 30 * 60 * 1000;

const JSON_MODE = process.argv.includes('--json');
const WATCH_MODE = process.argv.includes('--watch');

// ----------------------------------------------------------------- helpers

/** Sanitiza nome de perfil para uso como nome de diretorio (defesa em profundidade). */
function safeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

function profileDir(name) {
  return join(HERMES_HOME, 'profiles', name);
}

function profilePidFile(name) {
  return join(profileDir(name), 'gateway.pid');
}

function profileStateDb(name) {
  return join(profileDir(name), 'state.db');
}

function worktreeDir(name) {
  return join(WORKTREE_ROOT, safeName(name));
}

/** Verifica se um PID existe no OS. Windows: tasklist /fi "PID eq N". POSIX: kill -0. */
function pidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'tasklist',
        ['/fi', `PID eq ${pid}`, '/nh', '/fo', 'csv'],
        { encoding: 'utf8', windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const txt = String(out || '').trim();
      if (!txt) return false;
      // tasklist devolve "INFO: No tasks are running..." quando vazio
      if (/^INFO:/i.test(txt)) return false;
      // CSV formato: "name.exe","pid","session",... — match tolerante a aspas
      return new RegExp(`"${pid}"`).test(txt);
    }
    execFileSync('kill', ['-0', String(pid)], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Lê gateway.pid e tenta extrair PID (suporta JSON {pid,...} ou texto simples). */
function readGatewayPid(name) {
  const pidFile = profilePidFile(name);
  if (!existsSync(pidFile)) return { ok: false, reason: 'no gateway.pid' };
  let raw;
  try {
    raw = readFileSync(pidFile, 'utf8').trim();
  } catch (e) {
    return { ok: false, reason: `read pid: ${e.message}` };
  }
  if (!raw) return { ok: false, reason: 'empty gateway.pid' };

  // 1) JSON shape: {"pid": 47436, "kind": "hermes-gateway", ...}
  try {
    const j = JSON.parse(raw);
    const n = Number(j && j.pid);
    if (Number.isFinite(n) && n > 0) return { ok: true, pid: n };
  } catch {
    // not JSON, tenta texto
  }
  // 2) Texto simples: "47436\n"
  const m = raw.match(/\b(\d{1,9})\b/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return { ok: true, pid: n };
  }
  return { ok: false, reason: 'pid unparseable' };
}

// ----------------------------------------------------------------- checks

function checkAlive(name) {
  const r = readGatewayPid(name);
  if (!r.ok) return { alive: 0, reason: r.reason };
  if (!pidAlive(r.pid)) {
    return { alive: 0, pid: r.pid, reason: `pid ${r.pid} not alive` };
  }
  return { alive: 1, pid: r.pid };
}

function checkWorktree(name) {
  const dir = worktreeDir(name);
  // NAO criar. Apenas verificar existencia (READ-ONLY).
  if (existsSync(dir)) return { worktree: 1, path: dir };
  return { worktree: 0, path: dir };
}

function checkCron(name) {
  try {
    const out = execFileSync(
      'hermes',
      ['--profile', name, 'cron', 'status'],
      {
        encoding: 'utf8',
        shell: false,
        timeout: 10_000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const txt = String(out || '');
    const running = /Gateway is running/i.test(txt);
    const stopped = /Gateway is not running/i.test(txt);
    const noProfile = /does not exist/i.test(txt);
    const parseable = running || stopped || noProfile;
    if (!parseable) return { cron: 0, reason: 'unparseable output' };
    if (noProfile) return { cron: 1, running: 0, no_profile: 1, reason: 'profile not found' };
    return {
      cron: 1,
      running: running ? 1 : 0,
      no_profile: 0,
      reason: running ? 'gateway running' : 'gateway stopped',
    };
  } catch (e) {
    return { cron: 0, reason: `cron error: ${e.message.split('\n')[0]}` };
  }
}

async function checkSqlite(name) {
  const db = profileStateDb(name);
  if (!existsSync(db)) return { sqlite: 0, reason: 'no state.db' };
  try {
    const st = await stat(db);
    const ageMs = Date.now() - st.mtimeMs;
    const ageHours = +(ageMs / 3_600_000).toFixed(1);
    if (ageMs > STALE_MS) {
      return { sqlite: 0, age_hours: ageHours, reason: `stale ${ageHours}h` };
    }
    return { sqlite: 1, age_hours: ageHours };
  } catch (e) {
    return { sqlite: 0, reason: `stat: ${e.message}` };
  }
}

/** Avalia um perfil e devolve objeto normalizado para tabela e JSON. */
async function evaluateProfile(name) {
  const alive = checkAlive(name);
  const worktree = checkWorktree(name);
  const cron = checkCron(name);
  const sqlite = await checkSqlite(name);
  const score = alive.alive + worktree.worktree + cron.cron + sqlite.sqlite;
  return {
    name,
    alive: alive.alive,
    worktree: worktree.worktree,
    cron: cron.cron,
    sqlite: sqlite.sqlite,
    score,
    details: {
      pid: alive.pid ?? null,
      alive_reason: alive.reason ?? null,
      worktree_path: worktree.path,
      cron_running: cron.running ?? null,
      cron_no_profile: cron.no_profile ?? null,
      cron_reason: cron.reason,
      sqlite_age_hours: sqlite.age_hours ?? null,
      sqlite_reason: sqlite.reason ?? null,
    },
  };
}

// ----------------------------------------------------------------- render

const SYM = { ok: '\u2713', no: '\u25CF' };

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function renderTable(rows) {
  // Cabecalhos + colunas alinhadas. Largura alvo <= 80 chars/linha.
  const cols = [
    { key: 'name', title: 'PROFILE', width: 22 },
    { key: 'alive', title: 'ALIVE', width: 5 },
    { key: 'worktree', title: 'WORK', width: 5 },
    { key: 'cron', title: 'CRON', width: 5 },
    { key: 'sqlite', title: 'SQL', width: 5 },
    { key: 'score', title: 'SCORE', width: 6 },
    { key: 'notes', title: 'NOTES', width: 30 },
  ];
  const lines = [];
  lines.push(cols.map((c) => pad(c.title, c.width)).join(' '));
  lines.push(cols.map((c) => '-'.repeat(c.width)).join(' '));
  for (const r of rows) {
    const notes = [
      r.details.cron_reason,
      r.details.alive_reason,
      r.details.sqlite_reason,
    ].filter(Boolean).slice(0, 2).join(' | ');
    const cell = (k, v) => {
      const sym = v ? SYM.ok : SYM.no;
      return pad(`${sym} ${v}`, cols.find((c) => c.key === k).width);
    };
    lines.push([
      pad(r.name, 22),
      cell('alive', r.alive),
      cell('worktree', r.worktree),
      cell('cron', r.cron),
      cell('sqlite', r.sqlite),
      pad(`${r.score}/4`, 6),
      pad(notes || '-', 30),
    ].join(' '));
  }
  return lines.join('\n');
}

function renderJson(rows) {
  return JSON.stringify(
    {
      ts: new Date().toISOString(),
      profiles: rows.map((r) => ({
        name: r.name,
        alive: r.alive,
        worktree: r.worktree,
        cron: r.cron,
        sqlite: r.sqlite,
        score: r.score,
      })),
    },
    null,
    2,
  ) + '\n';
}

// ----------------------------------------------------------------- main

async function runOnce() {
  // Garante 12 entries mesmo que uma avaliacao lance — avaliacao defensiva.
  const rows = [];
  for (const name of PROFILES) {
    try {
      rows.push(await evaluateProfile(name));
    } catch (e) {
      console.error(`[pool-health] evaluate ${name} falhou: ${e.message}`);
      rows.push({
        name,
        alive: 0,
        worktree: 0,
        cron: 0,
        sqlite: 0,
        score: 0,
        details: {
          pid: null,
          alive_reason: e.message,
          worktree_path: worktreeDir(name),
          cron_running: null,
          cron_no_profile: null,
          cron_reason: 'evaluation crashed',
          sqlite_age_hours: null,
          sqlite_reason: null,
        },
      });
    }
  }
  return rows;
}

function exitForRows(rows) {
  return rows.every((r) => r.alive === 1) ? 0 : 1;
}

async function main() {
  let rows;
  try {
    rows = await runOnce();
  } catch (e) {
    console.error('[pool-health] erro interno:', e);
    if (JSON_MODE) {
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), error: e.message, profiles: [] }) + '\n');
    }
    process.exit(2);
  }

  if (WATCH_MODE) {
    const tick = async () => {
      const fresh = await runOnce();
      const out = JSON_MODE ? renderJson(fresh) : renderTable(fresh) + '\n';
      process.stdout.write(out);
      process.exit(exitForRows(fresh));
    };
    await tick();
    const id = setInterval(tick, WATCH_INTERVAL_MS);
    const stop = () => { clearInterval(id); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }

  const out = JSON_MODE ? renderJson(rows) : renderTable(rows) + '\n';
  process.stdout.write(out);
  process.exit(exitForRows(rows));
}

main();
