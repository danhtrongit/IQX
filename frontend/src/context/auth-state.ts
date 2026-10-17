import { createContext } from "react"

export type AuthUser = {
  id: string
  email: string
  /** Tên đăng nhập (admin spec v1.1 §2.1); cũng là mã giới thiệu khi là trưởng nhóm. */
  username: string
  /** DECISION 1: tài khoản cũ được tự sinh tên đăng nhập và đổi được đúng một lần. */
  username_change_allowed?: boolean
  full_name: string | null
  role: string
}
export type AuthMode = "login" | "register"
export type RegisterInput = {
  full_name: string
  username: string
  email: string
  phone_number: string
  password: string
  referral_code?: string
}
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
  /** `identifier` là email (có "@") hoặc tên đăng nhập. */
  login: (identifier: string, password: string, remember?: boolean) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
