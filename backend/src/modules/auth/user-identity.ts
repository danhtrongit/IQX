import { ConflictException, type HttpException } from '@nestjs/common';
import { z } from 'zod';

/** Admin spec v1.1 §2.1: lowercase, 4-30 characters of [a-z0-9._]. */
export const USERNAME_PATTERN = /^[a-z0-9._]{4,30}$/;
/**
 * Shape of the legacy LS_/CTV_ referral codes (lowercased). Reserved so a username, which is
 * also a team lead's referral code, never collides with a legacy code (DECISION 1 and 5).
 * Mirrors ck_users_username_format in migration 0023.
 */
export const RESERVED_USERNAME_PATTERN = /^(ls|ctv)_[0-9a-f]{10}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value) && !RESERVED_USERNAME_PATTERN.test(value);
}

/** Input usernames are trimmed and lowercased server-side before validation. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, 'Tên đăng nhập gồm 4-30 ký tự a-z, 0-9, dấu chấm hoặc gạch dưới')
  .refine((value) => !RESERVED_USERNAME_PATTERN.test(value), 'Tên đăng nhập này không dùng được');

export type NormalizedPhone = {
  original: string | null;
  countryCode: string | null;
  nationalNumber: string | null;
  e164: string | null;
};

const VIETNAM_MOBILE = /^(?:0|\+?84)([35789]\d{8})$/;

/**
 * Single phone normalizer for every endpoint. Only Vietnamese mobile numbers are accepted:
 * after removing spaces, dots, dashes and parentheses the value must match
 * ^(0|\+?84)(3|5|7|8|9)\d{8}$, and it is stored as +84XXXXXXXXX. Empty input clears the phone.
 * Each endpoint keeps its historical PHONE_INVALID status, so the exception type is passed in.
 */
export function normalizePhone(
  value: string | null | undefined,
  invalid: new (body: { code: string; message: string }) => HttpException,
): NormalizedPhone {
  if (!value?.trim())
    return { original: null, countryCode: null, nationalNumber: null, e164: null };
  const original = value.trim();
  const match = VIETNAM_MOBILE.exec(original.replace(/[\s().-]/g, ''));
  if (!match?.[1]) {
    throw new invalid({
      code: 'PHONE_INVALID',
      message: 'Số điện thoại chưa đúng, ví dụ 0912 345 678.',
    });
  }
  return { original, countryCode: '+84', nationalNumber: match[1], e164: `+84${match[1]}` };
}

/** Name of the violated unique constraint, or null when the error is not a unique violation. */
export function uniqueViolationConstraint(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const candidates = [error, (error as { cause?: unknown }).cause];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const pg = candidate as { code?: unknown; constraint?: unknown };
    if (pg.code === '23505') return typeof pg.constraint === 'string' ? pg.constraint : '';
  }
  return null;
}

/** Maps a unique violation on users to the field that collided. */
export function userConflict(constraint: string): ConflictException {
  if (constraint === 'uq_users_username_lower') {
    return new ConflictException({
      code: 'USERNAME_TAKEN',
      message: 'Tên đăng nhập đã được sử dụng.',
    });
  }
  if (constraint === 'ix_users_email') {
    return new ConflictException({
      code: 'EMAIL_EXISTS',
      message: 'Đã tồn tại người dùng với email này',
    });
  }
  if (constraint === 'uq_users_phone_e164' || constraint === 'ix_users_phone_number') {
    return new ConflictException({
      code: 'PHONE_EXISTS',
      message: 'Đã tồn tại người dùng với số điện thoại này',
    });
  }
  return new ConflictException({
    code: 'USER_EXISTS',
    message: 'Email, tên đăng nhập hoặc số điện thoại đã tồn tại',
  });
}
