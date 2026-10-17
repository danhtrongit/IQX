import { z } from 'zod';

import { USER_ROLES, USER_STATUSES } from './auth.types.js';
import { usernameSchema } from './user-identity.js';

const strongPassword = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => /[A-Z]/.test(value), 'Mật khẩu phải chứa ít nhất một chữ in hoa')
  .refine((value) => /[a-z]/.test(value), 'Mật khẩu phải chứa ít nhất một chữ thường')
  .refine((value) => /\d/.test(value), 'Mật khẩu phải chứa ít nhất một chữ số')
  .refine(
    (value) => /[!@#$%^&*(),.?":{}|<>]/.test(value),
    'Mật khẩu phải chứa ít nhất một ký tự đặc biệt',
  );

/** Accepted shape of a referral code: a username or a legacy LS_/CTV_ code. */
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

const email = z
  .string()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

export const registerSchema = z.object({
  email,
  password: strongPassword,
  full_name: z.string().trim().min(1).max(200),
  username: usernameSchema,
  // Admin spec v1.1 §2.1: required at registration; normalized to a Vietnamese mobile.
  phone_number: z.string().trim().min(1).max(30),
  // Admin spec v1.1 §3.1: a team lead's username, matched case-insensitively. Legacy LS_/CTV_
  // codes keep their own shape, so the case is preserved here and resolved by the service.
  referral_code: z.string().trim().regex(REFERRAL_CODE_PATTERN).nullable().optional(),
});

/**
 * Admin spec v1.1 §4.1: `identifier` is an email (contains '@') or a username. The former
 * `email` field stays accepted as an alias for clients released before v1.1.
 */
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(320).optional(),
    email: z.string().trim().min(1).max(320).optional(),
    password: z.string().min(1).max(128),
  })
  .refine((value) => Boolean(value.identifier ?? value.email), {
    message: 'Nhập email hoặc tên đăng nhập',
    path: ['identifier'],
  });
// Lenient on purpose: a malformed code answers `valid: false` rather than an error.
export const referralCodeParamSchema = z.string().max(64);
export const usernameAvailabilityQuerySchema = z.object({ u: usernameSchema });
export const usernameChangeSchema = z.object({ username: usernameSchema }).strict();
export const refreshSchema = z.object({ refresh_token: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: strongPassword,
});
export const tokenQuerySchema = z.object({ token: z.string().min(1) });

export const userUpdateSchema = z
  .object({
    full_name: nullableText(200),
    phone_number: z.string().trim().max(30).nullable().optional(),
    avatar_url: z.string().url().max(2048).nullable().optional(),
    date_of_birth: z.string().date().nullable().optional(),
    gender: nullableText(20),
    country: nullableText(100),
    province_state: nullableText(100),
    city: nullableText(100),
    district: nullableText(100),
    ward: nullableText(100),
    street_address: nullableText(500),
    postal_code: nullableText(20),
  })
  .strict();

// Admin-created accounts need a username but the phone stays optional (§2.1 rule 5). The role
// enum lists every role so a team_lead request reaches the service and gets ROLE_NOT_ASSIGNABLE.
export const adminUserCreateSchema = z.object({
  email,
  password: strongPassword,
  full_name: z.string().trim().min(1).max(200),
  username: usernameSchema,
  phone_number: z.string().trim().max(30).nullable().optional(),
  role: z.enum(USER_ROLES).default('user'),
  status: z.enum(USER_STATUSES).default('active'),
});

export const adminUserUpdateSchema = userUpdateSchema.extend({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  is_email_verified: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UsernameAvailabilityQuery = z.infer<typeof usernameAvailabilityQuerySchema>;
export type UsernameChangeInput = z.infer<typeof usernameChangeSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
