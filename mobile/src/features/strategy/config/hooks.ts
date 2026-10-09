import { useQuery } from '@tanstack/react-query';

import { retryUnlessFinal } from '../shared/errors';
import { configKeys, fetchRegistry, fetchSharedConfig } from './api';

export function useRegistry() {
  return useQuery({ queryKey: configKeys.registry, queryFn: ({ signal }) => fetchRegistry(signal), staleTime: 5 * 60_000, retry: retryUnlessFinal });
}
export function useSharedConfig() {
  return useQuery({ queryKey: configKeys.shared, queryFn: ({ signal }) => fetchSharedConfig(signal), retry: retryUnlessFinal });
}
