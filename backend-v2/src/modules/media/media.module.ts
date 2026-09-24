import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaStorageService } from './media-storage.service.js';

@Module({
  controllers: [MediaController],
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaModule {}
