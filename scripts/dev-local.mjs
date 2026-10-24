#!/usr/bin/env node
/**
 * Algo Quant — one-click local environment.
 *
 *   node scripts/dev-local.mjs            start everything (first run downloads PostgreSQL + seeds demo data)
 *   node scripts/dev-local.mjs --reset    wipe the local database and re-seed
 *   node scripts/dev-local.mjs --no-demo  seed only the base data (no demo employees / leads / courses)
 *   node scripts/dev-local.mjs --no-open  don't open the browser
 *   node scripts/dev-local.mjs --no-lan   listen on localhost only (no Wi-Fi access)
 *   node scripts/dev-local.mjs --stop     stop anything a previous launch left running
 *   node scripts/dev-local.mjs --gui      used by "Algo Quant.exe": output goes to .local/session.log with
 *                                         "@@kind|fields" status lines, and .local/stop.request stops it gracefully
 *
 * What it does:
 *   1. installs npm dependencies for the root and the backend if they are missing
 *   2. starts an embedded PostgreSQL 17 on port 5433 (data lives in .local/pgdata, nothing is installed system-wide)
 *   3. on first run: pushes the Prisma schema and seeds the base + demo data
 *   4. starts the API (port 3001) and the UI (port 5173), prints localhost + Wi-Fi links and a QR code,
 *      and opens the browser. Ctrl+C stops everything, including the database.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  API_PORT,
  API_PORT_LAST,
  LOCAL_DIR,
  PG_PORT,
  PORTS_FILE,
  ROOT,
  UI_PORT,
  UI_PORT_LAST,
  isWin,
  lanAddresses,
  readPorts,
  wifiBlockedReason,
} from './local-env.mjs';

const BACKEND = path.join(ROOT, 'backend');
const PG_DATA = path.join(LOCAL_DIR, 'pgdata');
const STATE_FILE = path.join(LOCAL_DIR, 'state.json');
const SESSION_LOG = path.join(LOCAL_DIR, 'session.log');
const STOP_REQUEST = path.join(LOCAL_DIR, 'stop.request');
// Each running launcher keeps a file named after its PID here, so --stop and the
// "already running" check find it however it was started.
const LAUNCHERS_DIR = path.join(LOCAL_DIR, 'launchers');

const PG_USER = 'algo';
const PG_PASSWORD = 'algo';
const PG_DB = 'algo_quant';
// The preferred ports, unless another program already owns them (see claimPort).
let uiPort = UI_PORT;
let apiPort = API_PORT;
const localUrl = () => `http://localhost:${uiPort}`;

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const NO_DEMO = args.has('--no-demo');
const NO_OPEN = args.has('--no-open');
const NO_LAN = args.has('--no-lan');
const STOP = args.has('--stop');
// --gui: started by the Windows control panel. Output goes to .local/session.log without
// colours, and progress is reported with @@ lines that the panel reads.
const GUI = args.has('--gui');

const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

/* ---------------------------------------------------------------- output */

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

const c = GUI
  ? { reset: '', bold: '', dim: '', blue: '', green: '', yellow: '', red: '', gray: '' }
  : {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      blue: '\x1b[38;5;39m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      gray: '\x1b[90m',
    };

if (GUI) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  if (!STOP) writeFileSync(SESSION_LOG, '');
  const toSession = (...parts) => {
    const line = parts.map((p) => String(p)).join(' ').replace(ANSI, '');
    try {
      appendFileSync(SESSION_LOG, `${line}\n`);
    } catch {
      /* ignore */
    }
  };
  console.log = toSession;
  console.error = toSession;
}

/** Progress report for the control panel; does nothing in a console window. */
const gui = (kind, ...fields) => {
  if (!GUI) return;
  const clean = fields.map((f) => String(f == null ? '' : f).replace(/[|\r\n]/g, ' '));
  console.log(`@@${kind}|${clean.join('|')}`);
};
const tag = (label, color) => `${color}${c.bold}[${label}]${c.reset}`;
const log = (msg) => console.log(`${tag('algo', c.blue)} ${msg}`);
const ok = (msg) => console.log(`${tag('algo', c.green)} ${msg}`);
const warn = (msg) => console.log(`${tag('algo', c.yellow)} ${msg}`);
const fail = (msg) => console.error(`${tag('algo', c.red)} ${msg}`);

