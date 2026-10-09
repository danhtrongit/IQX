import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { workspaceEnsureSchema, workspaceStateSchema } from './workspace.schemas.js';
import { WorkspaceService } from './workspace.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Onboarding for the Demo Trading workspace. Authenticated for every user, never Premium-gated. */
@ApiTags('Workspace')
@Controller('api/v2/workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Post('ensure')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'ensureWorkspace',
    summary:
      'Idempotently create the manual demo account (100m VND once), Bot account, Bach Ho mascot profile and xu wallet',
  })
  @ApiOkResponse({ schema: openApi(workspaceEnsureSchema) })
  ensure(@CurrentUser() user: AuthenticatedUser) {
    return this.workspace.ensure(user.id);
  }

  @Get('state')
  @ApiOperation({
    operationId: 'getWorkspaceState',
    summary: 'Read-only workspace summary (accounts, active mascot, xu balance); never writes',
  })
  @ApiOkResponse({ schema: openApi(workspaceStateSchema) })
  state(@CurrentUser() user: AuthenticatedUser) {
    return this.workspace.getState(user.id);
  }
}
