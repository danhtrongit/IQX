import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AUTH_LOGOUT_EVENT,
  clearAuthTokens,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
} from "@/shared/http/client"
import { userScopedKeys } from "@/shared/query/keys"
import { authApi } from "./api"
import type { AuthUser, LoginPayload, RegisterPayload } from "./types"

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  showAuthModal: boolean
  setShowAuthModal: (open: boolean) => void
  authModalTab: "login" | "register"
  setAuthModalTab: (tab: "login" | "register") => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

const USER_KEY = "user"

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(loadUser)
  const [isLoading, setIsLoading] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login")

  /** Invalidate every user-scoped query (premium, watchlist, …) on auth change. */
  const invalidateUserScoped = useCallback(() => {
    for (const key of userScopedKeys) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }, [queryClient])

  // Cross-tab / interceptor-driven logout.
  useEffect(() => {
    const handler = () => {
      setUser(null)
      localStorage.removeItem(USER_KEY)
      invalidateUserScoped()
    }
    window.addEventListener(AUTH_LOGOUT_EVENT, handler)
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handler)
  }, [invalidateUserScoped])

  const persist = useCallback(
    (res: { user: AuthUser; accessToken: string; refreshToken: string }) => {
      setAccessToken(res.accessToken)
      setRefreshToken(res.refreshToken)
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
      setUser(res.user)
      invalidateUserScoped()
      setShowAuthModal(false)
    },
    [invalidateUserScoped],
  )

  const login = useCallback(
    async (payload: LoginPayload) => {
      setIsLoading(true)
      try {
        persist(await authApi.login(payload))
      } finally {
        setIsLoading(false)
      }
    },
    [persist],
  )

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setIsLoading(true)
      try {
        persist(await authApi.register(payload))
      } finally {
        setIsLoading(false)
      }
    },
    [persist],
  )

  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      if (getAccessToken()) await authApi.logout().catch(() => {})
    } finally {
      clearAuthTokens()
      localStorage.removeItem(USER_KEY)
      setUser(null)
      invalidateUserScoped()
      setIsLoading(false)
    }
  }, [invalidateUserScoped])

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await authApi.getMe()
      localStorage.setItem(USER_KEY, JSON.stringify(fresh))
      setUser(fresh)
    } catch {
      /* not authenticated — ignore */
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
      showAuthModal,
      setShowAuthModal,
      authModalTab,
      setAuthModalTab,
    }),
    [user, isLoading, login, register, logout, refreshUser, showAuthModal, authModalTab],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