/* ---------------------------------------------------------------- helpers */

/** On Windows, npm/npx are .cmd files: go through cmd.exe explicitly (no shell:true deprecation). */
function command(cmd, cmdArgs) {
  if (!isWin) return { file: cmd, args: cmdArgs };
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${[cmd, ...cmdArgs].join(' ')}"`] };
}

function run(cmd, cmdArgs, opts = {}) {
  const { file, args: fileArgs } = command(cmd, cmdArgs);
  const capture = opts.quiet || GUI;
  const res = spawnSync(file, fileArgs, {
    cwd: opts.cwd || ROOT,
    stdio: capture ? 'pipe' : 'inherit',
    windowsVerbatimArguments: isWin,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(GUI ? { FORCE_COLOR: '0', NO_COLOR: '1' } : {}), ...(opts.env || {}) },
  });
  if (GUI && !opts.quiet) {
    for (const stream of [res.stdout, res.stderr]) {
      for (const line of String(stream || '').split(/\r?\n/)) if (line.trim()) console.log(`  ${line}`);
    }
  }
  if (res.status !== 0) {
    const detail = opts.quiet && res.stderr ? `\n${res.stderr.toString().trim()}` : '';
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed (exit ${res.status})${detail}`);
  }
  return res;
}

function bindFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/**
 * True when nothing is listening on the port.
 * Windows lets a loopback bind succeed while another process holds 0.0.0.0 on the
 * same port, so the listener table is the authority and the bind is a fallback.
 */
async function portFree(port) {
  if (listeningPid(port) != null) return false;
  return (await bindFree(port, '0.0.0.0')) && (await bindFree(port, '127.0.0.1'));
}

/* --------------------------------------------------- reclaiming busy ports */

/** PID of the process listening on a port, or null. */
function listeningPid(port) {
  if (isWin) {
    const res = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
    for (const line of (res.stdout || '').split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (m && Number(m[1]) === port) return Number(m[2]);
    }
    return null;
  }
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8', windowsHide: true });
  const pid = Number((res.stdout || '').trim().split('\n')[0]);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

/** { pid, name, cmd } for a PID, or null. */
function processInfo(pid) {
  if (!pid) return null;
  if (isWin) {
    const res = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`,
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    try {
      const o = JSON.parse(res.stdout);
      return { pid, name: o.Name || '', cmd: o.CommandLine || '' };
    } catch {
      return null;
    }
  }
  const res = spawnSync('ps', ['-p', String(pid), '-o', 'comm=,args='], { encoding: 'utf8', windowsHide: true });
  const out = (res.stdout || '').trim();
  return out ? { pid, name: out.split(/\s+/)[0], cmd: out } : null;
}

const normalizePath = (s) => String(s || '').replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

/** True when a process was started from this project folder (so it is ours to stop). */
function belongsToProject(info) {
  if (!info) return false;
  return normalizePath(info.cmd).includes(normalizePath(ROOT));
}

function killTree(pid) {
  try {
    if (isWin) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

function registeredLauncherPids() {
  if (!existsSync(LAUNCHERS_DIR)) return [];
  return readdirSync(LAUNCHERS_DIR)
    .map((name) => Number(name.replace(/\.json$/, '')))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** Record this launcher in .local/launchers until it exits. */
function registerLauncher() {
  const file = path.join(LAUNCHERS_DIR, `${process.pid}.json`);
  mkdirSync(LAUNCHERS_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), args: process.argv.slice(2) }));
  process.on('exit', () => {
    try {
      rmSync(file, { force: true });
    } catch {
      /* ignore */
    }
  });
}

