import { Global, Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  imports: [RedisModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
