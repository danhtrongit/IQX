import { api, setAccessToken, setRefreshToken } from "./client"

export interface AdminUser {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string | null
  role: string
  status: string
  isActive: boolean
  createdAt: string
}

interface BackendUserResponse {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string | null
  phone_number: string | null
  role: string
  status: string
  is_email_verified: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

interface BackendTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface AuthResponse {
  user: AdminUser
  accessToken: string
  refreshToken: string
}

function adaptUser(raw: BackendUserResponse): AdminUser {
  return {
    id: String(raw.id),
    email: raw.email,
    firstName: raw.first_name,
    lastName: raw.last_name,
    fullName: raw.full_name || `${raw.first_name} ${raw.last_name}`.trim() || null,
    role: raw.role,
    status: raw.status,
    isActive: raw.status === "active",
    createdAt: raw.created_at,
  }
}

export const authApi = {
  login: async (payload: { email: string; password: string }): Promise<AuthResponse> => {
    const tokenRes = await api
      .post("auth/login", { json: payload })
      .json<BackendTokenResponse>()

    // Set token temporarily to call /auth/me
    setAccessToken(tokenRes.access_token)

    const userRaw = await api.get("auth/me").json<BackendUserResponse>()

    if (userRaw.role !== "admin") {
      // Reject non-admin logins
      setAccessToken(null)
      throw new Error("Tài khoản này không có quyền truy cập trang quản trị")
    }

    const user = adaptUser(userRaw)

    return {
      user,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    }
  },

  logout: () => api.post("auth/logout").json<{ message: string }>(),

  getMe: async (): Promise<AdminUser> => {
    const raw = await api.get("auth/me").json<BackendUserResponse>()
    return adaptUser(raw)
  },
}

export { setRefreshToken, setAccessToken }
