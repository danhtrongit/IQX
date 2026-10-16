import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { AuthService, type PublicUser } from '../auth/index.js';
import type {
  AdminUserCreateInput,
  AdminUserUpdateInput,
  UserUpdateInput,
} from '../auth/auth.schemas.js';
import { toPublicUser, type UserDatabaseRow, type UserRole } from '../auth/auth.types.js';
import { normalizePhone, uniqueViolationConstraint, userConflict } from '../auth/user-identity.js';
import { recordAudit, type AuditContext } from './audit.js';
import type { BulkUpdateInput, UserListQuery } from './users.schemas.js';

const USER_COLUMNS = `id, email, username, username_change_allowed, hashed_password, phone_number, phone_country_code,
  phone_national_number, phone_e164, phone_verified_at, full_name, avatar_url,
  date_of_birth, gender, country, province_state, city, district, ward,
  street_address, postal_code, role, status, is_email_verified,
  email_verified_at, last_login_at, deleted_at, created_at, updated_at`;

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  async getById(id: string): Promise<PublicUser> {
    return toPublicUser(await this.requireUser(this.database, id));
  }

  async updateSelf(id: string, input: UserUpdateInput): Promise<PublicUser> {
    return this.updateUser(id, input);
  }

  async list(query: UserListQuery): Promise<{
    items: Array<
      Pick<PublicUser, 'id' | 'email' | 'username' | 'full_name' | 'role' | 'status' | 'created_at'>
    >;
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }> {
    const conditions = [`status <> 'deleted'`];
    const params: unknown[] = [];
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(
        `(email ilike $${params.length} or username ilike $${params.length} or full_name ilike $${params.length})`,
      );
    }
    if (query.role) {
      params.push(query.role);
      conditions.push(`role = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.join(' and ');
    const countRows = await this.database.query<{ total: string }>(
      `select count(*)::text as total from users where ${where}`,
      [...params],
    );
    params.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = await this.database.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where ${where}
       order by ${query.sort_by} ${query.sort_order === 'asc' ? 'asc' : 'desc'}, id asc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        username: row.username,
        full_name: row.full_name,
        role: row.role,
        status: row.status,
        created_at: row.created_at,
      })),
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }

  async adminCreate(input: AdminUserCreateInput, audit: AuditContext): Promise<PublicUser> {
    if (input.role === 'team_lead') throw roleNotAssignable();
    const phone = normalizePhone(input.phone_number, ConflictException);
    const hash = await bcrypt.hash(input.password, 12);
    try {
      return await this.database.transaction(async (tx) => {
        const rows = await tx.query<UserDatabaseRow>(
          `insert into users
            (id, email, username, hashed_password, full_name, phone_number, phone_country_code,
             phone_national_number, phone_e164, role, status, is_email_verified, created_at, updated_at)
           values ($1,$2,$11,$3,$4,$5,$6,$7,$8,$9,$10,false,now(),now()) returning ${USER_COLUMNS}`,
          [
            randomUUID(),
            input.email,
            hash,
            input.full_name,
            phone.original,
            phone.countryCode,
            phone.nationalNumber,
            phone.e164,
            input.role,
            input.status,
            input.username,
          ],
        );
        const row = rows[0];
        if (!row) throw new Error('insert returned no user');
        await recordAudit(tx, audit, {
          action: 'user.create',
          targetEntity: 'user',
          targetId: row.id,
          after: { email: row.email, username: row.username, role: row.role, status: row.status },
        });
        return toPublicUser(row);
      });
    } catch (error) {
      const constraint = uniqueViolationConstraint(error);
      if (constraint !== null) throw userConflict(constraint);
      throw error;
    }
  }

  /**
   * DECISION 1: an account whose username was generated by the v1.1 backfill may replace it
   * once. Team leads never can, because their username is their referral code.
   */
  async changeOwnUsername(id: string, username: string): Promise<PublicUser> {
    try {
      return await this.database.transaction(async (tx) => {
        const user = await this.requireUser(tx, id, false, true);
        if (!user.username_change_allowed || user.role === 'team_lead') {
          throw new UnprocessableEntityException({
            code: 'USERNAME_LOCKED',
            message: 'Tên đăng nhập này không thể đổi nữa.',
          });
        }
        const rows = await tx.query<UserDatabaseRow>(
          `update users set username = $1, username_change_allowed = false, updated_at = now()
           where id = $2 returning ${USER_COLUMNS}`,
          [username, id],
        );
        const row = rows[0];
        if (!row)
          throw new NotFoundException({
            code: 'USER_NOT_FOUND',
            message: 'Không tìm thấy người dùng',
          });
        return toPublicUser(row);
      });
    } catch (error) {
      const constraint = uniqueViolationConstraint(error);
      if (constraint !== null) throw userConflict(constraint);
      throw error;
    }
  }

  async adminUpdate(
    id: string,
    input: AdminUserUpdateInput,
    audit: AuditContext,
  ): Promise<PublicUser> {
    return this.database.transaction(async (tx) => {
      const before = await this.requireUser(tx, id, true, true);
      assertTeamLeadUnchanged(before, input.role ?? before.role, input.status ?? before.status);
      await this.assertAdminContinuity(
        tx,
        before,
        input.role ?? before.role,
        input.status ?? before.status,
        audit.adminId,
      );
      const updated = await this.updateUser(id, input, tx);
      const changedBefore: Record<string, unknown> = {};
      const changedAfter: Record<string, unknown> = {};
      for (const key of Object.keys(input) as Array<keyof AdminUserUpdateInput>) {
        const oldValue = before[key as keyof UserDatabaseRow];
        const newValue = updated[key as keyof PublicUser];
        if (oldValue !== newValue) {
          changedBefore[key] = oldValue;
          changedAfter[key] = newValue;
        }
      }
      await recordAudit(tx, audit, {
        action: 'user.update',
        targetEntity: 'user',
        targetId: id,
        before: changedBefore,
        after: changedAfter,
      });
      if (input.status && input.status !== 'active') {
        await tx.query(
          'update refresh_tokens set revoked = true where user_id = $1 and revoked = false',
          [id],
        );
      }
      return updated;
    });
  }

  async softDelete(id: string, audit: AuditContext): Promise<void> {
    await this.database.transaction(async (tx) => {
      const before = await this.requireUser(tx, id, true, true);
      assertTeamLeadUnchanged(before, before.role, 'deleted');
      await this.assertAdminContinuity(tx, before, before.role, 'deleted', audit.adminId);
      await tx.query(
        `update users set status = 'deleted', deleted_at = now(), updated_at = now() where id = $1`,
        [id],
      );
      await tx.query(
        'update refresh_tokens set revoked = true where user_id = $1 and revoked = false',
        [id],
      );
      await recordAudit(tx, audit, {
        action: 'user.delete',
        targetEntity: 'user',
        targetId: id,
        before: { status: before.status },
        after: { status: 'deleted' },
      });
    });
  }

  async bulkUpdate(
    input: BulkUpdateInput,
    audit: AuditContext,
  ): Promise<{
    affected: number;
    skipped: string[];
    errors: Array<{ user_id: string; message: string }>;
  }> {
    await this.assertBulkLeavesTeamLeads(input);
    const skipped: string[] = [];
    const errors: Array<{ user_id: string; message: string }> = [];
    let affected = 0;
    for (const id of input.user_ids) {
      try {
        const changed = await this.database.transaction(async (tx) => {
          const rows = await tx.query<Pick<UserDatabaseRow, 'id' | 'role' | 'status'>>(
            'select id, role, status from users where id = $1 for update',
            [id],
          );
          const user = rows[0];
          if (!user) return false;
          const after = { role: user.role, status: user.status };
          if (input.op === 'set_role') after.role = input.value as typeof user.role;
          if (input.op === 'set_status') after.status = input.value as typeof user.status;
          if (input.op === 'soft_delete') after.status = 'deleted';
          // Re-checked under the row lock in case a role changed after the upfront check.
          assertTeamLeadUnchanged(user, after.role, after.status);
          await this.assertAdminContinuity(tx, user, after.role, after.status, audit.adminId);
          await tx.query(
            `update users set role = $1::user_role, status = $2::user_status,
             deleted_at = case when $2::user_status = 'deleted' then coalesce(deleted_at, now()) when $2::user_status = 'active' then null else deleted_at end, updated_at = now()
             where id = $3`,
            [after.role, after.status, id],
          );
          if (after.status !== 'active') {
            await tx.query(
              'update refresh_tokens set revoked = true where user_id = $1 and revoked = false',
              [id],
            );
          }
          await recordAudit(tx, audit, {
            action: 'user.bulk_update',
            targetEntity: 'user',
            targetId: id,
            before: { role: user.role, status: user.status },
            after,
            note: input.op,
          });
          return true;
        });
        if (changed) affected += 1;
        else skipped.push(id);
      } catch (error) {
        errors.push({
          user_id: id,
          message: error instanceof Error ? error.message : 'update failed',
        });
      }
    }
    return { affected, skipped, errors };
  }

  async resendVerification(id: string, audit: AuditContext): Promise<void> {
    const { user, token } = await this.auth.createVerificationToken(id);
    const sent = await this.authEmailVerification(user.email, user.full_name, token);
    await this.database.transaction((tx) =>
      recordAudit(tx, audit, {
        action: 'user.verify_resend',
        targetEntity: 'user',
        targetId: id,
        note: `verification email ${sent ? 'sent' : 'skipped/failed'}`,
      }),
    );
  }

  private async authEmailVerification(
    email: string,
    fullName: string,
    token: string,
  ): Promise<boolean> {
    // AuthService owns token creation; EmailService is intentionally not exposed through this domain.
    return this.auth.sendVerificationEmail(email, fullName, token);
  }

  private async updateUser(
    id: string,
    input: UserUpdateInput | AdminUserUpdateInput,
    client: SqlClient = this.database,
  ): Promise<PublicUser> {
    await this.requireUser(client, id);
    const fields: Record<string, unknown> = { ...input };
    if ('phone_number' in input) {
      const phone = normalizePhone(input.phone_number, ConflictException);
      fields.phone_number = phone.original;
      fields.phone_country_code = phone.countryCode;
      fields.phone_national_number = phone.nationalNumber;
      fields.phone_e164 = phone.e164;
    }
    if ('status' in input && input.status === 'deleted') fields.deleted_at = new Date();
    if ('status' in input && input.status === 'active') fields.deleted_at = null;
    if (!Object.keys(fields).length) return this.getById(id);
    const allowed = new Set([
      'full_name',
      'phone_number',
      'phone_country_code',
      'phone_national_number',
      'phone_e164',
      'avatar_url',
      'date_of_birth',
      'gender',
      'country',
      'province_state',
      'city',
      'district',
      'ward',
      'street_address',
      'postal_code',
      'role',
      'status',
      'is_email_verified',
      'deleted_at',
    ]);
    const entries = Object.entries(fields).filter(([key]) => allowed.has(key));
    const values = entries.map(([, value]) => value);
    values.push(id);
    try {
      const rows = await client.query<UserDatabaseRow>(
        `update users set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')}, updated_at = now()
         where id = $${values.length} returning ${USER_COLUMNS}`,
        values,
      );
      const row = rows[0];
      if (!row)
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Không tìm thấy người dùng',
        });
      return toPublicUser(row);
    } catch (error) {
      const constraint = uniqueViolationConstraint(error);
      if (constraint !== null) throw userConflict(constraint);
      throw error;
    }
  }

  /**
   * Bulk requests that would assign or remove `team_lead`, or deactivate a team lead, are
   * rejected as a whole before any row changes (admin spec v1.1 §1.1 rule 2).
   */
  private async assertBulkLeavesTeamLeads(input: BulkUpdateInput): Promise<void> {
    if (input.op === 'set_role' && input.value === 'team_lead') throw roleNotAssignable();
    const leads = await this.database.query<{ id: string }>(
      `select id from users where id = any($1::uuid[]) and role = 'team_lead' order by id`,
      [input.user_ids],
    );
    if (!leads.length) return;
    const ids = leads.map((lead) => lead.id);
    if (input.op === 'set_role') throw roleNotAssignable(ids);
    if (input.op === 'soft_delete' || input.value !== 'active') throw teamLeadActive(ids);
  }

  private async requireUser(
    client: SqlClient,
    id: string,
    includeDeleted = false,
    forUpdate = false,
  ): Promise<UserDatabaseRow> {
    const rows = await client.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where id = $1 ${includeDeleted ? '' : "and status <> 'deleted'"} limit 1${forUpdate ? ' for update' : ''}`,
      [id],
    );
    const user = rows[0];
    if (!user)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
    return user;
  }

  private async assertAdminContinuity(
    client: SqlClient,
    current: Pick<UserDatabaseRow, 'id' | 'role' | 'status'>,
    nextRole: UserDatabaseRow['role'],
    nextStatus: UserDatabaseRow['status'],
    actorId: string,
  ): Promise<void> {
    const removesActiveAdmin =
      current.role === 'admin' &&
      current.status === 'active' &&
      (nextRole !== 'admin' || nextStatus !== 'active');
    if (!removesActiveAdmin) return;
    if (current.id === actorId) {
      throw new ForbiddenException({
        code: 'ADMIN_SELF_LOCKOUT',
        message: 'Quản trị viên không thể tự hạ quyền hoặc vô hiệu hóa tài khoản của mình',
      });
    }
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      'active-admin-continuity',
    ]);
    const rows = await client.query<{ total: string }>(
      `select count(*)::text as total from users
       where role = 'admin' and status = 'active' and deleted_at is null and id <> $1`,
      [current.id],
    );
    if (Number(rows[0]?.total ?? 0) === 0) {
      throw new ConflictException({
        code: 'LAST_ADMIN_REQUIRED',
        message: 'Hệ thống phải còn ít nhất một quản trị viên đang hoạt động',
      });
    }
  }
}

