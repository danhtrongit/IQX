import { randomUUID } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { SqlClient } from '../../platform/database/index.js';
import type { AuthenticatedUser } from '../auth/index.js';

/** admin_audit_log.actor_role (admin spec v1.1 §3.5). */
export type AuditActorRole = 'admin' | 'team_lead';

export type AuditContext = {
  adminId: string;
  actorRole: AuditActorRole;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
};

export function auditContext(admin: AuthenticatedUser, request: FastifyRequest): AuditContext {
  const userAgent = request.headers['user-agent'];
  return {
    adminId: admin.id,
    actorRole: admin.role === 'team_lead' ? 'team_lead' : 'admin',
    ip: request.ip ?? null,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
    requestId: typeof request.id === 'string' ? request.id : null,
  };
}

export async function recordAudit(
  client: SqlClient,
  context: AuditContext,
  entry: {
    action: string;
    targetEntity?: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
    note?: string;
  },
): Promise<void> {
  await client.query(
    `insert into admin_audit_log
      (id, admin_user_id, actor_role, action, target_entity, target_id, payload_before,
       payload_after, note, ip, user_agent, request_id, created_at)
     values ($1, $2, $12, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, now())`,
    [
      randomUUID(),
      context.adminId,
      entry.action,
      entry.targetEntity ?? null,
      entry.targetId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.note ?? null,
      context.ip,
      context.userAgent,
      context.requestId,
      context.actorRole,
    ],
  );
}
