import { api, getAccessToken, setAccessToken, setRefreshToken } from "./client"

export interface AdminUser {
  id: string
  email: string
  fullName: string | null
  role: string
  status: string
  isActive: boolean
  createdAt: string
}

interface BackendUserResponse {
  id: string
  email: string
  full_name: string | null
  role: string
  status: string
  created_at: string
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

export function adaptAdminUser(raw: BackendUserResponse): AdminUser {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: raw.full_name || null,
    role: raw.role,
    status: raw.status,
    isActive: raw.status === "active",
    createdAt: raw.created_at,
  }
}

export const authApi = {
  login: async (payload: { email: string; password: string }): Promise<AuthResponse> => {
    const tokenRes = await api.post("auth/login", { json: payload }).json<BackendTokenResponse>()
    setAccessToken(tokenRes.access_token)
    const userRaw = await api.get("auth/me").json<BackendUserResponse>()
    if (userRaw.role !== "admin") {
      setAccessToken(null)
      throw new Error("Tài khoản này không có quyền truy cập trang quản trị")
    }
    return {
      user: adaptAdminUser(userRaw),
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    }
  },
  logout: () => api.post("auth/logout").json<{ message: string }>(),
  getMe: async (): Promise<AdminUser> => adaptAdminUser(await api.get("auth/me").json<BackendUserResponse>()),
}

export { getAccessToken, setAccessToken, setRefreshToken }
