import { api } from "@/shared/http/client"

/** UI-facing user profile (camelCase). */
export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  role: string
  isActive: boolean
  /** Subscription status comes from GET /premium/me, not this endpoint. */
  premiumExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateProfilePayload {
  fullName?: string
  phone?: string
  // NOTE: backend has NO self-change-password endpoint.
  // Do not send a password via PATCH /users/me.
}

/** Raw backend UserResponse (snake_case). */
interface BackendUserResponse {
  id: string | number
  email: string
  full_name: string | null
  phone_number: string | null
  role: string
  status: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

/** snake_case backend user → camelCase UserProfile. */
function adaptProfile(raw: BackendUserResponse): UserProfile {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: raw.full_name || null,
    phone: raw.phone_number || null,
    role: raw.role,
    isActive: raw.status === "active",
    premiumExpiresAt: null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export const usersApi = {
  /** GET /users/me */
  getProfile: async (): Promise<UserProfile> => {
    const raw = await api.get("users/me").json<BackendUserResponse>()
    return adaptProfile(raw)
  },

  /** PATCH /users/me — only fullName / phone (no password). */
  updateProfile: async (payload: UpdateProfilePayload): Promise<UserProfile> => {
    const body: Record<string, string | undefined> = {}
    if (payload.fullName !== undefined) body.full_name = payload.fullName
    if (payload.phone !== undefined) body.phone_number = payload.phone
    const raw = await api.patch("users/me", { json: body }).json<BackendUserResponse>()
    return adaptProfile(raw)
  },
}
