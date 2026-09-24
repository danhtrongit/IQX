import { createContext } from "react"

export type AuthUser = { id: string; email: string; full_name: string | null; role: string }
export type AuthMode = "login" | "register"
export type AuthState = {
  user: AuthUser | null
  isLoading: boolean
  sessionError: Error | null
  sessionExpired: boolean
  isAuthenticated: boolean
  isPremium: boolean
  premiumLoading: boolean
  authOpen: boolean
  authMode: AuthMode
  setAuthOpen: (open: boolean) => void
  openAuth: (mode?: AuthMode) => void
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  register: (input: { email: string; password: string; full_name: string }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
