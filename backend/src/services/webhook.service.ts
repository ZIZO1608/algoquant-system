import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { hashToken, constantTimeCompare } from '../lib/crypto.js';
import { config, BOT_EXTRA_DATA_KEYS } from '../config/index.js';
import { createLead } from './lead.service.js';
import { createNotification } from './notification.service.js';

const BOT_SOURCE_CODE = 'bot';
const DEFAULT_SOURCE_SYSTEM = 'qualification_bot';

/** Bot-side field names → ERP canonical keys stored in extra_data */
const FIELD_ALIASES: Record<string, string> = {
  preferred_times: 'preferred_contact_times',
  contact_method: 'preferred_contact_method',
  needs_call: 'needs_a_call',
  ai_experience_level: 'ai_experience_score',
};

function applyFieldAliases(
  query: Record<string, string | undefined>
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = { ...query };
  for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
    const aliasVal = normalized[alias];
    if (aliasVal !== undefined && aliasVal !== '') {
      if (normalized[canonical] === undefined || normalized[canonical] === '') {
        normalized[canonical] = aliasVal;
      }
    }
    delete normalized[alias];
  }
  return normalized;
}

function remapExtraDataAliases(extraData: Record<string, unknown>): void {
  for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
    if (!(alias in extraData)) continue;
    if (extraData[canonical] === undefined || extraData[canonical] === '') {
      extraData[canonical] = extraData[alias];
    }
    delete extraData[alias];
  }
}

export function parseBotExtraData(query: Record<string, string | undefined>): Record<string, unknown> {
  const normalized = applyFieldAliases(query);
  const extraData: Record<string, unknown> = {};

  for (const key of BOT_EXTRA_DATA_KEYS) {
    const val = normalized[key] ?? normalized[key.replace(/_/g, '-')];
    if (val !== undefined && val !== '') {
      extraData[key] = val;
    }
  }

  // Parse bundled notes field if individual keys missing
  const bundle = normalized.notes ?? normalized.bundle ?? normalized.data;
  if (bundle) {
    const pairs = bundle.split(/[|;,\n]/).map((s) => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const [rawKey, ...rest] = pair.split(':');
      if (!rawKey || rest.length === 0) continue;
      const key = rawKey.trim().toLowerCase().replace(/\s+/g, '_');
      const value = rest.join(':').trim();
      if (value) extraData[key] = value;
    }
  }

  // Remap any alias keys introduced by the notes bundle
  remapExtraDataAliases(extraData);

  // Passthrough unknown keys (except sensitive) — capped (P2-L2)
  const reserved = new Set(['token', 'external_lead_id', 'source_system', 'full_name', 'name', 'phone']);
  const freeformKeys: string[] = [];
  for (const [key, val] of Object.entries(normalized)) {
    if (!val || reserved.has(key)) continue;
    if (!(key in extraData) && !BOT_EXTRA_DATA_KEYS.includes(key as typeof BOT_EXTRA_DATA_KEYS[number])) {
      freeformKeys.push(key);
    }
  }
  freeformKeys.sort();
  if (freeformKeys.length > 20) {
    throw new Error('Too many freeform extraData keys (max 20)');
  }
  for (const key of freeformKeys) {
    extraData[key] = normalized[key];
  }

  const serialized = JSON.stringify(extraData);
  if (serialized.length > 8192) {
    throw new Error('extraData payload too large (max 8KB)');
  }

  return extraData;
}

function sanitizePayload(query: Record<string, string | undefined>): Record<string, unknown> {
  const copy = { ...query };
  if (copy.token) copy.token = '[REDACTED]';
  return copy;
}

