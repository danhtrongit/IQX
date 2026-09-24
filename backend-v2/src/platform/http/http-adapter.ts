import { Logger } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ensureRequestId } from '../observability/request-id.js';

const logger = new Logger('HttpAdapter');

export function createHttpAdapter(trustedProxyCidrs: readonly string[] = []): FastifyAdapter {
  return new FastifyAdapter({
    logger: false,
    trustProxy: trustedProxyCidrs.length ? [...trustedProxyCidrs] : false,
    bodyLimit: 1_048_576,
    routerOptions: { maxParamLength: 2048 },
    requestTimeout: 10_000,
    genReqId: ensureRequestId,
    frameworkErrors: (_error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const id = ensureRequestId(request.raw);
      request.id = id;
      const message = 'Yêu cầu không hợp lệ';
      logger.warn({ request_id: id, status: 400, code: 'BAD_REQUEST' }, 'Malformed HTTP request');
      void reply
        .header('X-Request-ID', id)
        .status(400)
        .send(
          request.url.startsWith('/api/v1/')
            ? { detail: message, code: 'BAD_REQUEST' }
            : { error: { code: 'BAD_REQUEST', message }, request_id: id },
        );
    },
  });
}