function roleNotAssignable(userIds?: string[]): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'ROLE_NOT_ASSIGNABLE',
    message: 'Vai trò Trưởng nhóm chỉ được gán hoặc gỡ qua bổ nhiệm và thôi bổ nhiệm',
    ...(userIds ? { details: userIds.map((user_id) => ({ user_id })) } : {}),
  });
}

function teamLeadActive(userIds?: string[]): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'TEAM_LEAD_ACTIVE',
    message: 'Hãy thôi bổ nhiệm trưởng nhóm trước khi vô hiệu hoá hoặc xoá tài khoản',
    ...(userIds ? { details: userIds.map((user_id) => ({ user_id })) } : {}),
  });
}

/**
 * Admin spec v1.1 §1.1 rule 2: `team_lead` is neither assigned nor removed through user
 * updates, and an active team lead cannot be deactivated or deleted before revocation.
 */
function assertTeamLeadUnchanged(
  current: Pick<UserDatabaseRow, 'role'>,
  nextRole: UserRole,
  nextStatus: UserDatabaseRow['status'],
): void {
  if (current.role !== nextRole && (current.role === 'team_lead' || nextRole === 'team_lead'))
    throw roleNotAssignable();
  if (current.role === 'team_lead' && nextStatus !== 'active') throw teamLeadActive();
}
