import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

const secret = 'a-secure-test-secret-that-is-at-least-32-characters';
const userId = 'd9d790c8-1395-4c61-8774-20e45cc3fd36';
const initialHash = '$2b$12$initial-hash-value-used-only-as-a-reset-fingerprint';

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

async function resetToken(): Promise<string> {
  return new SignJWT({ purpose: 'password-reset', password_hash: fingerprint(initialHash) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer('iqx')
    .setAudience('iqx-email')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

class RowLock {
  private held = false;
  private readonly waiters: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.held) {
      this.held = true;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.held = true;
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.held = false;
  }
}

describe('AuthService password reset atomicity', () => {
  it('allows only one concurrent request to consume the same reset token', async () => {
    let currentHash = initialHash;
    let refreshRevocations = 0;
    const lock = new RowLock();

    const database = {
      transaction: async <T>(operation: (client: SqlClient) => Promise<T>): Promise<T> => {
        let locked = false;
        const client: SqlClient = {
          query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
            sql: string,
            values?: readonly unknown[],
          ): Promise<Row[]> => {
            if (sql.includes('select id, hashed_password from users')) {
              await lock.acquire();
              locked = true;
              return [{ id: userId, hashed_password: currentHash } as unknown as Row];
            }
            if (sql.startsWith('update users set hashed_password')) {
              currentHash = String(values?.[0]);
              return [] as Row[];
            }
            if (sql.startsWith('update refresh_tokens set revoked')) {
              refreshRevocations += 1;
              return [] as Row[];
            }
            return [] as Row[];
          },
        };
        try {
          return await operation(client);
        } finally {
          if (locked) lock.release();
        }
      },
    } as Pick<DatabaseService, 'transaction'>;

    const config = {
      get: (name: string) => ({ JWT_SECRET_KEY: secret, JWT_REFRESH_SECRET_KEY: secret })[name],
    };
    const service = new AuthService(
      database as DatabaseService,
      config as never,
      { sendVerification: () => undefined, sendPasswordReset: () => undefined } as never,
    );
    const token = await resetToken();

    const results = await Promise.allSettled([
      service.resetPassword(token, 'NewPassword1!'),
      service.resetPassword(token, 'NewPassword2!'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    expect(refreshRevocations).toBe(1);
    expect(currentHash).not.toBe(initialHash);
  }, 15_000);
});
