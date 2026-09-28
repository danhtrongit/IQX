import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import { MediaModule } from '../media/index.js';
import { AdminLearningController } from './admin-learning.controller.js';
import { LearningController } from './learning.controller.js';
import { LearningRepository } from './learning.repository.js';
import { LearningService } from './learning.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [LearningController, AdminLearningController],
  providers: [LearningRepository, LearningService],
  exports: [LearningService],
})
export class LearningModule {}
