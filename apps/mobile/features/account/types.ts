export interface AccountProfile { id: string; email?: string; displayName?: string; avatarUrl?: string; createdAt?: string; }
export interface AccountPreferences { theme?: 'light' | 'dark' | 'system'; notificationsEnabled?: boolean; }
export interface AccountSnapshot { profile: AccountProfile; preferences?: AccountPreferences; }
export type AccountStatus = 'idle' | 'loading' | 'ready' | 'error';
