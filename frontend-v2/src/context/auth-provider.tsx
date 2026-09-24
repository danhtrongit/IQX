import { useEffect, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import {
  ACCESS_TOKEN_KEY,
  api,
  clearTokens,
  getAccessToken,
  saveTokens,
  type TokenPair,
} from "@/lib/api"
import { AuthContext, type AuthMode, type AuthUser } from "./auth-state"

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(() => !!getAccessToken())
  const [sessionError, setSessionError] = useState<Error | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const sessionRequest = useRef<AbortController | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>("login")

  useEffect(() => {
    const controller = new AbortController()
    sessionRequest.current = controller
    if (getAccessToken()) api<AuthUser>("/auth/me", { signal: controller.signal })
      .then(account => {
        if (!controller.signal.aborted) {
          setUser(account)
          setSessionExpired(false)
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof Error && "status" in error && error.status === 401) {
          clearTokens()
          setSessionExpired(true)
        } else setSessionError(error instanceof Error ? error : new Error("Không xác minh được phiên đăng nhập"))
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const clearSession = (expired: boolean) => {
      sessionRequest.current?.abort()
      setIsLoading(false)
      setSessionError(null)
      setSessionExpired(expired)
      setUser(null)
      queryClient.clear()
    }
    const onForcedLogout = () => clearSession(true)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCESS_TOKEN_KEY || sessionStorage.getItem(ACCESS_TOKEN_KEY)) return
      clearSession(false)
      if (!event.newValue) return
      const controller = new AbortController()
      sessionRequest.current = controller
      setIsLoading(true)
      void api<AuthUser>("/auth/me", { signal: controller.signal })
        .then(account => {
          if (!controller.signal.aborted) {
            setUser(account)
            setSessionExpired(false)
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setSessionError(error instanceof Error ? error : new Error("Không xác minh được phiên đăng nhập"))
        })
        .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    }
    window.addEventListener("auth:logout", onForcedLogout)
    const onSessionCleared = () => clearSession(false)
    window.addEventListener("auth:session-cleared", onSessionCleared)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("auth:logout", onForcedLogout)
      window.removeEventListener("auth:session-cleared", onSessionCleared)
      window.removeEventListener("storage", onStorage)
    }
  }, [queryClient])

  const premium = useQuery({
    queryKey: ["premium", user?.id],
    enabled: !!user,
    queryFn: ({ signal }) => api<{ is_premium: boolean }>("/premium/me", { signal }),
  })

  async function login(email: string, password: string, remember = true) {
    sessionRequest.current?.abort()
    setIsLoading(false)
    const tokens = await api<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })
    saveTokens(tokens, remember)
    try {
      const account = await api<AuthUser>("/auth/me")
      await queryClient.cancelQueries()
      queryClient.clear()
      setUser(account)
      setSessionExpired(false)
      setSessionError(null)
      setAuthOpen(false)
    } catch (error) {
      clearTokens()
      throw error
    }
  }

  async function register(input: { email: string; password: string; full_name: string }) {
    await api<AuthUser>("/auth/register", { method: "POST", body: JSON.stringify(input) })
    await login(input.email, input.password)
  }

  async function logout() {
    sessionRequest.current?.abort()
    setIsLoading(false)
    try {
      await api("/auth/logout", { method: "POST" })
    } finally {
      clearTokens()
      await queryClient.cancelQueries()
      queryClient.clear()
      setSessionExpired(false)
      setUser(null)
      setSessionError(null)
    }
  }

  async function refreshUser() {
    const account = await api<AuthUser>("/auth/me")
    setUser(current => current?.id === account.id ? account : current)
  }

  return (
    <AuthContext.Provider value={{
      user, isLoading, sessionError, sessionExpired, isAuthenticated: !!user,
      isPremium: user?.role === "admin" || premium.data?.is_premium === true,
      premiumLoading: !!user && premium.isLoading,
      authOpen, authMode, setAuthOpen,
      openAuth: (mode = "login") => { setAuthMode(mode); setAuthOpen(true) },
      login, register, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
