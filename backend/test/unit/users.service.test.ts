import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from '../../src/modules/users/admin-users.service.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import { UsersService } from '../../src/modules/users/users.service.js';

const audit: AuditContext = {
  adminId: '161101b0-e293-4d33-b9a5-a1bb3e351985',
  actorRole: 'admin',
  ip: null,
  userAgent: null,
  requestId: null,
};
const leadId = '6c4b9f2e-3f55-4a43-8b0b-0f1f7b3a9d10';

function errorCode(error: unknown): unknown {
  return (error as { getResponse?: () => { code?: string } }).getResponse?.().code;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

function transactional(rows: Array<Record<string, unknown>>) {
  const query = vi.fn().mockResolvedValue(rows);
  return {
    query,
    database: {
      query,
      transaction: <T>(operation: (client: { query: typeof query }) => Promise<T>) =>
        operation({ query }),
    },
  };
}

describe('UsersService', () => {
  it('uses a whitelisted sort column and parameterizes user filters', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ total: '1' }])
      .mockResolvedValueOnce([
        {
          id: '031c714e-4145-4895-869b-d54c1c5bc86b',
          email: 'person@example.com',
          full_name: 'Person',
          role: 'user',
          status: 'active',
          created_at: new Date(),
        },
      ]);
    const users = new UsersService({ query } as never, {} as never);
    const result = await users.list({
      page: 1,
      page_size: 20,
      search: "x%' or true --",
      role: 'user',
      sort_by: 'email',
      sort_order: 'asc',
    });

    expect(result.total).toBe(1);
    expect(query.mock.calls[0]?.[0]).not.toContain("x%' or true --");
    expect(query.mock.calls[1]?.[0]).toContain('order by email asc');
    expect(query.mock.calls[0]?.[1]).toEqual(["%x%' or true --%", 'user']);
  });

  it('prevents an administrator from downgrading their own account', async () => {
    const current = {
      id: '031c714e-4145-4895-869b-d54c1c5bc86b',
      role: 'admin',
      status: 'active',
    };
    const query = vi.fn().mockResolvedValueOnce([current]);
    const database = {
      transaction: <T>(operation: (client: { query: typeof query }) => Promise<T>) =>
        operation({ query }),
    };
    const users = new UsersService(database as never, {} as never);

    await expect(
      users.adminUpdate(
        current.id,
        { role: 'user' },
        {
          adminId: current.id,
          actorRole: 'admin',
          ip: null,
          userAgent: null,
          requestId: null,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('UsersService team_lead guards (admin spec v1.1 §1.1)', () => {
  it('refuses to assign team_lead through PATCH or user creation', async () => {
    const { database, query } = transactional([{ id: leadId, role: 'user', status: 'active' }]);
    const users = new UsersService(database as never, {} as never);

    const patch = await rejection(users.adminUpdate(leadId, { role: 'team_lead' }, audit));
    expect(patch).toBeInstanceOf(UnprocessableEntityException);
    expect(errorCode(patch)).toBe('ROLE_NOT_ASSIGNABLE');

    const create = await rejection(
      users.adminCreate(
        {
          email: 'lead@example.com',
          password: 'Password1!',
          full_name: 'Lead',
          username: 'lead.one',
          role: 'team_lead',
          status: 'active',
        },
        audit,
      ),
    );
    expect(errorCode(create)).toBe('ROLE_NOT_ASSIGNABLE');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('update users'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into users'))).toBe(false);
  });

  it('refuses to remove team_lead or deactivate/delete an active team lead', async () => {
    const lead = { id: leadId, role: 'team_lead', status: 'active' };
    const { database, query } = transactional([lead]);
    const users = new UsersService(database as never, {} as never);

    expect(errorCode(await rejection(users.adminUpdate(leadId, { role: 'user' }, audit)))).toBe(
      'ROLE_NOT_ASSIGNABLE',
    );
    expect(
      errorCode(await rejection(users.adminUpdate(leadId, { status: 'suspended' }, audit))),
    ).toBe('TEAM_LEAD_ACTIVE');
    expect(errorCode(await rejection(users.softDelete(leadId, audit)))).toBe('TEAM_LEAD_ACTIVE');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('update users'))).toBe(false);
  });

  it('rejects a whole bulk request that touches team_lead before changing any row', async () => {
    const otherId = '0e3c3f9b-5a29-4c55-9a43-7bbad8a1a8a1';
    const { database, query } = transactional([{ id: leadId }]);
    const users = new UsersService(database as never, {} as never);

    const assign = await rejection(
      users.bulkUpdate({ user_ids: [otherId], op: 'set_role', value: 'team_lead' }, audit),
    );
    expect(errorCode(assign)).toBe('ROLE_NOT_ASSIGNABLE');
    const demote = await rejection(
      users.bulkUpdate({ user_ids: [otherId, leadId], op: 'set_role', value: 'user' }, audit),
    );
    expect(errorCode(demote)).toBe('ROLE_NOT_ASSIGNABLE');
    const remove = await rejection(
      users.bulkUpdate({ user_ids: [otherId, leadId], op: 'soft_delete' }, audit),
    );
    expect(remove).toBeInstanceOf(UnprocessableEntityException);
    expect(errorCode(remove)).toBe('TEAM_LEAD_ACTIVE');
    const suspend = await rejection(
      users.bulkUpdate({ user_ids: [leadId], op: 'set_status', value: 'suspended' }, audit),
    );
    expect(errorCode(suspend)).toBe('TEAM_LEAD_ACTIVE');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('for update'))).toBe(false);
  });

  it('allows a single username change and locks team leads (DECISION 1)', async () => {
    const base = { id: leadId, username: 'auto.name', status: 'active' };
    const locked = transactional([{ ...base, role: 'user', username_change_allowed: false }]);
    expect(
      errorCode(
        await rejection(
          new UsersService(locked.database as never, {} as never).changeOwnUsername(
            leadId,
            'new.name',
          ),
        ),
      ),
    ).toBe('USERNAME_LOCKED');
    const lead = transactional([{ ...base, role: 'team_lead', username_change_allowed: true }]);
    expect(
      errorCode(
        await rejection(
          new UsersService(lead.database as never, {} as never).changeOwnUsername(
            leadId,
            'new.name',
          ),
        ),
      ),
    ).toBe('USERNAME_LOCKED');

    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ...base, role: 'user', username_change_allowed: true }])
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'uq_users_username_lower',
        }),
      );
    const taken = new UsersService(
      {
        transaction: <T>(operation: (client: { query: typeof query }) => Promise<T>) =>
          operation({ query }),
      } as never,
      {} as never,
    );
    const conflict = await rejection(taken.changeOwnUsername(leadId, 'taken.name'));
    expect(conflict).toBeInstanceOf(ConflictException);
    expect(errorCode(conflict)).toBe('USERNAME_TAKEN');
  });
});

describe('AdminUsersService', () => {
  it('does not rotate a password when the reset email cannot be sent', async () => {
    const transaction = vi.fn();
    const auth = {
      createPasswordResetToken: vi.fn().mockResolvedValue({
        user: { email: 'person@example.com', full_name: 'Person' },
        token: 'signed-token',
      }),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(false),
    };
    const service = new AdminUsersService({ transaction } as never, auth as never, {} as never);

    await expect(
      service.resetPassword('031c714e-4145-4895-869b-d54c1c5bc86b', {
        adminId: '161101b0-e293-4d33-b9a5-a1bb3e351985',
        actorRole: 'admin',
        ip: null,
        userAgent: null,
        requestId: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
