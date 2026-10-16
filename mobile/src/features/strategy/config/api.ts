import { apiData, apiRequest } from '@/lib/api';
import type { PatchBody } from './model';
import type { Registry, SharedConfig } from './types';

export const configKeys = {
  registry: ['strategy', 'registry', 'technical'] as const,
  shared: ['strategy', 'shared-config'] as const,
};

export const fetchRegistry = (signal?: AbortSignal) => apiData<Registry>('/strategy/registry/technical', { signal });
export const fetchSharedConfig = (signal?: AbortSignal) => apiData<SharedConfig>('/strategy/shared-config', { signal });
export const patchSharedConfig = (body: PatchBody) =>
  apiData<SharedConfig>('/strategy/shared-config', { method: 'PATCH', body });

export { apiRequest };
