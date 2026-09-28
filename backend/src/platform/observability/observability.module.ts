import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Environment } from '../config/environment.js';
import { ensureRequestId } from './request-id.js';
import { safeRequestPath } from './safe-request-path.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: ensureRequestId,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-secret-key"]',
              'req.headers["x-api-key"]',
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
          serializers: {
            req: (request: { id?: string; method?: string; url?: string }) => ({
              id: request.id,
              method: request.method,
              path: safeRequestPath(request.url),
            }),
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
