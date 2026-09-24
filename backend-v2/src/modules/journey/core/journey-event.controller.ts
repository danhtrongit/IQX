import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../../auth/index.js';
import { journeyEventSchema, type JourneyEventInput } from './journey-event.schemas.js';
import { JourneyEventService } from './journey-event.service.js';

@Controller(['api/v1/journey', 'api/v2/journey'])
export class JourneyEventController {
  constructor(private readonly events: JourneyEventService) {}

  @Post('events')
  @HttpCode(202)
  async record(
    @Body({ schema: journeyEventSchema }) body: JourneyEventInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ accepted: true }> {
    await this.events.record({
      userId: user.id,
      eventId: body.event_id,
      name: body.name,
      fields: body.fields,
      source: 'client',
    });
    return { accepted: true };
  }
}
