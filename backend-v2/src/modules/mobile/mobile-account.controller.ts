import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { MobileService } from './mobile.service.js';

@ApiTags('Mobile account privacy')
@Controller('api/v2/users/me')
export class MobileAccountController {
  constructor(private readonly mobile: MobileService) {}

  @Post('deletion')
  @HttpCode(202)
  @ApiOperation({ operationId: 'requestAccountDeletion' })
  @ApiResponse({
    status: 202,
    schema: {
      type: 'object',
      properties: { request_id: { type: 'string' }, status: { type: 'string' } },
    },
  })
  deletion(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.requestDeletion(user);
  }

  @Get('deletion-status')
  @ApiOperation({ operationId: 'getAccountDeletionStatus' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { request_id: { type: 'string', nullable: true }, status: { type: 'string' } },
    },
  })
  deletionStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.deletionStatus(user);
  }

  @Post('export')
  @HttpCode(202)
  @ApiOperation({ operationId: 'requestAccountExport' })
  @ApiResponse({
    status: 202,
    schema: {
      type: 'object',
      properties: { request_id: { type: 'string' }, status: { type: 'string' } },
    },
  })
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.requestExport(user);
  }
}
