import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../auth/index.js';
import {
  cap1KehoachSchema,
  cap1KetsoSchema,
  cap1TaskSchema,
  type Cap1KehoachInput,
  type Cap1KetsoInput,
  type Cap1TaskInput,
} from './cap1.schemas.js';
import { Cap1Service } from './cap1.service.js';

@ApiTags('Cấp 1')
@ApiBearerAuth()
@Controller({ path: ['api/v1/cap1', 'api/v2/cap1'] })
export class Cap1Controller {
  constructor(private readonly service: Cap1Service) {}
  @Get('progress') progress(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProgress(user.id);
  }
  @Post('enter') enter(@CurrentUser() user: AuthenticatedUser) {
    return this.service.enter(user.id);
  }
  @Patch('task') task(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap1TaskSchema }) body: Cap1TaskInput,
  ) {
    return this.service.markTask(user.id, body.task_no);
  }
  @Post('kehoach') kehoach(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap1KehoachSchema }) body: Cap1KehoachInput,
  ) {
    return this.service.recordKehoach(user.id, body);
  }
  @Post('ketso') ketso(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap1KetsoSchema }) body: Cap1KetsoInput,
  ) {
    return this.service.recordKetso(user.id, body);
  }
  @Get('trades') trades(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listTrades(user.id);
  }
  @Post('graduate') graduate(@CurrentUser() user: AuthenticatedUser) {
    return this.service.graduate(user.id);
  }
}
