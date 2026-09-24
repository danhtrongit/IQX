import { z } from 'zod';

import { USER_ROLES, USER_STATUSES } from './auth.types.js';

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
  phone_number: z.string().trim().max(30).nullable().optional(),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
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

export const adminUserCreateSchema = registerSchema.extend({
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
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
