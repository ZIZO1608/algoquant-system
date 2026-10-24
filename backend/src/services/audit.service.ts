import { ActorType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface AuditParams {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
}

export interface StatusTransitionParams {
  entityType: string;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  triggeredByType: ActorType;
  triggeredById?: string | null;
  reason?: string;
}

export async function writeAuditLog(params: AuditParams, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.auditLog.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValue: params.oldValue ? (params.oldValue as Prisma.InputJsonValue) : Prisma.JsonNull,
      newValue: params.newValue ? (params.newValue as Prisma.InputJsonValue) : Prisma.JsonNull,
      ip: params.ip ?? null,
    },
  });
}

export async function writeStatusTransition(
  params: StatusTransitionParams,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  return client.entityStatusTransition.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      triggeredByType: params.triggeredByType,
      triggeredById: params.triggeredById ?? null,
      reason: params.reason ?? null,
    },
  });
}

export async function transitionEntityStatus(
  params: StatusTransitionParams & AuditParams,
  tx?: Prisma.TransactionClient
) {
  await writeStatusTransition(params, tx);
  await writeAuditLog(
    {
      actorType: params.triggeredByType,
      actorId: params.triggeredById,
      action: `${params.entityType}.status_change`,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: { status: params.fromStatus },
      newValue: { status: params.toStatus, reason: params.reason },
      ip: params.ip,
    },
    tx
  );
}
