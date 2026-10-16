import { SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const LOOKUP_THROTTLE_KEY = 'iqx.rate-limit.lookup';
export const LOOKUP_THROTTLER = 'lookup';

const reflector = new Reflector();

/**
 * Opts a route into the `lookup` throttler (LOOKUP_RATE_LIMIT_*), a tight per-IP budget for
 * public endpoints that could be used to enumerate accounts. The general `public` throttler
 * still applies as well.
 */
export const LookupThrottle = () => SetMetadata(LOOKUP_THROTTLE_KEY, true);

export function isLookupThrottled(context: ExecutionContext): boolean {
  return reflector.get<boolean | undefined>(LOOKUP_THROTTLE_KEY, context.getHandler()) === true;
}
