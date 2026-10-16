import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { UserDatabaseRow } from '../../src/modules/auth/auth.types.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

const secret = 'a-secure-test-secret-that-is-at-least-32-characters';
const refreshSecret = 'a-separate-refresh-secret-with-at-least-32-characters';
const sessionFamily = '53474b20-7707-45d6-9be8-19827389e929';

function user(status: UserDatabaseRow['status'] = 'active'): UserDatabaseRow {
  return {
    id: 'd9d790c8-1395-4c61-8774-20e45cc3fd36',
    email: 'user@example.com',
    username: 'user.example',
    username_change_allowed: false,
    hashed_password: '$2b$12$not-used',
    phone_number: null,
    phone_country_code: null,
    phone_national_number: null,
    phone_e164: null,
    phone_verified_at: null,
    full_name: 'User',
    avatar_url: null,
    date_of_birth: null,
    gender: null,
    country: null,
    province_state: null,
    city: null,
    district: null,
    ward: null,
    street_address: null,
    postal_code: null,
    role: 'user',
    status,
    is_email_verified: false,
    email_verified_at: null,
    last_login_at: null,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function service(database: Partial<DatabaseService>): AuthService {
  const config = {
    get: (name: string) =>
      ({
        JWT_SECRET_KEY: secret,
        JWT_REFRESH_SECRET_KEY: refreshSecret,
        ACCESS_TOKEN_EXPIRE_MINUTES: 30,
        REFRESH_TOKEN_EXPIRE_DAYS: 7,
      })[name],
  };
  return new AuthService(
    database as DatabaseService,
    config as never,
    { sendVerification: vi.fn(), sendPasswordReset: vi.fn() } as never,
  );
}

describe('AuthService', () => {
  it('creates the trial grant and subscription projection atomically at registration', async () => {
    const created = user();
    const premium = { ...created, role: 'premium' as const };
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.startsWith('select id from users where lower')) return [];
      if (sql.startsWith('insert into users')) return [created];
      if (sql.includes('from billing_entitlement_grants where user_id')) return [];
      if (sql.includes("where code = 'TRIAL_7D'")) {
        return [{ id: '63a5ab15-12a9-4db2-a5c6-9cf97aa385e4', duration_days: 7 }];
      }
      if (sql.startsWith('insert into billing_entitlement_grants')) {
        return [{ id: 'grant', starts_at: new Date(), ends_at: new Date(Date.now() + 604800000) }];
      }
      if (sql.includes('from users where id = $1 limit 1')) return [premium];
      return [];
    });
    const database = {
      transaction: <T>(operation: (client: SqlClient) => Promise<T>) =>
        operation({ query: query as SqlClient['query'] }),
    };

    const result = await service(database).register({
      email: 'user@example.com',
      password: 'Password1!',
      full_name: 'User',
      username: 'user.example',
      phone_number: '0912 345 678',
    });

    expect(result.role).toBe('premium');
    expect(statements.some((sql) => sql.startsWith('insert into billing_entitlement_grants'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.startsWith('insert into premium_subscriptions'))).toBe(
      true,
    );
    expect(
      statements.some((sql) => sql.startsWith('insert into billing_subscription_history')),
    ).toBe(true);
  });

  describe('registration by referral code (admin spec v1.1 §3.3, §7.1)', () => {
    const leadId = '0f7e0b8e-1d6b-4d0e-9a52-1f7c6a8d4a10';
    const input = {
      email: 'user@example.com',
      password: 'Password1!',
      full_name: 'User',
      username: 'user.example',
      phone_number: '0912 345 678',
    };

    function referralDatabase(policy: Record<string, unknown> | null) {
      const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
      let offerGranted = false;
      const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.startsWith('select id from users where')) return [];
        if (sql.includes('join team_lead_profiles p')) return policy ? [{ user_id: leadId }] : [];
        if (sql.includes('from team_lead_policies')) return policy ? [policy] : [];
        if (sql.startsWith('insert into users')) return [user()];
        if (sql.includes("where code = 'REFERRAL_OFFER'")) return [{ id: 'offer-plan' }];
        if (
          sql.includes("'referral_offer'") &&
          sql.includes('insert into billing_entitlement_grants')
        ) {
          offerGranted = true;
          return [{ id: 'offer-grant', starts_at: new Date(), ends_at: new Date() }];
        }
        if (sql.includes('from billing_entitlement_grants where user_id = $1 limit 1'))
          return offerGranted ? [{ id: 'offer-grant' }] : [];
        if (sql.includes("where code = 'TRIAL_7D'"))
          return [{ id: 'trial-plan', duration_days: 7 }];
        if (sql.startsWith('insert into billing_entitlement_grants'))
          return [{ id: 'trial', starts_at: new Date(), ends_at: new Date() }];
        if (sql.includes('from users where id = $1 limit 1')) return [user()];
        return [];
      });
      const database = {
        transaction: <T>(operation: (client: SqlClient) => Promise<T>) =>
          operation({ query: query as SqlClient['query'] }),
      };
      return { calls, auth: service(database) };
    }

    it('rejects an unknown code with 422 before creating the account', async () => {
      const { calls, auth } = referralDatabase(null);
      await expect(auth.register({ ...input, referral_code: 'NoSuch.Lead' })).rejects.toMatchObject(
        {
          status: 422,
          response: expect.objectContaining({ code: 'REFERRAL_CODE_INVALID' }),
        },
      );
      const lookup = calls.find(({ sql }) => sql.includes('join team_lead_profiles p'));
      expect(lookup?.sql).toContain("p.status = 'active'");
      expect(lookup?.sql).toContain('for share of p');
      expect(lookup?.params).toEqual(['nosuch.lead']);
      expect(calls.some(({ sql }) => sql.startsWith('insert into users'))).toBe(false);
    });

    it('joins the group and grants the offer instead of the trial', async () => {
      const { calls, auth } = referralDatabase({
        id: 'policy-id',
        lead_user_id: leadId,
        commission_pct: 20,
        offer_type: 'days',
        offer_days: 30,
        offer_version_id: 'version-id',
      });
      await auth.register({ ...input, referral_code: 'Lead.One' });
      const insert = calls.find(({ sql }) => sql.startsWith('insert into users'));
      expect(insert?.sql).toContain('group_lead_id, group_joined_at, group_join_via');
      expect(insert?.params[8]).toBe(leadId);
      const history = calls.find(({ sql }) => sql.includes('insert into group_membership_history'));
      expect(history?.sql).toContain("'join_code'");
      expect(history?.sql).toContain("'user'");
      const offer = calls.findIndex(
        ({ sql }) =>
          sql.includes("'referral_offer'") &&
          sql.includes('insert into billing_entitlement_grants'),
      );
      expect(offer).toBeGreaterThan(-1);
      expect(calls[offer]?.params.slice(6)).toEqual(['policy-id', 'version-id']);
      expect(calls.some(({ sql }) => sql.includes("where code = 'TRIAL_7D'"))).toBe(false);
      const audit = calls.find(({ sql }) => sql.includes('system.referral_offer_grant'));
      expect(audit?.sql).toContain("'system'");
    });

    it('still grants the trial when the policy has no offer', async () => {
      const { calls, auth } = referralDatabase({
        id: 'policy-id',
        lead_user_id: leadId,
        commission_pct: 20,
        offer_type: 'none',
        offer_days: null,
        offer_version_id: 'version-id',
      });
      await auth.register({ ...input, referral_code: 'lead.one' });
      expect(calls.some(({ sql }) => sql.includes("'referral_offer'"))).toBe(false);
      expect(calls.some(({ sql }) => sql.includes("where code = 'TRIAL_7D'"))).toBe(true);
    });
  });

  it.each([
    ['User.Example', 'lower(username) = $1', 'user.example'],
    ['User@Example.com', 'lower(email) = $1', 'user@example.com'],
  ])(
    'looks %s up by the matching column and records the account email',
    async (identifier, clause, normalized) => {
      const query = vi.fn(async (sql: string, _params?: readonly unknown[]) =>
        sql.includes('from users where') ? [] : [],
      );
      const auth = service({ query: query as never });
      await expect(
        auth.login({ identifier, password: 'Password1!' }, { ip: null, userAgent: null }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
      });
      expect(query.mock.calls[0]?.[0]).toContain(clause);
      expect(query.mock.calls[0]?.[1]).toEqual([normalized]);
      const history = query.mock.calls.find(([sql]) => sql.includes('user_login_history'));
      expect(history?.[1]?.[2]).toBe(normalized);
    },
  );

  it('keeps accepting the legacy email field and logs the stored email on failure', async () => {
    const row = user();
    const query = vi.fn(async (sql: string, _params?: readonly unknown[]) =>
      sql.includes('from users where') ? [row] : [],
    );
    await expect(
      service({ query: query as never }).login(
        { email: 'USER.EXAMPLE', password: 'wrong' },
        { ip: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) });
    expect(query.mock.calls[0]?.[0]).toContain('lower(username) = $1');
    const history = query.mock.calls.find(([sql]) => sql.includes('user_login_history'));
    expect(history?.[1]?.[2]).toBe(row.email);
  });

  it('verifies access claims and reloads authoritative role/status from the database', async () => {
    const row = user();
    row.role = 'premium';
    const database = { query: vi.fn().mockResolvedValue([{ ...row, session_active: true }]) };
    const token = await new SignJWT({ type: 'access', role: 'user', family: sessionFamily })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(row.id)
      .setIssuer('iqx')
      .setAudience('iqx-api')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));

    await expect(service(database).authenticate(token)).resolves.toMatchObject({
      id: row.id,
      role: 'premium',
      status: 'active',
    });
  });

  it('rejects access when the database account is suspended', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([{ ...user('suspended'), session_active: true }]),
    };
    const token = await new SignJWT({ type: 'access', family: sessionFamily })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user().id)
      .setIssuer('iqx')
      .setAudience('iqx-api')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));

    await expect(service(database).authenticate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an access token after its session family has been revoked', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([{ ...user(), session_active: false }]),
    };
    const token = await new SignJWT({ type: 'access', family: sessionFamily })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user().id)
      .setIssuer('iqx')
      .setAudience('iqx-api')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));

    await expect(service(database).authenticate(token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_REVOKED' }),
    });
  });

  it('revokes the whole family when a refresh token is replayed', async () => {
    const family = '4f15458c-49c9-4593-8e0e-17037d5647ac';
    const jti = '28166eab-ef50-4d85-af73-adf027c49c31';
    const token = await new SignJWT({ type: 'refresh', family })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user().id)
      .setJti(jti)
      .setIssuer('iqx')
      .setAudience('iqx-refresh')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(refreshSecret));
    const query = vi
      .fn<SqlClient['query']>()
      .mockResolvedValueOnce([
        {
          id: 'token-id',
          user_id: user().id,
          jti,
          token_family: family,
          expires_at: new Date(),
          revoked: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const database = {
      transaction: <T>(operation: (client: SqlClient) => Promise<T>) =>
        operation({ query } as SqlClient),
    };

    await expect(service(database).refresh(token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFRESH_REPLAY' }),
    });
    expect(query).toHaveBeenLastCalledWith(
      'update refresh_tokens set revoked = true where token_family = $1',
      [family],
    );
  });
});
