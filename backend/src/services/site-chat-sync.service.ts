import { prisma } from '../lib/prisma.js';
import { constantTimeCompare, generateToken, hashToken } from '../lib/crypto.js';
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';
import { upsertSiteConversation } from './site-chat.service.js';

/**
 * Connection to the website's conversation feed.
 *
 * Pull: every POLL_MS the API asks `<siteUrl>/api/erp/conversations?cursor=…` for rows that
 * changed since the saved cursor. This works while Algo Quant runs on a laptop with no public
 * address, and catches up on everything the site recorded while the laptop was off.
 * Push: the site may also POST each change to /api/v1/webhooks/site-chat for instant updates
 * once Algo Quant has a public address. Both use the same shared token.
 */

export const SITE_FEED_PATH = '/api/erp/conversations';
export const SITE_PING_PATH = '/api/erp/ping';
export const SITE_PUSH_PATH = '/api/v1/webhooks/site-chat';

const POLL_MS = 10_000;
const IDLE_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_SYNC = 20;
const MAX_PUSH_BATCH = 50;

export async function getSiteChatSettingsRow() {
  const existing = await prisma.settingsSiteChat.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.settingsSiteChat.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', token: generateToken(32) },
    update: {},
  });
}

export async function getSiteChatSettings() {
  const s = await getSiteChatSettingsRow();
  const conversations = await prisma.siteConversation.count();
  return {
    enabled: s.enabled,
    siteUrl: s.siteUrl,
    token: s.token,
    tokenRotatedAt: s.tokenRotatedAt,
    hasCursor: Boolean(s.cursor),
    lastSyncAt: s.lastSyncAt,
    lastSuccessAt: s.lastSuccessAt,
    lastError: s.lastError,
    lastErrorAt: s.lastErrorAt,
    lastPushAt: s.lastPushAt,
    totalReceived: s.totalReceived,
    conversations,
    feedPath: SITE_FEED_PATH,
    pingPath: SITE_PING_PATH,
    pushPath: SITE_PUSH_PATH,
    pollSeconds: POLL_MS / 1000,
  };
}

export function normalizeSiteUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  let url: URL;
  try {
    // A bare domain gets https://; any other scheme is kept so it can be refused below.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ValidationError('رابط الموقع غير صالح');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    throw new ValidationError('رابط الموقع غير صالح');
  }
  return url.origin;
}

export async function updateSiteChatSettings(
  body: { enabled?: unknown; siteUrl?: unknown },
  actorId: string
) {
  const current = await getSiteChatSettingsRow();
  const data: { enabled?: boolean; siteUrl?: string; cursor?: null } = {};
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
  if (body.siteUrl !== undefined) {
    data.siteUrl = normalizeSiteUrl(body.siteUrl);
    // Another site means another feed: read it from the beginning (rows are idempotent).
    if (data.siteUrl !== current.siteUrl) data.cursor = null;
  }
  await prisma.settingsSiteChat.update({ where: { id: 'singleton' }, data });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'site_chat.settings_updated',
    entityType: 'settings_site_chat',
    entityId: 'singleton',
    oldValue: { enabled: current.enabled, siteUrl: current.siteUrl },
    newValue: { enabled: data.enabled ?? current.enabled, siteUrl: data.siteUrl ?? current.siteUrl },
  });
  if (data.enabled) wakeSync();
  return getSiteChatSettings();
}

export async function rotateSiteChatToken(actorId: string) {
  await getSiteChatSettingsRow();
  await prisma.settingsSiteChat.update({
    where: { id: 'singleton' },
    data: { token: generateToken(32), tokenRotatedAt: new Date() },
  });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'site_chat.token_rotated',
    entityType: 'settings_site_chat',
    entityId: 'singleton',
  });
  return getSiteChatSettings();
}

/** Forget the cursor so the next sync re-reads the whole feed (safe: rows are idempotent). */
export async function resetSiteChatCursor(actorId: string) {
  await getSiteChatSettingsRow();
  await prisma.settingsSiteChat.update({ where: { id: 'singleton' }, data: { cursor: null } });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'site_chat.cursor_reset',
    entityType: 'settings_site_chat',
    entityId: 'singleton',
  });
}

// ─── Talking to the site ─────────────────────────────────────────────────────

class SiteRequestError extends Error {}

async function siteGet(siteUrl: string, path: string, token: string, params?: Record<string, string>) {
  const url = new URL(path, siteUrl);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = (err as Error)?.name === 'TimeoutError' ? 'timed out' : (err as Error)?.message;
    throw new SiteRequestError(`Could not reach ${url.origin} (${reason})`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new SiteRequestError(`The website rejected the token (HTTP ${res.status})`);
  }
  if (res.status === 404) {
    throw new SiteRequestError(`${url.pathname} was not found on the website (HTTP 404)`);
  }
  if (!res.ok) throw new SiteRequestError(`The website answered HTTP ${res.status}`);
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new SiteRequestError('The website did not answer with JSON');
  }
}