/** Command line of every running process, keyed by PID (normalised for matching). */
function processCommandLines() {
  const running = new Map();
  if (isWin) {
    const res = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    let rows = [];
    try {
      rows = [].concat(JSON.parse(res.stdout || '[]'));
    } catch {
      rows = [];
    }
    for (const row of rows) running.set(row.ProcessId, normalizePath(row.CommandLine || ''));
    return running;
  }
  const res = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', windowsHide: true });
  for (const line of (res.stdout || '').trim().split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (m) running.set(Number(m[1]), normalizePath(m[2]));
  }
  return running;
}

/**
 * PIDs of other launcher processes running for this project.
 * They supervise their servers, so they have to be stopped before the ports are
 * reclaimed, otherwise they simply start them again.
 *
 * Registered launchers are found however they were started: `npm run local` and the
 * .bat files pass a relative script path, which the command line alone can't tie to this
 * folder. Launchers started with an absolute path before registration existed are still
 * recognised by their command line.
 */
function otherLauncherPids() {
  // Read the registry before listing processes, so a launcher that registers in between
  // is not mistaken for a stale entry.
  const registered = registeredLauncherPids();
  const running = processCommandLines();
  const pids = new Set();

  for (const pid of registered) {
    const cmd = running.get(pid);
    if (cmd && cmd.includes('dev-local.mjs')) {
      if (pid !== process.pid) pids.add(pid);
    } else {
      // killed without cleaning up, or the PID now belongs to another program
      rmSync(path.join(LAUNCHERS_DIR, `${pid}.json`), { force: true });
    }
  }

  const root = normalizePath(ROOT);
  for (const [pid, cmd] of running) {
    if (pid === process.pid || cmd.includes('--stop')) continue;
    if (cmd.includes('dev-local.mjs') && cmd.includes(root)) pids.add(pid);
  }
  return [...pids];
}

function stopOtherLaunchers() {
  const pids = otherLauncherPids();
  if (!pids.length) return false;
  warn(`another Algo Quant launcher is running (${pids.join(', ')}) — stopping it first…`);
  for (const pid of pids) killTree(pid);
  return true;
}

/** Path to the bundled pg_ctl, or null when the binaries are not installed yet. */
function bundledPgCtl() {
  const base = path.join(ROOT, 'node_modules', '@embedded-postgres');
  if (!existsSync(base)) return null;
  for (const entry of readdirSync(base)) {
    const bin = path.join(base, entry, 'native', 'bin', isWin ? 'pg_ctl.exe' : 'pg_ctl');
    if (existsSync(bin)) return bin;
  }
  return null;
}

