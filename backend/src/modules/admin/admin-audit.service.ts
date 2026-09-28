import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import type { AuditExportQuery, AuditQuery } from './admin.schemas.js';

export type AuditContext = {
  adminId: string;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
};

export type AuditEntry = {
  action: string;
  targetEntity?: string;
  targetId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
};

const SENSITIVE_KEY = /(?:password|secret|token|authorization|cookie|credential|raw_headers)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrub(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : scrub(child, depth + 1),
    ]),
  );
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  // Spreadsheet applications interpret these prefixes as formulas even in CSV.
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function auditContext(user: AuthenticatedUser, request: FastifyRequest): AuditContext {
  return {
    adminId: user.id,
    ip: (request.ip || '').slice(0, 45) || null,
    userAgent: (request.headers['user-agent'] || '').slice(0, 500) || null,
    requestId: String(request.id || '').slice(0, 40) || null,
  };
}

@Injectable()
export class AdminAuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(client: SqlClient, context: AuditContext, entry: AuditEntry): Promise<void> {
    await client.query(
      `insert into admin_audit_log
         (admin_user_id, action, target_entity, target_id, payload_before, payload_after,
          note, ip, user_agent, request_id)
       values ($1::uuid, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
      [
        context.adminId,
        entry.action,
        entry.targetEntity ?? null,
        entry.targetId ?? null,
        entry.before ? JSON.stringify(scrub(entry.before)) : null,
        entry.after ? JSON.stringify(scrub(entry.after)) : null,
        entry.note?.slice(0, 1_000) ?? null,
        context.ip,
        context.userAgent,
        context.requestId,
      ],
    );
  }

  async list(query: AuditQuery): Promise<Record<string, unknown>> {
    const { where, values } = this.filters(query);
    const countRows = await this.database.query<{ total: string }>(
      `select count(*)::text as total from admin_audit_log a ${where}`,
      values,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const items = await this.database.query<Record<string, unknown>>(
      `select a.id, a.admin_user_id, u.email as admin_email, a.action, a.target_entity,
              a.target_id, a.payload_before, a.payload_after, a.note, a.ip,
              a.user_agent, a.request_id, a.created_at
         from admin_audit_log a
         left join users u on u.id = a.admin_user_id
         ${where}
         order by a.created_at desc, a.id desc
         limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.page_size, (query.page - 1) * query.page_size],
    );
    return {
      items,
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: Math.ceil(total / query.page_size),
    };
  }

  async exportCsv(query: AuditExportQuery): Promise<string> {
    const { where, values } = this.filters(query);
    const rows = await this.database.query<Record<string, unknown>>(
      `select a.id, a.created_at, a.admin_user_id, u.email as admin_email, a.action,
              a.target_entity, a.target_id, a.note, a.ip, a.request_id,
              a.payload_before, a.payload_after
         from admin_audit_log a
         left join users u on u.id = a.admin_user_id
         ${where}
         order by a.created_at desc, a.id desc
         limit $${values.length + 1}`,
      [...values, query.limit],
    );
    const columns = [
      'id',
      'created_at',
      'admin_user_id',
      'admin_email',
      'action',
      'target_entity',
      'target_id',
      'note',
      'ip',
      'request_id',
      'payload_before',
      'payload_after',
    ];
    return [
      columns.join(','),
      ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(',')),
    ].join('\r\n');
  }

  private filters(query: Omit<AuditQuery, 'page' | 'page_size'>): {
    where: string;
    values: unknown[];
  } {
    const clauses: string[] = [];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown): void => {
      values.push(value);
      clauses.push(clause.replace('?', `$${values.length}`));
    };
    if (query.admin_user_id) add('a.admin_user_id = ?::uuid', query.admin_user_id);
    if (query.action_prefix) add("a.action like (? || '%')", query.action_prefix);
    if (query.target_entity) add('a.target_entity = ?', query.target_entity);
    if (query.target_id) add('a.target_id = ?', query.target_id);
    if (query.date_from) add('a.created_at >= ?::timestamptz', query.date_from);
    if (query.date_to) add('a.created_at <= ?::timestamptz', query.date_to);
    return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', values };
  }
}
