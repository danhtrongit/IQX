import { useCallback, useState } from 'react';
import type { AccountSnapshot } from './types';
export type AccountRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export interface AccountApi { getSnapshot: () => Promise<AccountSnapshot>; }
export function createAccountApi(request: AccountRequest): AccountApi { return { getSnapshot: () => request<AccountSnapshot>('/users/me') }; }

export function useAccount(api: AccountApi) {
  const [state, setState] = useState<{ status: import('./types').AccountStatus; data?: AccountSnapshot; error?: unknown }>({ status: 'idle' });
  const load = useCallback(async () => { setState({ status: 'loading' }); try { const data = await api.getSnapshot(); setState({ status: 'ready', data }); } catch (error) { setState({ status: 'error', error }); } }, [api]);
  return { ...state, reload: load };
}
