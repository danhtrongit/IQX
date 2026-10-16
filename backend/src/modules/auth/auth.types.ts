/** Every role a user can hold (admin spec v1.1 §1.1). Used for listing and filtering. */
export const USER_ROLES = ['admin', 'team_lead', 'user', 'premium'] as const;
/**
 * Roles an admin may set through user create/update/bulk. `team_lead` is excluded: it is only
 * granted by the team-lead appointment and only removed by revocation (§1.1 rule 2).
 */
export const ASSIGNABLE_ROLES = ['admin', 'user', 'premium'] as const;
export const USER_STATUSES = ['active', 'inactive', 'suspended', 'deleted'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
};

export type UserDatabaseRow = AuthenticatedUser & {
  username: string;
  username_change_allowed: boolean;
  hashed_password: string;
  phone_number: string | null;
  phone_country_code: string | null;
  phone_national_number: string | null;
  phone_e164: string | null;
  phone_verified_at: Date | string | null;
  avatar_url: string | null;
  date_of_birth: Date | string | null;
  gender: string | null;
  country: string | null;
  province_state: string | null;
  city: string | null;
  district: string | null;
  ward: string | null;
  street_address: string | null;
  postal_code: string | null;
  email_verified_at: Date | string | null;
  last_login_at: Date | string | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type PublicUser = Omit<UserDatabaseRow, 'hashed_password' | 'deleted_at'>;

export function toAuthenticatedUser(row: UserDatabaseRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    status: row.status,
    is_email_verified: row.is_email_verified,
  };
}

export function toPublicUser(row: UserDatabaseRow): PublicUser {
  const { hashed_password: _hashedPassword, deleted_at: _deletedAt, ...user } = row;
  return user;
}
