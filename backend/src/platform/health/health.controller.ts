import { Controller, Get, Res, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../modules/auth/index.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { RedisThrottlerStorage } from '../rate-limit/redis-throttler.storage.js';

const readinessSchema = {
  type: 'object' as const,
  required: ['status', 'dependencies'],
  properties: {
    status: { type: 'string' as const, enum: ['ready', 'not_ready'] },
    dependencies: {
      type: 'object' as const,
      required: ['database', 'redis', 'rate_limit'],
      properties: Object.fromEntries(
        ['database', 'redis', 'rate_limit'].map((name) => [
          name,
          { type: 'string', enum: ['up', 'down', 'disabled'] },
        ]),
      ),
    },
  },
};

@ApiTags('Health')
@SkipThrottle({ public: true })
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly lifecycle: LifecycleService,
    private readonly throttle: RedisThrottlerStorage,
  ) {}

  @Get('live')
  @ApiOperation({
    operationId: 'healthLive',
    summary: 'Process liveness without dependency checks',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
      required: ['status'],
    },
  })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'healthReady', summary: 'Database and enabled Redis readiness' })
  @ApiResponse({
    status: 200,
    description: 'All required dependencies are available',
    schema: readinessSchema,
  })
  @ApiResponse({
    status: 503,
    description: 'Required dependency is not available',
    schema: readinessSchema,
  })
  async ready(): Promise<{
    status: 'ready';
    dependencies: { database: string; redis: string; rate_limit: string };
  }> {
    const [database, redis, throttle] = await Promise.all([
      this.database.health(),
      this.redis.health(),
      this.throttle.health(),
    ]);
    const dependencies = {
      database: database.status,
      redis: redis.status,
      rate_limit: throttle.status,
    };
    if (
      this.lifecycle.isDraining() ||
      database.status !== 'up' ||
      redis.status === 'down' ||
      throttle.status === 'down'
    ) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'Service is not ready',
        dependencies,
      });
    }
    return { status: 'ready', dependencies };
  }
}

@ApiTags('Health compatibility')
@Public()
@SkipThrottle({ public: true })
@Controller(['api/v1', 'api/v2'])
export class LegacyHealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  @ApiOperation({ operationId: 'legacyHealth', summary: 'Application and dependency health' })
  async health(@Res({ passthrough: true }) reply: FastifyReply): Promise<Record<string, unknown>> {
    const [database, redis] = await Promise.all([this.database.health(), this.redis.health()]);
    const ready = database.status === 'up' && redis.status !== 'down';
    reply.status(ready ? 200 : 503);
    const labels = { up: 'healthy', down: 'unhealthy', disabled: 'disabled' };
    return {
      status: ready ? 'ok' : 'degraded',
      app_name: 'IQX',
      version: '0.2.0',
      environment: this.config.get('APP_ENV'),
      database: labels[database.status],
      redis: labels[redis.status],
      timestamp: new Date().toISOString(),
    };
  }
}
