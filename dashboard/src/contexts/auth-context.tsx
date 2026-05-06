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
  getAccessToken,
  type AuthUser,
  type LoginPayload,
  type RegisterPayload,
} from "@/lib/api"

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

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("user")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser)
  const [isLoading, setIsLoading] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login")

  useEffect(() => {
    const handler = () => {
      setUser(null)
      localStorage.removeItem("user")
    }
    window.addEventListener("auth:logout", handler)
    return () => window.removeEventListener("auth:logout", handler)
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    setIsLoading(true)
    try {
      const res = await authApi.login(payload)
      setAccessToken(res.accessToken)
      localStorage.setItem("refreshToken", res.refreshToken)
      localStorage.setItem("user", JSON.stringify(res.user))
      setUser(res.user)
      setShowAuthModal(false)
    } catch (err) {
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    setIsLoading(true)
    try {
      const res = await authApi.register(payload)
      setAccessToken(res.accessToken)
      localStorage.setItem("refreshToken", res.refreshToken)
      localStorage.setItem("user", JSON.stringify(res.user))
      setUser(res.user)
      setShowAuthModal(false)
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
      setAccessToken(null)
      localStorage.removeItem("refreshToken")
      localStorage.removeItem("user")
      setUser(null)
      setIsLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await authApi.getMe()
      localStorage.setItem("user", JSON.stringify(freshUser))
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