export async function testSiteChatConnection() {
  const s = await getSiteChatSettingsRow();
  const started = Date.now();
  try {
    const body = (await siteGet(s.siteUrl, SITE_PING_PATH, s.token)) as Record<string, unknown>;
    return {
      ok: body?.ok === true,
      latencyMs: Date.now() - started,
      version: body?.version ?? null,
      conversations: typeof body?.conversations === 'number' ? body.conversations : null,
      error: body?.ok === true ? null : 'Unexpected answer from the website',
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, version: null, conversations: null, error: (err as Error).message };
  }
}

export interface SyncResult {
  received: number;
  skipped: number;
  pages: number;
}

let inFlight: Promise<SyncResult> | null = null;

/** One pass over the feed from the saved cursor. Concurrent callers share the same pass. */
export function syncSiteChatsOnce(): Promise<SyncResult> {
  if (!inFlight) inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  const s = await getSiteChatSettingsRow();
  let cursor = s.cursor;
  const result: SyncResult = { received: 0, skipped: 0, pages: 0 };
  try {
    let hasMore = true;
    while (hasMore && result.pages < MAX_PAGES_PER_SYNC) {
      const params: Record<string, string> = { limit: String(PAGE_LIMIT) };
      if (cursor) params.cursor = cursor;
      const body = (await siteGet(s.siteUrl, SITE_FEED_PATH, s.token, params)) as {
        conversations?: unknown;
        next_cursor?: unknown;
        has_more?: unknown;
      };
      if (!Array.isArray(body?.conversations)) {
        throw new SiteRequestError('The website answered without a conversations list');
      }
      for (const raw of body.conversations) {
        try {
          await upsertSiteConversation(raw);
          result.received += 1;
        } catch (err) {
          result.skipped += 1;
          console.warn('[site-chat] skipped a conversation:', (err as Error).message);
        }
      }
      result.pages += 1;
      if (typeof body.next_cursor === 'string' && body.next_cursor) cursor = body.next_cursor;
      hasMore = body.has_more === true && body.conversations.length > 0;
      // Save progress page by page, so a stop half-way does not re-read what was stored.
      await prisma.settingsSiteChat.update({
        where: { id: 'singleton' },
        data: { cursor, totalReceived: { increment: body.conversations.length } },
      });
    }
    await prisma.settingsSiteChat.update({
      where: { id: 'singleton' },
      data: { lastSyncAt: new Date(), lastSuccessAt: new Date(), lastError: null },
    });
    return result;
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    await prisma.settingsSiteChat.update({
      where: { id: 'singleton' },
      data: { lastSyncAt: new Date(), lastError: message.slice(0, 500), lastErrorAt: new Date() },
    });
    throw err;
  }
}

// ─── Push from the site ──────────────────────────────────────────────────────

function tokenFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers.authorization;
  const value = Array.isArray(auth) ? auth[0] : auth;
  if (value?.toLowerCase().startsWith('bearer ')) return value.slice(7).trim();
  const header = headers['x-webhook-token'];
  const token = Array.isArray(header) ? header[0] : header;
  return token?.trim() || null;
}

export async function handleSiteChatPush(
  body: unknown,
  headers: Record<string, string | string[] | undefined>
) {
  const s = await getSiteChatSettingsRow();
  const token = tokenFromHeaders(headers);
  if (!token || !constantTimeCompare(hashToken(token), hashToken(s.token))) {
    throw new UnauthorizedError('Invalid or missing token');
  }
  if (!s.enabled) throw new ServiceUnavailableError('Website chat sync is turned off');

  const payload = (body ?? {}) as { conversation?: unknown; conversations?: unknown };
  const list = Array.isArray(payload.conversations)
    ? payload.conversations
    : payload.conversation
      ? [payload.conversation]
      : [];
  if (!list.length) throw new ValidationError('Send { conversation } or { conversations: [...] }');
  if (list.length > MAX_PUSH_BATCH) throw new ValidationError(`At most ${MAX_PUSH_BATCH} conversations per request`);

  let received = 0;
  const errors: string[] = [];
  for (const raw of list) {
    try {
      await upsertSiteConversation(raw);
      received += 1;
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  await prisma.settingsSiteChat.update({
    where: { id: 'singleton' },
    data: { lastPushAt: new Date(), totalReceived: { increment: received } },
  });
  return { ok: errors.length === 0, received, errors };
}

// ─── Background loop ─────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let failures = 0;
let stopped = true;

function schedule(ms: number) {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, ms);
  timer.unref?.();
}

async function tick() {
  let next = IDLE_MS;
  try {
    const s = await getSiteChatSettingsRow();
    if (s.enabled && s.siteUrl && s.token) {
      await syncSiteChatsOnce();
      failures = 0;
      next = POLL_MS;
    }
  } catch (err) {
    failures += 1;
    next = Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
    if (failures === 1 || failures % 10 === 0) {
      console.warn(`[site-chat] sync failed (${failures}x): ${(err as Error)?.message ?? err}`);
    }
  }
  schedule(next);
}

/** Run the next pass now (after the connection is switched on or fixed). */
export function wakeSync() {
  failures = 0;
  schedule(0);
}

export function startSiteChatSync() {
  stopped = false;
  schedule(3_000);
  console.log('[site-chat] website conversation sync started');
}

export function stopSiteChatSync() {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
