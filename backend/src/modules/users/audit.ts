import { randomUUID } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { SqlClient } from '../../platform/database/index.js';
import type { AuthenticatedUser } from '../auth/index.js';

export type AuditContext = {
  adminId: string;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
};

export function auditContext(admin: AuthenticatedUser, request: FastifyRequest): AuditContext {
  const userAgent = request.headers['user-agent'];
  return {
    adminId: admin.id,
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
      (id, admin_user_id, action, target_entity, target_id, payload_before,
       payload_after, note, ip, user_agent, request_id, created_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, now())`,
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
    ],
  );
}
