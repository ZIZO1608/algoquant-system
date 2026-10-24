#!/usr/bin/env node
/**
 * Prints what the Algo Quant control panel needs to know, one `key=value` per line:
 *
 *   ui.port / api.port    ports of the current (or last) session
 *   lan=<ip>              reachable IPv4 addresses, best first (repeats)
 *   wifi=<status>         ok | no-rule | public-network
 *   demo=<bool>           whether the demo accounts were seeded
 *   admin.email / admin.password
 *   qr.url, qr.size, qr.row (repeats)   QR code for the Wi-Fi link, error correction H
 *
 *   node scripts/local-info.mjs [url-for-qr]
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCAL_DIR, ROOT, lanAddresses, readPorts, wifiBlockedReason } from './local-env.mjs';

const lines = [];
const put = (key, value) => lines.push(`${key}=${value}`);

put('root', ROOT);

const { ui: uiPort, api: apiPort } = readPorts();
put('ui.port', uiPort);
put('api.port', apiPort);

const lan = lanAddresses();
for (const address of lan) put('lan', address);

put('wifi', wifiBlockedReason(uiPort) || 'ok');

let demo = true;
try {
  const state = JSON.parse(readFileSync(path.join(LOCAL_DIR, 'state.json'), 'utf8'));
  if (state.demo === false) demo = false;
} catch {
  /* not seeded yet: the demo accounts are what the first start creates */
}
put('demo', demo ? 'true' : 'false');

let adminEmail = 'admin@algoquant.local';
let adminPassword = 'Admin123!';
const envPath = path.join(ROOT, 'backend', '.env');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf8');
  const email = env.match(/^BOOTSTRAP_ADMIN_EMAIL=(.*)$/m);
  const password = env.match(/^BOOTSTRAP_ADMIN_PASSWORD=(.*)$/m);
  if (email && email[1].trim()) adminEmail = email[1].trim();
  if (password && password[1].trim()) adminPassword = password[1].trim();
}
put('admin.email', adminEmail);
put('admin.password', adminPassword);

const qrUrl = process.argv[2] || (lan.length ? `http://${lan[0]}:${uiPort}` : `http://localhost:${uiPort}`);
try {
  const mod = await import('qrcode');
  const QRCode = mod.default || mod;
  // H tolerates the logo drawn in the middle of the code
  const qr = QRCode.create(qrUrl, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  put('qr.url', qrUrl);
  put('qr.size', size);
  for (let r = 0; r < size; r++) {
    let row = '';
    for (let col = 0; col < size; col++) row += qr.modules.get(r, col) ? '1' : '0';
    put('qr.row', row);
  }
} catch (err) {
  put('qr.error', String((err && err.message) || err));
}

process.stdout.write(`${lines.join('\n')}\n`);
