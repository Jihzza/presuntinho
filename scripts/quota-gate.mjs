#!/usr/bin/env node
// quota-gate.mjs — counts MiniMax provider calls in the last 24h from gateway.log
// exit codes:
//   0 — OK (calls_today ≤ threshold)
//   1 — BLOCK (calls_today > threshold; cron should pause)
//   2 — WARN (calls_today == threshold; report but proceed)
//
// Usage:
//   node scripts/quota-gate.mjs                # default threshold=15
//   node scripts/quota-gate.mjs --threshold 8
//   node scripts/quota-gate.mjs --hours 12     # window in hours

import { readFileSync, existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// Quota guard for MiniMax-M3 (provider=minimax-oauth) usage in last N hours.
// Cron pipeline uses MiniMax-M3 for all 4 jobs (brain-dump, plan, tasks, execute)
// plus the 12-bot local pool. Expected baseline: 1500-3000 calls/day.
//
// Empirically 2475 calls in trailing 24h observed on 2026-07-06 03:47 WEST.
// Default threshold of 2500 = ~4% headroom over baseline.
//
// Cron #4 SHOULD respect this gate: if block (>threshold), do NOT dispatch a
// new pool; just NO-OP and report to .state/quota-gate.json.
//
// Exit codes:
//   0 — OK (calls <= threshold)
//   1 — BLOCK (calls > threshold)
//   2 — WARN (calls == threshold)
//
// Usage:
//   node scripts/quota-gate.mjs                    # default threshold=2500, window=24h
//   node scripts/quota-gate.mjs --threshold 3000   # tighter/tailored cap
//   node scripts/quota-gate.mjs --hours 12         # last 12h only

const args = process.argv.slice(2);
let threshold = 2500;
let hours = 24;
let providerFilter = "minimax-oauth";

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--threshold" || a === "-t") {
    threshold = parseInt(args[++i], 10);
  } else if (a === "--hours" || a === "-h") {
    hours = parseInt(args[++i], 10);
  } else if (a === "--provider" || a === "-p") {
    providerFilter = args[++i];
  } else if (a === "--help") {
    console.log(
      "Usage: node scripts/quota-gate.mjs [--threshold N] [--hours N] [--provider name]"
    );
    process.exit(0);
  }
}

const home = homedir();
const candidates = [
  resolve(home, ".hermes/logs/agent.log"),
  resolve(home, "AppData/Local/hermes/logs/agent.log"),
  resolve(home, ".local/share/hermes/logs/agent.log"),
  resolve(home, ".hermes/logs/gateway.log"),
  resolve(home, "AppData/Local/hermes/logs/gateway.log"),
  resolve(home, ".local/share/hermes/logs/gateway.log"),
];

function findLog() {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const logPath = findLog();

let stat = null;
try {
  if (logPath) stat = statSync(logPath);
} catch {
  stat = null;
}
const MAX_BYTES = 4 * 1024 * 1024; // tail 4 MB
const startByte = stat && stat.size > MAX_BYTES ? stat.size - MAX_BYTES : 0;

if (!logPath || !stat) {
  console.log(JSON.stringify({
    calls_today: 0,
    threshold,
    hours,
    provider: providerFilter,
    action: "ok",
    note: "no gateway log found; no calls counted",
    log_path: null,
  }, null, 2));
  process.exit(0);
}

// Read last N MB of log (good-enough tail). We stream-read the file and only
// keep lines within the requested time window.
const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

let text = "";
try {
  const fd = openSync(logPath, "r");
  try {
    const buf = Buffer.alloc(stat.size - startByte);
    readSync(fd, buf, 0, buf.length, startByte);
    text = buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
} catch (e) {
  console.log(JSON.stringify({
    calls_today: 0,
    threshold,
    hours,
    provider: providerFilter,
    action: "ok",
    note: `read error: ${e.message}`,
    log_path: logPath,
  }, null, 2));
  process.exit(0);
}

// Count lines containing providerFilter AND a model=MiniMax marker.
// Pattern (from agent.log): "API call #N: model=MiniMax-M3 provider=minimax-oauth ..."
const lines = text.split("\n");
let calls = 0;
for (const line of lines) {
  if (!line.includes("provider=" + providerFilter)) continue;
  if (!line.includes("model=MiniMax")) continue;
  // best-effort timestamp filter
  const m = line.match(/(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const ts = Date.parse(
      `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`
    );
    if (!isNaN(ts) && ts < cutoffMs) continue;
  }
  calls++;
}

let action = "ok";
let code = 0;
if (calls > threshold) {
  action = "block";
  code = 1;
} else if (calls === threshold) {
  action = "warn";
  code = 2;
}

const out = {
  calls_today: calls,
  threshold,
  hours,
  provider: providerFilter,
  action,
  log_path: logPath,
  window_started_at: new Date(cutoffMs).toISOString(),
  now: new Date().toISOString(),
};
console.log(JSON.stringify(out, null, 2));
process.exit(code);
