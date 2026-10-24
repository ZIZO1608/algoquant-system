#!/usr/bin/env node
/**
 * Builds "Algo Quant.exe", the Windows control panel: Start / Stop, the links, a QR code
 * for phones, the sign-in accounts and live activity.
 *
 * Uses csc.exe from the .NET Framework that ships with Windows, so nothing extra has to
 * be installed. Run with: npm run build:exe
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LAUNCHER_DIR = path.join(ROOT, 'scripts', 'launcher');
const SOURCES = ['Program.cs', 'Controller.cs', 'Ui.cs', 'Panels.cs', 'MainForm.cs'].map((f) => path.join(LAUNCHER_DIR, f));
const ICON = path.join(LAUNCHER_DIR, 'algo-quant.ico');
const LOGO = path.join(ROOT, 'public', 'brand', 'logo-mark-256.png');
const OUT = path.join(ROOT, 'Algo Quant.exe');

const c = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', gray: '\x1b[90m' };

function findCsc() {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const found = [];
  for (const base of [path.join(windir, 'Microsoft.NET', 'Framework64'), path.join(windir, 'Microsoft.NET', 'Framework')]) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const candidate = path.join(base, entry, 'csc.exe');
      if (existsSync(candidate)) found.push(candidate);
    }
  }
  found.sort().reverse();
  return found.find((p) => p.includes('v4.')) || found[0] || null;
}

console.log('');
console.log(`${c.bold}  Building Algo Quant.exe${c.reset}`);
console.log('');

if (process.platform !== 'win32') {
  console.error(`${c.red}  This builds a Windows program and must run on Windows.${c.reset}`);
  process.exit(1);
}
for (const file of [...SOURCES, ICON, LOGO]) {
  if (!existsSync(file)) {
    console.error(`${c.red}  missing: ${file}${c.reset}`);
    process.exit(1);
  }
}

const csc = findCsc();
if (!csc) {
  console.error(`${c.red}  Could not find csc.exe (.NET Framework 4).${c.reset}`);
  process.exit(1);
}
console.log(`  compiler: ${c.gray}${csc}${c.reset}`);

const args = [
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  '/codepage:65001',
  '/reference:System.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll',
  `/win32icon:${ICON}`,
  `/resource:${LOGO},AlgoQuant.logo.png`,
  `/resource:${ICON},AlgoQuant.icon.ico`,
  `/out:${OUT}`,
  ...SOURCES,
];

const res = spawnSync(csc, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
if (res.status !== 0) {
  console.error(`${c.red}  build failed${c.reset}`);
  console.error((res.stdout || '') + (res.stderr || ''));
  process.exit(1);
}
if (res.stdout && res.stdout.trim()) console.log(res.stdout.trim());

const size = (statSync(OUT).size / 1024).toFixed(0);
console.log(`  ${c.green}✓${c.reset} Algo Quant.exe  ${c.gray}${size} KB${c.reset}`);
console.log('');
console.log(`  Double-click ${c.bold}Algo Quant.exe${c.reset} to open the control panel.`);
console.log('');
