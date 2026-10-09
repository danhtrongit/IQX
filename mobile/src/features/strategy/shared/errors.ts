import { ApiError, shouldRetryQuery } from '@/lib/api';

/** 404 FEATURE_DISABLED: the strategy module is switched off on this server. */
export function isFeatureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === 'FEATURE_DISABLED';
}

export const FEATURE_DISABLED_COPY = {
  title: 'Tính năng chưa được bật',
  description:
    'Trang Chiến lược mới chưa được bật trên máy chủ này. Dữ liệu của bạn vẫn được giữ nguyên; vui lòng quay lại sau.',
};

/** Never retry 4xx except 429; at most 2 retries otherwise. */
export function retryUnlessFinal(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return shouldRetryQuery(failureCount, error);
}

let counter = 0;
/** Idempotency key for mutating requests. */
export function newKey(prefix = 'm'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type FieldError = { path: string; message: string };

/** Extract `[{path,message}]` from ApiError.details (array or `{errors:[...]}`). */
export function fieldErrors(error: unknown): FieldError[] {
  if (!(error instanceof ApiError)) return [];
  const d = error.details as unknown;
  const list = Array.isArray(d) ? d : Array.isArray((d as { errors?: unknown })?.errors) ? (d as { errors: unknown[] }).errors : [];
  const out: FieldError[] = [];
  for (const item of list) {
    if (item && typeof item === 'object') {
      const r = item as Record<string, unknown>;
      const message = typeof r.message === 'string' ? r.message : typeof r.msg === 'string' ? r.msg : null;
      const path = Array.isArray(r.path) ? r.path.join('.') : typeof r.path === 'string' ? r.path : Array.isArray(r.loc) ? r.loc.join('.') : '';
      if (message) out.push({ path, message });
    }
  }
  return out;
}