function resolveWebhookToken(
  query: Record<string, string | undefined>,
  headers?: Record<string, string | string[] | undefined>
): string | undefined {
  const headerToken = headers?.['x-webhook-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  if (Array.isArray(headerToken) && headerToken[0]) return String(headerToken[0]).trim();

  const auth = headers?.authorization ?? headers?.Authorization;
  const authVal = Array.isArray(auth) ? auth[0] : auth;
  if (typeof authVal === 'string' && authVal.toLowerCase().startsWith('bearer ')) {
    return authVal.slice(7).trim();
  }

  // Backward compatible with bot query-string URLs
  return query.token;
}

export async function handleInboundLeadWebhook(
  query: Record<string, string | undefined>,
  ip?: string,
  headers?: Record<string, string | string[] | undefined>
) {
  const sanitized = sanitizePayload(query);
  let success = false;
  let failureReason: string | null = null;
  let leadId: string | null = null;
  let externalLeadId = query.external_lead_id ?? query.externalLeadId ?? null;

  try {
    const settings = await prisma.settingsWebhook.findUnique({ where: { id: 'singleton' } });
    const token = resolveWebhookToken(query, headers);
    if (!token || !settings) {
      throw new Error('Invalid or missing token');
    }
    const tokenHash = hashToken(token);
    if (!constantTimeCompare(tokenHash, settings.secretTokenHash)) {
      throw new Error('Invalid or missing token');
    }

    const fullName = query.full_name ?? query.name;
    const phone = query.phone ?? query.whatsapp ?? query.whatsapp_number;
    if (!fullName || !phone) {
      throw new Error('Missing required fields: full_name and phone');
    }

    externalLeadId =
      externalLeadId ?? query.id ?? `anon-${hashToken(phone + fullName).slice(0, 16)}`;
    const botType = query.bot_type;
    const sourceSystem =
      query.source_system ?? (botType ? `${botType}_bot` : DEFAULT_SOURCE_SYSTEM);
    const extraData = parseBotExtraData(query);

    const botSource = await prisma.leadSource.findUnique({ where: { code: BOT_SOURCE_CODE } });
    if (!botSource) throw new Error('Bot lead source not configured');

    const existing = await prisma.lead.findFirst({
      where: { sourceSystem, externalLeadId },
    });

    if (existing) {
      const updated = await prisma.lead.update({
        where: { id: existing.id },
        data: {
          fullName,
          phone,
          extraData: extraData as Prisma.InputJsonValue,
          requestedCourseText:
            (extraData.interest_area as string) ??
            (extraData.main_goal as string) ??
            (extraData.workshop_title as string) ??
            (extraData.idea_description as string) ??
            existing.requestedCourseText,
        },
      });
      leadId = updated.id;
    } else {
      const lead = await createLead(
        {
          fullName,
          phone,
          sourceId: botSource.id,
          requestedCourseText:
            (extraData.interest_area as string) ??
            (extraData.main_goal as string) ??
            (extraData.workshop_title as string) ??
            (extraData.idea_description as string),
          extraData,
          externalLeadId,
          sourceSystem,
        },
        'bot_webhook'
      );
      leadId = lead.id;

      const salesEmployees = await prisma.employeePrivilege.findMany({
        where: { privilege: { code: 'sales' } },
        select: { employeeId: true },
      });
      for (const { employeeId } of salesEmployees) {
        await createNotification({
          employeeId,
          type: 'new_lead_bot',
          title: 'عميل جديد من البوت',
          body: `${fullName} — ${extraData.interest_area ?? 'غير محدد'}`,
          payload: { leadId, classification: extraData.lead_classification },
        });
      }
    }

    success = true;
  } catch (err) {
    const prismaCode =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
    if (prismaCode === 'P2002') {
      failureReason = 'Duplicate lead for this source system and external id';
    } else {
      failureReason = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  await prisma.webhookInboundLog.create({
    data: {
      success,
      failureReason,
      externalLeadId,
      leadId,
      ip: ip ?? null,
      sanitizedPayload: sanitized as Prisma.InputJsonValue,
    },
  });

  if (!success) {
    return { success: false, error: failureReason };
  }
  return { success: true, leadId };
}

export async function ensureWebhookSettings() {
  const existing = await prisma.settingsWebhook.findUnique({ where: { id: 'singleton' } });
  if (!existing) {
    const token = config.webhookDefaultSecret;
    await prisma.settingsWebhook.create({
      data: {
        id: 'singleton',
        secretTokenHash: hashToken(token),
        secretHint: token.slice(-4),
      },
    });
  }
}
