import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

@Injectable()
export class ResponseMetadataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return next.handle().pipe(
      map((value: unknown) => {
        if (
          !request.url.startsWith('/api/v2/') ||
          !value ||
          typeof value !== 'object' ||
          !('data' in value)
        )
          return value;
        const body = value as Record<string, unknown>;
        const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
        return { ...body, meta: { ...meta, request_id: request.id } };
      }),
    );
  }
}
