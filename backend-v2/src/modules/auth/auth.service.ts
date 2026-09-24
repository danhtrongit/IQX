import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { SignJWT, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { EmailService } from './email.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import {
  toAuthenticatedUser,
  toPublicUser,
  type AuthenticatedUser,
  type PublicUser,
  type UserDatabaseRow,
} from './auth.types.js';

type TokenPair = { access_token: string; refresh_token: string; token_type: 'bearer' };
type RefreshRow = {
  id: string;
  user_id: string;
  jti: string;
  token_family: string;
  expires_at: Date | string;
  revoked: boolean;
};

const USER_COLUMNS = `
  id, email, hashed_password, phone_number, phone_country_code,
  phone_national_number, phone_e164, phone_verified_at, full_name,
  avatar_url, date_of_birth, gender, country, province_state, city,
  district, ward, street_address, postal_code, role, status,
  is_email_verified, email_verified_at, last_login_at, deleted_at,
  created_at, updated_at`;

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async register(input: RegisterInput): Promise<PublicUser> {
    this.accessSecret();
    this.refreshSecret();
    const phone = normalizePhone(input.phone_number);
    const passwordHash = await bcrypt.hash(input.password, 12);
    let row: UserDatabaseRow;
    try {
      row = await this.database.transaction(async (tx) => {
        const existing = await tx.query<{ id: string }>(
          'select id from users where lower(email) = lower($1) limit 1',
          [input.email],
        );
        if (existing.length) {
          throw new ConflictException({
            code: 'EMAIL_EXISTS',
            message: 'Đã tồn tại người dùng với email này',
          });
        }
        if (phone.e164) {
          const samePhone = await tx.query<{ id: string }>(
            'select id from users where phone_e164 = $1 limit 1',
            [phone.e164],
          );
          if (samePhone.length) {
            throw new ConflictException({
              code: 'PHONE_EXISTS',
              message: 'Đã tồn tại người dùng với số điện thoại này',
            });
          }
        }
        const users = await tx.query<UserDatabaseRow>(
          `insert into users
            (id, email, hashed_password, full_name, phone_number, phone_country_code,
             phone_national_number, phone_e164, role, status, is_email_verified,
             created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'user', 'active', false, now(), now())
           returning ${USER_COLUMNS}`,
          [
            randomUUID(),
            input.email,
            passwordHash,
            input.full_name,
            phone.original,
            phone.countryCode,
            phone.nationalNumber,
            phone.e164,
          ],
        );
        const created = users[0];
        if (!created) throw new InternalServerErrorException('Không thể tạo người dùng');
        const trialGranted = await this.grantTrialIfAvailable(tx, created.id);
        if (!trialGranted) return created;
        const refreshed = await tx.query<UserDatabaseRow>(
          `select ${USER_COLUMNS} from users where id = $1 limit 1`,
          [created.id],
        );
        return refreshed[0] ?? created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'USER_EXISTS',
          message: 'Email hoặc số điện thoại đã tồn tại',
        });
      }
      throw error;
    }

    const token = await this.createEmailToken(row, 'verify-email', 24 * 60 * 60);
    void this.email.sendVerification(row.email, row.full_name, token);
    return toPublicUser(row);
  }

  async login(
    input: LoginInput,
    context: { ip: string | null; userAgent: string | null },
  ): Promise<TokenPair> {
    const rows = await this.database.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where lower(email) = lower($1) limit 1`,
      [input.email],
    );
    const user = rows[0];
    const valid = user ? await bcrypt.compare(input.password, user.hashed_password) : false;
    if (!user || !valid || user.status !== 'active') {
      await this.recordLogin(
        user?.id ?? null,
        input.email,
        false,
        user && valid ? `status:${user.status}` : 'invalid_credentials',
        context,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng',
      });
    }

    const family = randomUUID();
    const pair = await this.issuePair(user, family);
    const refreshPayload = await this.verifyRefresh(pair.refresh_token);
    await this.database.transaction(async (tx) => {
      await tx.query(
        `insert into refresh_tokens (id, user_id, jti, token_family, expires_at, revoked, created_at)
         values ($1, $2, $3, $4, to_timestamp($5), false, now())`,
        [randomUUID(), user.id, refreshPayload.jti, family, refreshPayload.exp],
      );
      await tx.query('update users set last_login_at = now(), updated_at = now() where id = $1', [
        user.id,
      ]);
      await this.recordLogin(user.id, user.email, true, null, context, tx);
    });
    return pair;
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: Required<Pick<JWTPayload, 'sub' | 'jti' | 'exp'>> & JWTPayload;
    try {
      payload = await this.verifyRefresh(refreshToken);
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new UnauthorizedException({
          code: 'REFRESH_EXPIRED',
          message: 'Refresh token đã hết hạn',
        });
      }
      throw new UnauthorizedException({
        code: 'REFRESH_INVALID',
        message: 'Refresh token không hợp lệ',
      });
    }
    const family = typeof payload.family === 'string' ? payload.family : '';
    if (!family)
      throw new UnauthorizedException({
        code: 'REFRESH_INVALID',
        message: 'Refresh token không hợp lệ',
      });

    const result = await this.database.transaction(async (tx) => {
      const storedRows = await tx.query<RefreshRow>(
        'select id, user_id, jti, token_family, expires_at, revoked from refresh_tokens where jti = $1 for update',
        [payload.jti],
      );
      const stored = storedRows[0];
      if (!stored) return { kind: 'invalid' } as const;
      if (stored.token_family !== family || stored.user_id !== payload.sub) {
        await tx.query('update refresh_tokens set revoked = true where token_family = $1', [
          stored.token_family,
        ]);
        return { kind: 'replay' } as const;
      }
      const claimed = await tx.query<{ id: string }>(
        `update refresh_tokens set revoked = true
         where jti = $1 and revoked = false and expires_at > now() returning id`,
        [payload.jti],
      );
      if (!claimed.length) {
        await tx.query('update refresh_tokens set revoked = true where token_family = $1', [
          family,
        ]);
        return { kind: 'replay' } as const;
      }
      const users = await tx.query<UserDatabaseRow>(
        `select ${USER_COLUMNS} from users where id = $1 and status = 'active' and deleted_at is null`,
        [stored.user_id],
      );
      const user = users[0];
      if (!user) return { kind: 'invalid' } as const;
      const pair = await this.issuePair(user, family);
      const next = await this.verifyRefresh(pair.refresh_token);
      await tx.query(
        `insert into refresh_tokens (id, user_id, jti, token_family, expires_at, revoked, created_at)
         values ($1, $2, $3, $4, to_timestamp($5), false, now())`,
        [randomUUID(), user.id, next.jti, family, next.exp],
      );
      return { kind: 'success', pair } as const;
    });
    if (result.kind === 'success') return result.pair;
    if (result.kind === 'replay') {
      throw new UnauthorizedException({
        code: 'REFRESH_REPLAY',
        message: 'Refresh token đã bị thu hồi (có thể bị tấn công replay)',
      });
    }
    throw new UnauthorizedException({
      code: 'REFRESH_INVALID',
      message: 'Refresh token không hợp lệ',
    });
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.accessSecret(), {
        algorithms: ['HS256'],
        issuer: 'iqx',
        audience: 'iqx-api',
      }));
    } catch (error) {
      const code = error instanceof joseErrors.JWTExpired ? 'ACCESS_EXPIRED' : 'ACCESS_INVALID';
      throw new UnauthorizedException({
        code,
        message: 'Access token không hợp lệ hoặc đã hết hạn',
      });
    }
    const family = typeof payload.family === 'string' ? payload.family : '';
    if (payload.type !== 'access' || typeof payload.sub !== 'string' || !family) {
      throw new UnauthorizedException({ code: 'ACCESS_INVALID', message: 'Sai loại token' });
    }
    const rows = await this.database.query<UserDatabaseRow & { session_active: boolean }>(
      `select ${USER_COLUMNS}, exists(
         select 1 from refresh_tokens r
          where r.user_id = users.id and r.token_family = $2
            and r.revoked = false and r.expires_at > now()
       ) as session_active
       from users where id = $1 and deleted_at is null limit 1`,
      [payload.sub, family],
    );
    const user = rows[0];
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Tài khoản không còn khả dụng',
      });
    }
    if (!user.session_active) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.',
      });
    }
    return toAuthenticatedUser(user);
  }

  async getPublicUser(id: string): Promise<PublicUser> {
    const rows = await this.database.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where id = $1 and deleted_at is null limit 1`,
      [id],
    );
    if (!rows[0])
      throw new UnauthorizedException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Tài khoản không còn khả dụng',
      });
    return toPublicUser(rows[0]);
  }

  async logout(userId: string): Promise<void> {
    await this.database.query(
      'update refresh_tokens set revoked = true where user_id = $1 and revoked = false',
      [userId],
    );
  }

  async forgotPassword(email: string): Promise<void> {
    const rows = await this.database.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where lower(email) = lower($1) and status = 'active' limit 1`,
      [email],
    );
    const user = rows[0];
    if (!user) return;
    const token = await this.createEmailToken(user, 'password-reset', 60 * 60);
    await this.email.sendPasswordReset(user.email, user.full_name, token);
  }

  async verifyEmail(token: string): Promise<void> {
    const payload = await this.verifyEmailToken(token, 'verify-email');
    const updated = await this.database.query<{ id: string }>(
      `update users set is_email_verified = true, email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
       where id = $1 and status <> 'deleted' returning id`,
      [payload.sub],
    );
    if (!updated.length)
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'Liên kết không hợp lệ hoặc đã hết hạn',
      });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const payload = await this.verifyEmailToken(token, 'password-reset');
    const hash = await bcrypt.hash(password, 12);
    await this.database.transaction(async (tx) => {
      // The password fingerprint is the one-time capability embedded in the
      // signed reset token. Lock and re-read the row in this same transaction
      // so two concurrent requests cannot both validate the old fingerprint.
      // The second request waits for the first transaction, then observes the
      // new hash and rolls back without revoking any sessions.
      const users = await tx.query<{ id: string; hashed_password: string }>(
        `select id, hashed_password from users
         where id = $1 and status <> 'deleted'
         limit 1 for update`,
        [payload.sub],
      );
      const user = users[0];
      if (!user || payload.password_hash !== passwordFingerprint(user.hashed_password)) {
        throw new BadRequestException({
          code: 'TOKEN_INVALID',
          message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
        });
      }
      await tx.query('update users set hashed_password = $1, updated_at = now() where id = $2', [
        hash,
        user.id,
      ]);
      await tx.query(
        'update refresh_tokens set revoked = true where user_id = $1 and revoked = false',
        [user.id],
      );
    });
  }

  async createVerificationToken(userId: string): Promise<{ user: UserDatabaseRow; token: string }> {
    const users = await this.database.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where id = $1 and status <> 'deleted' limit 1`,
      [userId],
    );
    const user = users[0];
    if (!user)
      throw new BadRequestException({
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy người dùng',
      });
    return { user, token: await this.createEmailToken(user, 'verify-email', 24 * 60 * 60) };
  }

  async sendVerificationEmail(email: string, fullName: string, token: string): Promise<boolean> {
    return this.email.sendVerification(email, fullName, token);
  }

  async createPasswordResetToken(
    userId: string,
  ): Promise<{ user: UserDatabaseRow; token: string }> {
    const users = await this.database.query<UserDatabaseRow>(
      `select ${USER_COLUMNS} from users where id = $1 and status <> 'deleted' limit 1`,
      [userId],
    );
    const user = users[0];
    if (!user)
      throw new BadRequestException({
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy người dùng',
      });
    return { user, token: await this.createEmailToken(user, 'password-reset', 60 * 60) };
  }

  async sendPasswordResetEmail(email: string, fullName: string, token: string): Promise<boolean> {
    return this.email.sendPasswordReset(email, fullName, token);
  }

  private async issuePair(user: UserDatabaseRow, family: string): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessMinutes = Number(this.config.get('ACCESS_TOKEN_EXPIRE_MINUTES') ?? 30);
    const refreshDays = Number(this.config.get('REFRESH_TOKEN_EXPIRE_DAYS') ?? 7);
    const accessToken = await new SignJWT({ type: 'access', role: user.role, family })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('iqx')
      .setAudience('iqx-api')
      .setIssuedAt(now)
      .setExpirationTime(now + accessMinutes * 60)
      .sign(this.accessSecret());
    const refreshToken = await new SignJWT({ type: 'refresh', family })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuer('iqx')
      .setAudience('iqx-refresh')
      .setIssuedAt(now)
      .setExpirationTime(now + refreshDays * 24 * 60 * 60)
      .sign(this.refreshSecret());
    return { access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer' };
  }

  private async verifyRefresh(
    token: string,
  ): Promise<Required<Pick<JWTPayload, 'sub' | 'jti' | 'exp'>> & JWTPayload> {
    const { payload } = await jwtVerify(token, this.refreshSecret(), {
      algorithms: ['HS256'],
      issuer: 'iqx',
      audience: 'iqx-refresh',
    });
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti || !payload.exp)
      throw new joseErrors.JWTInvalid('invalid refresh claims');
    return payload as Required<Pick<JWTPayload, 'sub' | 'jti' | 'exp'>> & JWTPayload;
  }

  private async createEmailToken(
    user: UserDatabaseRow,
    purpose: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const claims: Record<string, string> = { purpose };
    if (purpose === 'password-reset')
      claims.password_hash = passwordFingerprint(user.hashed_password);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('iqx')
      .setAudience('iqx-email')
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(this.accessSecret());
  }

  private async verifyEmailToken(
    token: string,
    purpose: string,
  ): Promise<JWTPayload & { sub: string }> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret(), {
        algorithms: ['HS256'],
        issuer: 'iqx',
        audience: 'iqx-email',
      });
      if (payload.purpose !== purpose || !payload.sub) throw new Error('wrong token purpose');
      return payload as JWTPayload & { sub: string };
    } catch {
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'Liên kết không hợp lệ hoặc đã hết hạn',
      });
    }
  }

  private accessSecret(): Uint8Array {
    return this.secret('JWT_SECRET_KEY');
  }

  private refreshSecret(): Uint8Array {
    return this.secret('JWT_REFRESH_SECRET_KEY');
  }

  private secret(name: string): Uint8Array {
    const value = this.config.get<string>(name);
    if (!value || value.length < 32)
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Authentication secrets are not configured securely',
      });
    return new TextEncoder().encode(value);
  }

  private async recordLogin(
    userId: string | null,
    email: string,
    success: boolean,
    failureReason: string | null,
    context: { ip: string | null; userAgent: string | null },
    client: SqlClient = this.database,
  ): Promise<void> {
    await client.query(
      `insert into user_login_history
        (id, user_id, email, success, failure_reason, ip, user_agent, login_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        randomUUID(),
        userId,
        email.toLowerCase(),
        success,
        failureReason,
        context.ip,
        context.userAgent?.slice(0, 500) ?? null,
      ],
    );
  }

  private async grantTrialIfAvailable(client: SqlClient, userId: string): Promise<boolean> {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `billing-entitlement:${userId}`,
    ]);
    const existing = await client.query<{ id: string }>(
      'select id from billing_entitlement_grants where user_id = $1 limit 1',
      [userId],
    );
    if (existing.length) return false;
    const plans = await client.query<{ id: string; duration_days: number }>(
      `select id, duration_days from premium_plans
       where code = 'TRIAL_7D' and is_active = true limit 1`,
    );
    const plan = plans[0];
    if (!plan) return false;
    const grants = await client.query<{
      id: string;
      starts_at: Date | string;
      ends_at: Date | string;
    }>(
      `insert into billing_entitlement_grants
        (id, user_id, plan_id, order_id, kind, duration_days, starts_at, ends_at,
         original_ends_at, status, granted_by_user_id, note, created_at, updated_at)
       values ($1, $2, $3, null, 'trial', $4::integer, now(),
               now() + make_interval(days => $4::integer),
               now() + make_interval(days => $4::integer),
               'active', null, 'automatic registration trial', now(), now())
       returning id, starts_at, ends_at`,
      [randomUUID(), userId, plan.id, plan.duration_days],
    );
    const grant = grants[0];
    if (!grant) return false;
    await client.query(
      `insert into premium_subscriptions
        (id, user_id, current_plan_id, current_period_start, current_period_end,
         status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, 'active', now(), now())
       on conflict (user_id) do update set
         current_plan_id = excluded.current_plan_id,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         status = 'active', cancelled_at = null, cancelled_by_user_id = null,
         cancel_reason = null, updated_at = now()`,
      [randomUUID(), userId, plan.id, grant.starts_at, grant.ends_at],
    );
    await client.query(
      `insert into billing_subscription_history
        (id, user_id, plan_id, event_type, actor_user_id, reason, days_delta, created_at)
       values ($1, $2, $3, 'grant_applied', null, 'automatic registration trial', $4, now())`,
      [randomUUID(), userId, plan.id, plan.duration_days],
    );
    await client.query(
      `update users set role = 'premium', updated_at = now()
       where id = $1 and role = 'user'`,
      [userId],
    );
    return true;
  }
}

function passwordFingerprint(hash: string): string {
  return createHash('sha256').update(hash).digest('base64url');
}

function normalizePhone(value: string | null | undefined): {
  original: string | null;
  countryCode: string | null;
  nationalNumber: string | null;
  e164: string | null;
} {
  if (!value?.trim())
    return { original: null, countryCode: null, nationalNumber: null, e164: null };
  const original = value.trim();
  const compact = original.replace(/[\s().-]/g, '');
  const e164 = compact.startsWith('+84')
    ? compact
    : compact.startsWith('0')
      ? `+84${compact.slice(1)}`
      : null;
  if (!e164 || !/^\+84\d{9,10}$/.test(e164)) {
    throw new BadRequestException({ code: 'PHONE_INVALID', message: 'Số điện thoại không hợp lệ' });
  }
  return { original, countryCode: '+84', nationalNumber: e164.slice(3), e164 };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const direct = error as { code?: unknown; cause?: { code?: unknown } };
  return direct.code === '23505' || direct.cause?.code === '23505';
}