/** Append a line to a file under .local/. Logging must never break the launcher. */
function appendLog(file, msg) {
  const text = String(msg == null ? '' : msg).trimEnd();
  if (!text) return;
  try {
    mkdirSync(LOCAL_DIR, { recursive: true });
    appendFileSync(path.join(LOCAL_DIR, file), `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* ignore */
  }
}

/** Database output goes to .local/postgres.log instead of the console. */
const appendPgLog = (msg) => appendLog('postgres.log', msg);

/** Why the environment started or stopped, so a surprise exit can be explained later. */
const launcherLog = (msg) => appendLog('launcher.log', `[pid ${process.pid}] ${msg}`);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Remove a postmaster.pid left behind by a PostgreSQL that is no longer running. */
function clearStalePidFile() {
  const pidFile = path.join(PG_DATA, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').split(/\r?\n/)[0]);
  if (!Number.isFinite(pid) || !pidAlive(pid)) {
    try {
      rmSync(pidFile, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Stop a PostgreSQL left running by an earlier launch of this script. */
function stopStalePostgres() {
  const pgCtl = bundledPgCtl();
  if (pgCtl) {
    const res = spawnSync(pgCtl, ['-D', PG_DATA, 'stop', '-m', 'fast', '-w', '-t', '20'], { encoding: 'utf8', windowsHide: true });
    if (res.status === 0) return true;
  }
  const pidFile = path.join(PG_DATA, 'postmaster.pid');
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').split(/\r?\n/)[0]);
    if (Number.isFinite(pid) && pid > 0) {
      killTree(pid);
      try {
        rmSync(pidFile, { force: true });
      } catch {
        /* ignore */
      }
      return true;
    }
  }
  return false;
}

async function waitForPortFree(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await portFree(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return portFree(port);
}

/**
 * Free a port that a previous run of this script left occupied.
 * Returns true when the port is usable, false when something else owns it.
 */
async function reclaimPort(port, label, { quietIfForeign = false } = {}) {
  if (await portFree(port)) return true;

  const pid = listeningPid(port);
  const info = processInfo(pid);
  const isOurPostgres = port === PG_PORT && info && /postgres/i.test(info.name || '') && belongsToProject(info);

  if (isOurPostgres || belongsToProject(info)) {
    warn(`${label} (port ${port}) is still running from an earlier start — stopping it…`);
    if (isOurPostgres) stopStalePostgres();
    else killTree(pid);
    if (await waitForPortFree(port)) {
      ok(`port ${port} is free again`);
      return true;
    }
  }

  // Nothing is listening: sockets from a just-closed server are still winding down.
  if (!pid && (await waitForPortFree(port, 8000))) return true;

  if (quietIfForeign) return false;
  fail(`port ${port} is in use by another program${info ? ` (${info.name}, PID ${info.pid})` : ''}.`);
  fail(`Close that program, or free the port, then start Algo Quant again.`);
  return false;
}

/** "node.exe server.js 5173 (PID 9128)": enough to recognise the program that owns a port. */
function describeOwner(port) {
  const info = processInfo(listeningPid(port));
  if (!info) return 'another program';
  const cmd = info.cmd.replace(/^"[^"]*[\\/]([^"\\/]+)"/, '$1').replace(/\s+/g, ' ').trim();
  const short = cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd;
  return `${short || info.name} (PID ${info.pid})`;
}

/**
 * The port a server will use: the preferred one when it is free or ours to reclaim,
 * otherwise the next free port up to `last`. Another app on 5173 should not stop
 * Algo Quant from starting, and it is not ours to close.
 */
async function claimPort(preferred, last, label) {
  if (await reclaimPort(preferred, label, { quietIfForeign: true })) return preferred;
  const owner = describeOwner(preferred);
  for (let port = preferred + 1; port <= last; port++) {
    if (await portFree(port)) {
      warn(`port ${preferred} is taken by ${owner}.`);
      ok(`${label} will use port ${port} instead — nothing to close.`);
      launcherLog(`${label}: port ${preferred} taken by ${owner}, using ${port}`);
      return port;
    }
  }
  fail(`ports ${preferred}–${last} are all in use (${preferred}: ${owner}).`);
  fail(`Close one of those programs, then start Algo Quant again.`);
  return null;
}

function waitForHttp(url, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) return resolve(true);
      } catch {
        /* not up yet */
      }
      if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(tick, 700);
    };
    tick();
  });
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ensureBackendEnv() {
  const envPath = path.join(BACKEND, '.env');
  const dbUrl = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public`;
  if (!existsSync(envPath)) {
    const example = readFileSync(path.join(BACKEND, '.env.example'), 'utf8');
    const rand = () => `dev-only-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const local = example
      .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${dbUrl}`)
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${rand()}`)
      .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${rand()}`);
    writeFileSync(envPath, local.includes('APP_URL=') ? local : `${local}\nAPP_URL=http://localhost:${UI_PORT}\n`);
    ok('created backend/.env for the local database');
  }
  return dbUrl;
}

async function printQr(url) {
  if (GUI) return; // the control panel draws its own
  try {
    const mod = await import('qrcode');
    const QRCode = mod.default || mod;
    const text = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log(text.split('\n').map((line) => `     ${line}`).join('\n'));
  } catch {
    /* the links are still printed */
  }
}

function openBrowser(url) {
  try {
    if (isWin) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* ignore */
  }
}

