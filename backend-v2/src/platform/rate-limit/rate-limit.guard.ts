import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Nest suffixes headers for named throttlers. Also expose the standard
    // unsuffixed header expected by HTTP clients and reverse proxies.
    context.switchToHttp().getResponse().header('Retry-After', detail.timeToBlockExpire);
    await super.throwThrottlingException(context, detail);
  }
}
