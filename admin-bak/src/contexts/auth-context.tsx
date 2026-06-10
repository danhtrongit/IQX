import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  authApi,
  setAccessToken,
  setRefreshToken,
  getAccessToken,
  type AdminUser,
} from "@/lib/api"

interface LoginPayload {
  email: string
  password: string
}

interface AuthContextValue {
  user: AdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (payload: LoginPayload) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

function loadUser(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem("admin_user")
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(loadUser)
  const [isLoading, setIsLoading] = useState(true)

  // On mount: verify token is still valid + user is still admin
  useEffect(() => {
    const savedUser = loadUser()
    if (!savedUser || !sessionStorage.getItem("admin_accessToken")) {
      setUser(null)
      setIsLoading(false)
      return
    }

    authApi
      .getMe()
      .then((freshUser) => {
        if (freshUser.role !== "admin") {
          // Token valid but no longer admin — force logout
          clearSession()
          setUser(null)
        } else {
          sessionStorage.setItem("admin_user", JSON.stringify(freshUser))
          setUser(freshUser)
        }
      })
      .catch(() => {
        // Token expired or server error — clear session
        clearSession()
        setUser(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for forced logout (401 refresh failure)
  useEffect(() => {
    const handler = () => {
      clearSession()
      setUser(null)
    }
    window.addEventListener("auth:logout", handler)
    return () => window.removeEventListener("auth:logout", handler)
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    setIsLoading(true)
    try {
      const res = await authApi.login(payload)
      setAccessToken(res.accessToken)
      setRefreshToken(res.refreshToken)
      sessionStorage.setItem("admin_user", JSON.stringify(res.user))
      setUser(res.user)
    } catch (err) {
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      if (getAccessToken()) {
        await authApi.logout().catch(() => {})
      }
    } finally {
      clearSession()
      setUser(null)
      setIsLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await authApi.getMe()
      if (freshUser.role !== "admin") {
        clearSession()
        setUser(null)
        return
      }
      sessionStorage.setItem("admin_user", JSON.stringify(freshUser))
      setUser(freshUser)
    } catch {
      // silently fail if not authenticated
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function clearSession() {
  setAccessToken(null)
  setRefreshToken(null)
  sessionStorage.removeItem("admin_user")
}
