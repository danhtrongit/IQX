export interface AuthUser {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  role: string
  status: string
  isActive: boolean
  createdAt: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  fullName: string
  phone?: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

/** Raw backend UserResponse (snake_case). */
export interface BackendUserResponse {
  id: string
  email: string
  full_name: string | null
  phone_number: string | null
  role: string
  status: string
  is_email_verified: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface BackendTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}
