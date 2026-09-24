import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from '../../src/modules/users/admin-users.service.js';
import { UsersService } from '../../src/modules/users/users.service.js';

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
          ip: null,
          userAgent: null,
          requestId: null,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
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
    const service = new AdminUsersService({ transaction } as never, auth as never);

    await expect(
      service.resetPassword('031c714e-4145-4895-869b-d54c1c5bc86b', {
        adminId: '161101b0-e293-4d33-b9a5-a1bb3e351985',
        ip: null,
        userAgent: null,
        requestId: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
