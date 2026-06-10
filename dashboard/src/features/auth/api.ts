import { api, setAccessToken } from "@/shared/http/client"
import type {
  AuthResponse,
  AuthUser,
  BackendTokenResponse,
  BackendUserResponse,
  LoginPayload,
  RegisterPayload,
} from "./types"

/** snake_case backend user → camelCase AuthUser. */
export function adaptUser(raw: BackendUserResponse): AuthUser {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: raw.full_name || null,
    phone: raw.phone_number || null,
    role: raw.role,
    status: raw.status,
    isActive: raw.status === "active",
    createdAt: raw.created_at,
  }
}

export const authApi = {
  /** POST /auth/login → set token → GET /auth/me. */
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const tokenRes = await api.post("auth/login", { json: payload }).json<BackendTokenResponse>()
    setAccessToken(tokenRes.access_token)
    const userRaw = await api.get("auth/me").json<BackendUserResponse>()
    return {
      user: adaptUser(userRaw),
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    }
  },

  /** POST /auth/register (no auto-login) → login → GET /auth/me. */
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    await api
      .post("auth/register", {
        json: {
          email: payload.email,
          password: payload.password,
          full_name: payload.fullName,
          phone_number: payload.phone || undefined,
        },
      })
      .json<BackendUserResponse>()

    const tokenRes = await api
      .post("auth/login", { json: { email: payload.email, password: payload.password } })
      .json<BackendTokenResponse>()
    setAccessToken(tokenRes.access_token)

    const userRaw = await api.get("auth/me").json<BackendUserResponse>()
    return {
      user: adaptUser(userRaw),
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    }
  },

  logout: () => api.post("auth/logout").json<{ message: string }>(),

  getMe: async (): Promise<AuthUser> => {
    const raw = await api.get("auth/me").json<BackendUserResponse>()
    return adaptUser(raw)
  },
}
