import { createContext } from "react"

export type AuthUser = { id: string; email: string; full_name: string | null; role: string }
export type AuthMode = "login" | "register"
export type RegisterInput = { email: string; password: string; full_name: string; referral_code?: string }
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
  referralCode: string | null
  setAuthOpen: (open: boolean) => void
  openAuth: (mode?: AuthMode, referralCode?: string) => void
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
