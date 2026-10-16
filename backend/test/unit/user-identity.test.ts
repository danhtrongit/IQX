import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  adminUserCreateSchema,
  loginSchema,
  registerSchema,
} from '../../src/modules/auth/auth.schemas.js';
import {
  normalizePhone,
  uniqueViolationConstraint,
  userConflict,
  usernameSchema,
} from '../../src/modules/auth/user-identity.js';

function code(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('username rules (admin spec v1.1 §2.1)', () => {
  it('lowercases input and enforces ^[a-z0-9._]{4,30}$', () => {
    expect(usernameSchema.parse('  Nguyen.Van_A ')).toBe('nguyen.van_a');
    for (const bad of ['abc', 'a'.repeat(31), 'has space', 'dấu', 'dash-name', 'at@sign'])
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
  });

  it('reserves the legacy LS_/CTV_ referral-code shape in any case', () => {
    expect(usernameSchema.safeParse('ls_0123456789').success).toBe(false);
    expect(usernameSchema.safeParse('CTV_ABCDEF0123').success).toBe(false);
    expect(usernameSchema.safeParse('ctv_abcdef012').success).toBe(true);
    expect(usernameSchema.safeParse('ls.0123456789').success).toBe(true);
  });

  it('requires username and phone at registration but only username for admin creation', () => {
    const base = { email: 'A@Example.com', password: 'Password1!', full_name: 'A' };
    expect(registerSchema.safeParse({ ...base, username: 'user.a' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, phone_number: '0912345678' }).success).toBe(false);
    expect(
      registerSchema.safeParse({ ...base, username: 'user.a', phone_number: null }).success,
    ).toBe(false);
    expect(
      registerSchema.parse({ ...base, username: 'User.A', phone_number: '0912345678' }),
    ).toMatchObject({ email: 'a@example.com', username: 'user.a' });
    expect(adminUserCreateSchema.safeParse(base).success).toBe(false);
    expect(adminUserCreateSchema.parse({ ...base, username: 'user.a' })).toMatchObject({
      role: 'user',
      status: 'active',
    });
  });

  it('accepts identifier and the legacy email alias at login', () => {
    expect(loginSchema.safeParse({ identifier: 'user.a', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ password: 'x' }).success).toBe(false);
  });
});

describe('normalizePhone', () => {
  it.each([
    ['0912 345 678', '+84912345678'],
    ['0912.345.678', '+84912345678'],
    ['0912-345-678', '+84912345678'],
    ['+84 912 345 678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['0351234567', '+84351234567'],
    ['(+84) 98 765 4321', '+84987654321'],
  ])('normalizes Vietnamese mobile %s to %s', (input, e164) => {
    expect(normalizePhone(input, BadRequestException)).toEqual({
      original: input,
      countryCode: '+84',
      nationalNumber: e164.slice(3),
      e164,
    });
  });

  it.each([
    '+84 0912 345 678',
    '02838123456',
    '0212345678',
    '091234567',
    '09123456789',
    '+1 912 345 678',
    'abc',
  ])('rejects %s', (input) => {
    expect(() => normalizePhone(input, BadRequestException)).toThrow(BadRequestException);
  });

  it('keeps each endpoint status and clears empty input', () => {
    let error: unknown;
    try {
      normalizePhone('123', ConflictException);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConflictException);
    expect(code(error)).toBe('PHONE_INVALID');
    expect(normalizePhone('  ', ConflictException).e164).toBeNull();
    expect(normalizePhone(null, ConflictException).e164).toBeNull();
  });
});

describe('unique violation mapping', () => {
  it('names the collided field', () => {
    const violation = (constraint: string) => ({ code: '23505', constraint });
    expect(uniqueViolationConstraint(new Error('other'))).toBeNull();
    expect(uniqueViolationConstraint({ cause: violation('ix_users_email') })).toBe(
      'ix_users_email',
    );
    expect(code(userConflict('uq_users_username_lower'))).toBe('USERNAME_TAKEN');
    expect(code(userConflict('ix_users_email'))).toBe('EMAIL_EXISTS');
    expect(code(userConflict('uq_users_phone_e164'))).toBe('PHONE_EXISTS');
    expect(code(userConflict('ix_users_phone_number'))).toBe('PHONE_EXISTS');
    expect(code(userConflict('something_else'))).toBe('USER_EXISTS');
  });
});
