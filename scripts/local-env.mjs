/**
 * Facts about the local environment shared by the launcher (dev-local.mjs)
 * and the Windows control panel helper (local-info.mjs).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const LOCAL_DIR = path.join(ROOT, '.local');
export const isWin = process.platform === 'win32';

export const PG_PORT = 5433;
export const API_PORT = 3001;
export const UI_PORT = 5173;

// When another program already owns a preferred port, the launcher moves to the next
// free one in these ranges. allow-wifi-access.bat opens the same ranges in the firewall.
export const UI_PORT_LAST = 5199;
export const API_PORT_LAST = 3020;

/** Where the launcher records the ports it actually chose, for the control panel. */
export const PORTS_FILE = path.join(LOCAL_DIR, 'ports.json');

/** The ports of the current (or last) session: { ui, api }. */
export function readPorts() {
  try {
    const saved = JSON.parse(readFileSync(PORTS_FILE, 'utf8'));
    return { ui: Number(saved.ui) || UI_PORT, api: Number(saved.api) || API_PORT };
  } catch {
    return { ui: UI_PORT, api: API_PORT };
  }
}

/** IPv4 addresses of this machine that other devices on the same network can reach, best first. */
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      // skip virtual adapters (VirtualBox, VMware, WSL, Docker) when a real one exists
      const virtual = /virtual|vmware|vbox|wsl|docker|hyper-v|vethernet|loopback/i.test(name);
      out.push({ name, address: info.address, virtual });
    }
  }
  const real = out.filter((a) => !a.virtual);
  const rank = (a) => {
    if (/wi-?fi|wlan|wireless|ethernet|local area/i.test(a.name)) return 0;
    if (a.address.startsWith('192.168.')) return 1;
    if (a.address.startsWith('10.')) return 2;
    return 3;
  };
  return (real.length ? real : out).sort((a, b) => rank(a) - rank(b)).map((a) => a.address);
}

/**
 * Why other devices cannot reach the app yet, or null when nothing is in the way.
 * Two things must line up on Windows: a firewall rule for the ports, and that rule
 * covering the category ("Private" / "Public") Windows assigned to the active network.
 *   'no-rule'         no firewall rule exists yet
 *   'public-network'  the rule exists but does not cover the network Windows is on
 */
export function wifiBlockedReason(uiPort = UI_PORT) {
  if (!isWin) return null;
  const script = [
    "$r = Get-NetFirewallRule -DisplayName 'Algo Quant UI (5173)' -ErrorAction SilentlyContinue | Select-Object -First 1;",
    "$cats = @(Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } | ForEach-Object { [string]$_.NetworkCategory });",
    "$ports = $(if ($r) { [string](@(($r | Get-NetFirewallPortFilter).LocalPort) -join ',') } else { '' });",
    "[pscustomobject]@{ rule = $(if ($r) { [string]$r.Profile } else { '' }); ports = $ports; cats = $cats } | ConvertTo-Json -Compress",
  ].join(' ');
  const res = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  let info;
  try {
    info = JSON.parse(res.stdout);
  } catch {
    return null; // cannot tell; stay quiet rather than warn wrongly
  }
  const rule = String(info.rule || '');
  if (!rule) return 'no-rule';
  // a rule from before the port ranges only opens 5173; running the .bat again widens it
  if (!portListed(String(info.ports || ''), uiPort)) return 'no-rule';
  if (/\bAny\b/i.test(rule)) return null;
  const cats = [].concat(info.cats || []).filter(Boolean);
  if (!cats.length) return null;
  const covered = cats.some((cat) => new RegExp(`\\b${cat}\\b`, 'i').test(rule));
  return covered ? null : 'public-network';
}

/** True when a firewall port list such as "5173" or "5173-5199,8080" includes the port. */
function portListed(list, port) {
  if (!list || /\bAny\b/i.test(list)) return true;
  return list.split(',').some((part) => {
    const [from, to] = part.trim().split('-').map(Number);
    return port >= from && port <= (to || from);
  });
}
