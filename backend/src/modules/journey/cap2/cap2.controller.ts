import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../auth/index.js';
import {
  activeAlertsQuerySchema,
  alertActionSchema,
  alertIdSchema,
  cap2KehoachSchema,
  cap2KetsoSchema,
  cap2TaskSchema,
  historyQuerySchema,
  preBuySchema,
  scoreQuerySchema,
  type AlertActionInput,
  type Cap2KehoachInput,
  type Cap2KetsoInput,
  type PreBuyInput,
} from './cap2.schemas.js';
import { Cap2AlertsService } from './cap2.alerts.service.js';
import { Cap2Service } from './cap2.service.js';

@ApiTags('Cấp 2')
@ApiBearerAuth()
@Controller({ path: ['api/v1/cap2', 'api/v2/cap2'] })
export class Cap2Controller {
  constructor(
    private readonly service: Cap2Service,
    private readonly alerts: Cap2AlertsService,
  ) {}
  @Get('progress') progress(@CurrentUser() u: AuthenticatedUser) {
    return this.service.getProgress(u.id);
  }
  @Post('enter') enter(@CurrentUser() u: AuthenticatedUser) {
    return this.service.enter(u.id);
  }
  @Patch('task') task(
    @CurrentUser() u: AuthenticatedUser,
    @Body({ schema: cap2TaskSchema }) body: { task_no: 1 },
  ) {
    return this.service.markTask(u.id, body.task_no);
  }
  @Post('kehoach') kehoach(
    @CurrentUser() u: AuthenticatedUser,
    @Body({ schema: cap2KehoachSchema }) body: Cap2KehoachInput,
  ) {
    return this.service.recordKehoach(u.id, body);
  }
  @Post('ketso') ketso(
    @CurrentUser() u: AuthenticatedUser,
    @Body({ schema: cap2KetsoSchema }) body: Cap2KetsoInput,
  ) {
    return this.service.recordKetso(u.id, body);
  }
  @Get('diem-ky-luat') score(
    @CurrentUser() u: AuthenticatedUser,
    @Query({ schema: scoreQuerySchema }) q: { ngay?: string },
  ) {
    return this.service.score(u.id, q.ngay);
  }
  @Get('diem-ky-luat/history') history(
    @CurrentUser() u: AuthenticatedUser,
    @Query({ schema: historyQuerySchema }) q: { from_date?: string; to_date?: string },
  ) {
    const to = q.to_date ?? new Date().toISOString().slice(0, 10);
    const from = q.from_date ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    return this.service.scoreHistory(u.id, from, to);
  }
  @Get('trades') trades(@CurrentUser() u: AuthenticatedUser) {
    return this.service.listTrades(u.id);
  }
  @Get('analysis') analysis(@CurrentUser() u: AuthenticatedUser) {
    return this.service.analysis(u.id);
  }
  @Post('graduate') graduate(@CurrentUser() u: AuthenticatedUser) {
    return this.service.graduate(u.id);
  }
  @Post('alerts/pre-buy') preBuy(
    @CurrentUser() u: AuthenticatedUser,
    @Body({ schema: preBuySchema }) body: PreBuyInput,
  ) {
    return this.alerts.preBuy(u.id, body);
  }
  @Get('alerts/active') active(
    @CurrentUser() u: AuthenticatedUser,
    @Query({ schema: activeAlertsQuerySchema }) q: { session_date?: string },
  ) {
    return this.alerts.active(u.id, q.session_date);
  }
  @Post('alerts/:alert_id/action') action(
    @CurrentUser() u: AuthenticatedUser,
    @Param('alert_id', { schema: alertIdSchema }) id: string,
    @Body({ schema: alertActionSchema }) body: AlertActionInput,
  ) {
    return this.alerts.act(u.id, id, body);
  }
  @Post('alerts/:alert_id/claim') claim(
    @CurrentUser() u: AuthenticatedUser,
    @Param('alert_id', { schema: alertIdSchema }) id: string,
  ) {
    return this.alerts.claim(u.id, id);
  }
  @Post('alerts/:alert_id/check') check(
    @CurrentUser() u: AuthenticatedUser,
    @Param('alert_id', { schema: alertIdSchema }) id: string,
  ) {
    return this.alerts.check(u.id, id);
  }
  @Post('alerts/:alert_id/dismiss') dismiss(
    @CurrentUser() u: AuthenticatedUser,
    @Param('alert_id', { schema: alertIdSchema }) id: string,
  ) {
    return this.alerts.act(u.id, id, { action: 'dismiss', confirmation_phrase: null });
  }
  @Post('alerts/:alert_id/snooze') snooze(
    @CurrentUser() u: AuthenticatedUser,
    @Param('alert_id', { schema: alertIdSchema }) id: string,
  ) {
    return this.alerts.act(u.id, id, { action: 'snooze', confirmation_phrase: null });
  }
}
