import { randomUUID } from 'node:crypto';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function ensureRequestId(request: {
  headers: Record<string, unknown>;
  id?: unknown;
}): string {
  if (typeof request.id === 'string' && REQUEST_ID.test(request.id)) return request.id;
  const supplied = request.headers['x-request-id'];
  const id = typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID();
  request.id = id;
  return id;
}