function pipeChild(child, label, color) {
  const prefix = tag(label, color);
  const forward = (stream, writer) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) writer(`${prefix} ${line}`);
    });
  };
  forward(child.stdout, (l) => console.log(l));
  forward(child.stderr, (l) => console.error(l));
}

/* ---------------------------------------------------------------- main */

const children = [];
let pg = null;
let shuttingDown = false;

/** Can something accept a TCP connection on this port right now? */
function canConnect(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * Keep the database up. It is not a child process we spawn, so it is watched by polling:
 * if it disappears (crash, or something stopped it), start it again.
 */
function supervisePostgres() {
  let recentRestarts = [];
  const timer = setInterval(async () => {
    if (shuttingDown || !pg) return;
    if (await canConnect(PG_PORT)) return;

    const now = Date.now();
    recentRestarts = recentRestarts.filter((t) => now - t < 120000);
    recentRestarts.push(now);
    if (recentRestarts.length > 3) {
      fail('the database keeps stopping. Giving up.');
      gui('error', 'The database keeps stopping. See .local/postgres.log.');
      clearInterval(timer);
      shutdown(1, 'database failed repeatedly');
      return;
    }
    launcherLog('database is not reachable — restarting it');

    warn('the database stopped — starting it again…');
    try {
      clearStalePidFile();
      await pg.start();
      ok('database is back');
    } catch (err) {
      fail(`could not restart the database: ${err.message || err}`);
    }
  }, 5000);
  timer.unref();
}

/**
 * Run a server and bring it back if it stops on its own.
 * A dev server can die for reasons that have nothing to do with the app (a watched file
 * locked by another program, a dropped socket); that should not end the whole session.
 * Repeated failures in a short window are real, so those stop everything.
 */
function supervise({ label, color, cmd, args, cwd, env }) {
  let recentExits = [];

  const start = () => {
    const { file, args: fileArgs } = command(cmd, args);
    const child = spawn(file, fileArgs, {
      cwd,
      windowsVerbatimArguments: isWin,
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    pipeChild(child, label, color);

    child.on('exit', (code) => {
      launcherLog(`${label} exited with code ${code}${shuttingDown ? ' (during shutdown)' : ''}`);
      if (shuttingDown) return;
      const now = Date.now();
      recentExits = recentExits.filter((t) => now - t < 60000);
      recentExits.push(now);

      if (recentExits.length > 3) {
        fail(`${label} keeps stopping (last exit code ${code}). Giving up.`);
        gui('error', `${label === 'ui' ? 'The web app' : 'The API'} keeps stopping. See the activity log.`);
        shutdown(1, `${label} failed repeatedly`);
        return;
      }
      warn(`${label} stopped unexpectedly (code ${code}) — restarting it…`);
      setTimeout(start, 800);
    });
  };

  start();
}

async function shutdown(code = 0, reason = 'requested') {
  if (shuttingDown) return;
  shuttingDown = true;
  launcherLog(`shutting down (code ${code}): ${reason}`);
  console.log('');
  log('stopping…');
  gui('phase', 'Stopping');
  for (const child of children) {
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  if (pg) {
    try {
      await pg.stop();
      ok('database stopped');
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0, 'Ctrl+C'));
process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
process.on('SIGHUP', () => shutdown(0, 'console closed'));
process.on('SIGBREAK', () => shutdown(0, 'Ctrl+Break'));
process.on('uncaughtException', (err) => {
  launcherLog(`uncaught exception: ${err && err.stack ? err.stack : err}`);
  fail(`unexpected error: ${err && err.message ? err.message : err}`);
  shutdown(1, 'uncaught exception');
});
process.on('unhandledRejection', (err) => {
  launcherLog(`unhandled rejection: ${err && err.stack ? err.stack : err}`);
  fail(`unexpected error: ${err && err.message ? err.message : err}`);
  shutdown(1, 'unhandled rejection');
});

async function main() {
  console.log('');
  launcherLog(`launcher started (${process.argv.slice(2).join(' ') || 'no flags'})`);
  console.log(`${c.blue}${c.bold}  Algo Quant — local environment${c.reset}`);
  console.log(`${c.gray}  ${ROOT}${c.reset}`);
  console.log('');

  // 0. stop mode: shut down anything a previous launch left running, then exit
  if (STOP) {
    let stopped = 0;
    if (otherLauncherPids().length) {
      // Ask politely first: the running launcher stops the database cleanly.
      log('asking the running Algo Quant to stop…');
      gui('phase', 'Stopping');
      mkdirSync(LOCAL_DIR, { recursive: true });
      writeFileSync(STOP_REQUEST, String(Date.now()));
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && otherLauncherPids().length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      rmSync(STOP_REQUEST, { force: true });
      if (otherLauncherPids().length) {
        warn('it did not stop in time — forcing it');
        stopOtherLaunchers();
        await new Promise((r) => setTimeout(r, 1200));
      } else {
        ok('it stopped cleanly');
      }
      stopped = 1;
    }
    // Only servers started from this folder are stopped; another app on 5173 is left alone.
    const last = readPorts();
    const targets = new Map([
      [last.ui, 'the UI'],
      [UI_PORT, 'the UI'],
      [last.api, 'the API'],
      [API_PORT, 'the API'],
      [PG_PORT, 'the database'],
    ]);
    for (const [port, label] of targets) {
      if (await portFree(port)) continue;
      if (await reclaimPort(port, label, { quietIfForeign: true })) stopped += 1;
    }
    console.log('');
    ok(stopped ? 'Algo Quant is stopped.' : 'Nothing was running.');
    console.log('');
    gui('stopped');
    process.exit(0);
  }

  // Already running (or starting)? Two launchers would fight over the ports, so point
  // the user at the one that exists instead. This check comes before --reset on purpose.
  if (otherLauncherPids().length) {
    ({ ui: uiPort, api: apiPort } = readPorts());
    console.log('');
    ok('Algo Quant is already running.');
    console.log('');
    console.log(`  This laptop   ${c.bold}${localUrl()}${c.reset}`);
    const running = NO_LAN ? [] : lanAddresses();
    if (running.length) console.log(`  Same Wi-Fi    ${c.bold}http://${running[0]}:${uiPort}${c.reset}`);
    console.log('');
    console.log(`  ${c.gray}Stop it from the Algo Quant app or with stop-local.bat.${c.reset}`);
    console.log('');
    gui('already');
    if (!NO_OPEN && (await canConnect(uiPort))) openBrowser(localUrl());
    process.exit(0);
  }

  // A stop request left over from an earlier session must not stop this one.
  rmSync(STOP_REQUEST, { force: true });
  registerLauncher();

  // 1. dependencies
  if (!existsSync(path.join(ROOT, 'node_modules', 'embedded-postgres'))) {
    gui('phase', 'Installing dependencies (first run, a few minutes)');
    log('installing frontend dependencies (first run, this takes a minute)…');
    run(npmCmd, ['install', '--no-audit', '--no-fund']);
  }
  if (!existsSync(path.join(BACKEND, 'node_modules', '@prisma', 'client'))) {
    log('installing backend dependencies (first run)…');
    run(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: BACKEND });
  }

  // 2. database
  const dbUrl = ensureBackendEnv();
  const state = readState();

  if (RESET && existsSync(PG_DATA)) {
    warn('--reset: deleting the local database…');
    rmSync(PG_DATA, { recursive: true, force: true });
    state.seeded = false;
    state.dbCreated = false;
  }

  // A previous launch (or a window closed without Ctrl+C) can leave these running.
  if (!(await reclaimPort(PG_PORT, 'the database'))) process.exit(1);
  apiPort = await claimPort(API_PORT, API_PORT_LAST, 'the API');
  if (apiPort == null) process.exit(1);
  uiPort = await claimPort(UI_PORT, UI_PORT_LAST, 'the web app');
  if (uiPort == null) process.exit(1);
  writeFileSync(PORTS_FILE, JSON.stringify({ ui: uiPort, api: apiPort }));
  gui('ports', uiPort, apiPort);

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  mkdirSync(PG_DATA, { recursive: true });
  pg = new EmbeddedPostgres({
    databaseDir: PG_DATA,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    // Arabic content needs a UTF-8 cluster; the Windows default would be WIN1252.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // Keep the database chatter out of the console but on disk, so a crash can be explained.
    onLog: (msg) => appendPgLog(msg),
    onError: (msg) => {
      appendPgLog(msg);
      const text = String(msg).trim();
      if (/FATAL|PANIC|could not/i.test(text)) console.error(`${tag('pg', c.red)} ${text}`);
    },
  });

  let fresh = !existsSync(path.join(PG_DATA, 'PG_VERSION'));
  if (!fresh && state.initdb !== 'utf8' && !state.seeded) {
    // a data directory left behind by a failed first run: start over
    warn('found an unfinished data directory, re-initialising…');
    rmSync(PG_DATA, { recursive: true, force: true });
    mkdirSync(PG_DATA, { recursive: true });
    fresh = true;
  }
  if (fresh) {
    gui('phase', 'Creating the database (first run)');
    log('initialising PostgreSQL data directory (first run)…');
    await pg.initialise();
    state.initdb = 'utf8';
    state.dbCreated = false;
    writeState(state);
  }
  clearStalePidFile();
  gui('phase', 'Starting the database');
  log(`starting PostgreSQL on port ${PG_PORT}…`);
  await pg.start();
  ok('database running');

  if (fresh || !state.dbCreated) {
    try {
      await pg.createDatabase(PG_DB);
    } catch {
      /* already exists */
    }
    state.dbCreated = true;
    writeState(state);
  }

  // 3. schema + seed
  const backendEnv = { DATABASE_URL: dbUrl };
  // Regenerate the client whenever schema.prisma changed, or the API starts against old types.
  const schemaHash = createHash('sha1')
    .update(readFileSync(path.join(BACKEND, 'prisma', 'schema.prisma')))
    .digest('hex');
  if (
    !existsSync(path.join(BACKEND, 'node_modules', '.prisma', 'client', 'index.js')) ||
    state.schemaHash !== schemaHash
  ) {
    log('generating the Prisma client…');
    run(npxCmd, ['prisma', 'generate'], { cwd: BACKEND, env: backendEnv, quiet: true });
  }
  if (!state.seeded) {
    gui('phase', 'Preparing the database');
    log('applying the database schema…');
    run(npxCmd, ['prisma', 'db', 'push', '--skip-generate'], { cwd: BACKEND, env: backendEnv });
    log('seeding base data (privileges, sources, admin)…');
    run(npmCmd, ['run', 'db:seed'], { cwd: BACKEND, env: backendEnv });
    if (!NO_DEMO) {
      gui('phase', 'Adding the demo data');
      log('seeding demo data (employees, leads, courses, tasks)…');
      run(npmCmd, ['run', 'db:seed-demo'], { cwd: BACKEND, env: backendEnv });
    }
    state.seeded = true;
    state.demo = !NO_DEMO;
    state.seededAt = new Date().toISOString();
    writeState(state);
    ok('database ready');
  } else {
    // keep the schema in sync with the code without touching data
    run(npxCmd, ['prisma', 'db', 'push', '--skip-generate'], { cwd: BACKEND, env: backendEnv, quiet: true });
  }
  if (state.schemaHash !== schemaHash) {
    state.schemaHash = schemaHash;
    writeState(state);
  }

  // 4. servers
  const childColor = GUI ? { FORCE_COLOR: '0', NO_COLOR: '1' } : { FORCE_COLOR: '1' };
  supervisePostgres();

  gui('phase', 'Starting the API');
  log('starting the API…');
  supervise({
    label: 'api',
    color: c.green,
    cmd: npmCmd,
    args: ['run', 'dev'],
    cwd: BACKEND,
    env: { ...process.env, ...backendEnv, ...childColor, PORT: String(apiPort) },
  });

  gui('phase', 'Starting the web app');
  log(NO_LAN ? 'starting the UI (localhost only)…' : 'starting the UI (localhost + Wi-Fi)…');
  supervise({
    label: 'ui',
    color: c.blue,
    cmd: npmCmd,
    args: ['run', 'dev', '--', '--port', String(uiPort), '--strictPort'],
    cwd: ROOT,
    env: {
      ...process.env,
      ...childColor,
      VITE_HOST: NO_LAN ? '0' : '1',
      API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    },
  });

  // The control panel and stop-local ask for a clean shutdown through this file.
  setInterval(() => {
    if (shuttingDown || !existsSync(STOP_REQUEST)) return;
    rmSync(STOP_REQUEST, { force: true });
    shutdown(0, 'stop requested');
  }, 1000).unref();

  gui('phase', 'Waiting for everything to respond');
  await waitForHttp(`http://localhost:${apiPort}/health`);
  await waitForHttp(localUrl());

  const lan = NO_LAN ? [] : lanAddresses();
  const wifiUrl = lan.length ? `http://${lan[0]}:${uiPort}` : null;
  gui('ready', localUrl(), wifiUrl || '');

  console.log('');
  console.log(`${c.green}${c.bold}  ✓ Algo Quant is running${c.reset}`);
  console.log('');
  console.log(`  This laptop   ${c.bold}${localUrl()}${c.reset}`);
  if (wifiUrl) {
    console.log(`  Same Wi-Fi    ${c.bold}${wifiUrl}${c.reset}${lan.length > 1 ? `   ${c.gray}(also: ${lan.slice(1).map((a) => `http://${a}:${uiPort}`).join(', ')})${c.reset}` : ''}`);
  }
  console.log(`  API           http://localhost:${apiPort}/api/v1`);
  console.log(`  Database      postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}`);
  console.log('');
  console.log(`  ${c.bold}Sign in${c.reset}`);
  console.log(`  Admin        admin@algoquant.local            Admin123!`);
  if (state.demo) {
    console.log(`  Sales        reem.sales@algoquant.local       Demo@123`);
    console.log(`  Media        karim.media@algoquant.local      Demo@123`);
    console.log(`  Operations   sara.ops@algoquant.local         Demo@123`);
    console.log(`  Accounting   fadi.finance@algoquant.local     Demo@123`);
    console.log(`  Instructor   omar.instructor@algoquant.local  Demo@123`);
  }
  if (wifiUrl) {
    console.log('');
    console.log(`  ${c.bold}Scan with a phone on the same Wi-Fi${c.reset}`);
    await printQr(wifiUrl);
    const blocked = wifiBlockedReason(uiPort);
    gui('wifi', blocked || 'ok');
    if (blocked === 'no-rule') {
      console.log('');
      warn('Windows Firewall will block other devices. Run allow-wifi-access.bat once (as administrator).');
    } else if (blocked === 'public-network') {
      console.log('');
      warn('Windows marks this Wi-Fi as "Public", so other devices are still blocked.');
      warn('Run allow-wifi-access.bat again (as administrator) — it offers to fix this.');
    }
  }
  console.log('');
  console.log(`  ${c.gray}File uploads need an S3-compatible store (MinIO); everything else works offline.${c.reset}`);
  console.log(`  ${c.gray}Press Ctrl+C to stop. Run with --reset to wipe and re-seed the database.${c.reset}`);
  console.log('');

  if (!NO_OPEN) openBrowser(localUrl());
}

main().catch(async (err) => {
  // Windows refuses to run a program its antivirus flagged; Node only says "spawn UNKNOWN".
  const blocked = err && err.code === 'UNKNOWN' && String(err.syscall || '').startsWith('spawn');
  const message = blocked
    ? 'Windows Defender blocked the database program (it reports a virus). Scan the PC, then reinstall node_modules.'
    : err.message || String(err);
  if (blocked) launcherLog(`blocked by Windows: ${err.path || err.message}`);
  fail(message);
  gui('error', message);
  await shutdown(1, 'start failed');
});
