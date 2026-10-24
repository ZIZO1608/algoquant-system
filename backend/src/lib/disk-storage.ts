import { createHmac, timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

/**
 * Stores uploads on the local disk (STORAGE_DIR) for single-container deployments
 * without an S3 service. Download links are short-lived HMAC-signed URLs served by
 * the API, mirroring how presigned S3 URLs behave.
 */

function root(): string {
  return path.resolve(config.storageDir!);
}

function resolveKey(storageKey: string): string {
  const base = root();
  const filePath = path.resolve(base, storageKey);
  if (!filePath.startsWith(base + path.sep)) throw new Error('Invalid storage key');
  return filePath;
}

function sign(storageKey: string, expires: number): string {
  return createHmac('sha256', config.jwt.secret).update(`${storageKey}:${expires}`).digest('hex');
}

export async function writeDiskFile(storageKey: string, buffer: Buffer): Promise<void> {
  const filePath = resolveKey(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export async function deleteDiskFile(storageKey: string): Promise<void> {
  await fs.rm(resolveKey(storageKey), { force: true });
}

export function signedDiskUrl(storageKey: string, expiresIn: number): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const query = new URLSearchParams({
    key: storageKey,
    exp: String(expires),
    sig: sign(storageKey, expires),
  });
  return `/api/v1/files/raw?${query}`;
}

/** Returns the file path when the signature is valid and unexpired, otherwise null. */
export function verifyDiskUrl(storageKey: string, exp: string, sig: string): string | null {
  const expires = Number(exp);
  if (!storageKey || !Number.isFinite(expires) || expires < Date.now() / 1000) return null;
  const expected = Buffer.from(sign(storageKey, expires));
  const given = Buffer.from(sig || '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return resolveKey(storageKey);
  } catch {
    return null;
  }
}
