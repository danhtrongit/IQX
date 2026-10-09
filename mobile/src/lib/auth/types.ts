export type AuthStatus = 'loading' | 'authenticated' | 'guest' | 'error';

export type AuthUser = {
  id: string | number;
  email: string;
  full_name?: string | null;
  role?: 'admin' | 'user' | 'premium' | string;
};

export type RegisterInput = {
  email: string;
  password: string;
  full_name: string;
  referral_code?: string;
  phone_number?: string;
};

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  /** role === 'admin' || GET /premium/me is_premium */
  isPremium: boolean;
  /** Set when the session was forcibly ended (refresh rejected). Cleared by login/clearSessionExpired. */
  sessionExpired: boolean;
  /** Error from the startup /auth/me check when status === 'error'. */
  error: Error | null;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
  /** Re-run the startup session check (use from the 'error' state). */
  retry(): void;
  clearSessionExpired(): void;
};
