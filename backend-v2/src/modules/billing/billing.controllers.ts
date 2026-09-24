import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

import { CurrentUser, Public, Roles, type AuthenticatedUser } from '../auth/index.js';
import { BillingService } from './billing.service.js';
import {
  adminGrantSchema,
  cancelSubscriptionSchema,
  checkoutSchema,
  extendSubscriptionSchema,
  ipnListQuerySchema,
  ipnLogIdParamsSchema,
  markPaidSchema,
  orderIdParamsSchema,
  paymentListQuerySchema,
  planCreateSchema,
  planIdParamsSchema,
  planUpdateSchema,
  reconcileSchema,
  refundSchema,
  subscriptionIdParamsSchema,
  subscriptionListQuerySchema,
  userIdParamsSchema,
  type IpnListQuery,
  type PaymentListQuery,
  type PlanCreateInput,
  type PlanUpdateInput,
  type SubscriptionListQuery,
} from './billing.schemas.js';
import type { AdminActor } from './billing.types.js';

function actor(user: AuthenticatedUser, request: FastifyRequest): AdminActor {
  return {
    id: user.id,
    ip: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 500),
    requestId: request.id.slice(0, 40),
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeHeaders(request: FastifyRequest): Record<string, string> {
  const allowed = ['content-type', 'user-agent', 'x-request-id', 'x-sepay-event-id'];
  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = firstHeader(request.headers[name]);
      return value ? [[name, value.slice(0, 500)]] : [];
    }),
  );
}

function suppliedWebhookSecret(request: FastifyRequest): string | undefined {
  const direct =
    firstHeader(request.headers['x-secret-key']) ?? firstHeader(request.headers['x-api-key']);
  if (direct) return direct;
  const authorization = firstHeader(request.headers.authorization);
  if (!authorization) return undefined;
  return authorization.replace(/^(?:Apikey|Bearer)\s+/i, '');
}

function equalSecret(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const left = createHash('sha256').update(received).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

@ApiTags('Premium')
@Controller(['api/v1/premium', 'api/v2/premium'])
export class PremiumController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ operationId: 'listPremiumPlans', summary: 'List active Premium plans' })
  listPlans() {
    return this.billing.listPlans(true);
  }

  @Get('me')
  @ApiOperation({ operationId: 'getMyPremiumSubscription', summary: 'Get current entitlement' })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.getEntitlement(user.id, user.role);
  }

  @Post('checkout')
  @ApiOperation({ operationId: 'createPremiumCheckout', summary: 'Create a signed SePay checkout' })
  checkout(
    @Body({ schema: checkoutSchema }) body: { plan_id: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.createCheckout(user.id, body.plan_id);
  }

  @Get('my-orders')
  @ApiOperation({ operationId: 'listMyPremiumOrders', summary: 'List current user payment orders' })
  myOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listMyOrders(user.id);
  }

  @Public()
  @Post('sepay/ipn')
  @HttpCode(200)
  @ApiOperation({ operationId: 'receiveSePayIpn', summary: 'Receive authenticated SePay IPN' })
  async webhook(@Req() request: FastifyRequest, @Body() body: unknown) {
    const headers = safeHeaders(request);
    const expected = this.billing.getWebhookSecret();
    if (!equalSecret(suppliedWebhookSecret(request), expected)) {
      await this.billing.recordRejectedWebhook(body, headers, 'secret_invalid');
      throw new UnauthorizedException({ code: 'INVALID_WEBHOOK_SECRET', message: 'Unauthorized' });
    }
    return this.billing.processWebhook(body, headers);
  }

  @Roles('admin')
  @Get('admin/plans')
  @ApiOperation({ operationId: 'adminListPremiumPlans', summary: 'List all Premium plans' })
  adminPlans() {
    return this.billing.listPlans(false);
  }

  @Roles('admin')
  @Post('admin/plans')
  @ApiOperation({ operationId: 'adminCreatePremiumPlan', summary: 'Create a Premium plan' })
  createPlan(
    @Body({ schema: planCreateSchema }) body: PlanCreateInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.createPlan(body, actor(user, request));
  }

  @Roles('admin')
  @Patch('admin/plans/:plan_id')
  @ApiOperation({ operationId: 'adminUpdatePremiumPlan', summary: 'Update a Premium plan' })
  updatePlan(
    @Param({ schema: planIdParamsSchema }) params: { plan_id: string },
    @Body({ schema: planUpdateSchema }) body: PlanUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.updatePlan(params.plan_id, body, actor(user, request));
  }

  @Roles('admin')
  @Delete('admin/plans/:plan_id')
  @ApiOperation({ operationId: 'adminDeletePremiumPlan', summary: 'Deactivate a Premium plan' })
  deletePlan(
    @Param({ schema: planIdParamsSchema }) params: { plan_id: string },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.deletePlan(params.plan_id, actor(user, request));
  }

  @Roles('admin')
  @Post('admin/users/:user_id/grant')
  @ApiOperation({ operationId: 'adminGrantPremium', summary: 'Grant a Premium plan' })
  grant(
    @Param({ schema: userIdParamsSchema }) params: { user_id: string },
    @Body({ schema: adminGrantSchema }) body: { plan_id: string; note?: string | null },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.adminGrant(params.user_id, body.plan_id, actor(user, request), body.note);
  }
}

@ApiTags('Admin - Payments')
@Roles('admin')
@Controller(['api/v1/admin/payments', 'api/v2/admin/payments'])
export class AdminPaymentsController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ operationId: 'adminListPayments', summary: 'List payment orders' })
  list(@Query({ schema: paymentListQuerySchema }) query: PaymentListQuery) {
    return this.billing.listPayments(query);
  }

  @Get(':order_id')
  @ApiOperation({ operationId: 'adminGetPayment', summary: 'Get payment order detail' })
  get(@Param({ schema: orderIdParamsSchema }) params: { order_id: string }) {
    return this.billing.getPayment(params.order_id);
  }

  @Post(':order_id/refund')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'adminRefundPayment',
    summary: 'Record an approved full or partial refund',
    description:
      'Updates IQX refund and entitlement ledgers. This endpoint does not initiate a provider-side money transfer.',
  })
  refund(
    @Param({ schema: orderIdParamsSchema }) params: { order_id: string },
    @Body({ schema: refundSchema }) body: { reason: string; amount_vnd?: number },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.refund(params.order_id, actor(user, request), body.reason, body.amount_vnd);
  }

  @Post(':order_id/mark-paid')
  @HttpCode(200)
  @ApiOperation({ operationId: 'adminMarkPaymentPaid', summary: 'Manually confirm payment' })
  markPaid(
    @Param({ schema: orderIdParamsSchema }) params: { order_id: string },
    @Body({ schema: markPaidSchema }) body: { note: string },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.markPaid(params.order_id, actor(user, request), body.note);
  }

  @Post(':order_id/reconcile')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'adminReconcilePayment',
    summary: 'Reprocess matching IPN evidence',
  })
  reconcile(
    @Param({ schema: orderIdParamsSchema }) params: { order_id: string },
    @Body({ schema: reconcileSchema }) body: { note?: string | null },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.reconcile(params.order_id, actor(user, request), body.note);
  }
}

@ApiTags('Admin - Subscriptions')
@Roles('admin')
@Controller(['api/v1/admin/subscriptions', 'api/v2/admin/subscriptions'])
export class AdminSubscriptionsController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ operationId: 'adminListSubscriptions', summary: 'List subscriptions' })
  list(@Query({ schema: subscriptionListQuerySchema }) query: SubscriptionListQuery) {
    return this.billing.listSubscriptions(query);
  }

  @Get(':sub_id')
  @ApiOperation({ operationId: 'adminGetSubscription', summary: 'Get subscription detail' })
  get(@Param({ schema: subscriptionIdParamsSchema }) params: { sub_id: string }) {
    return this.billing.getSubscription(params.sub_id);
  }

  @Post(':sub_id/cancel')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'adminCancelSubscription',
    summary: 'Cancel all current entitlement grants',
  })
  cancel(
    @Param({ schema: subscriptionIdParamsSchema }) params: { sub_id: string },
    @Body({ schema: cancelSubscriptionSchema }) body: { reason: string },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.cancelSubscription(params.sub_id, actor(user, request), body.reason);
  }

  @Post(':sub_id/extend')
  @HttpCode(200)
  @ApiOperation({ operationId: 'adminExtendSubscription', summary: 'Add an entitlement grant' })
  extend(
    @Param({ schema: subscriptionIdParamsSchema }) params: { sub_id: string },
    @Body({ schema: extendSubscriptionSchema }) body: { days: number; reason?: string | null },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.extendSubscription(
      params.sub_id,
      actor(user, request),
      body.days,
      body.reason,
    );
  }
}

@ApiTags('Admin - Subscription history')
@Roles('admin')
@Controller(['api/v1/admin/users', 'api/v2/admin/users'])
export class AdminSubscriptionHistoryController {
  constructor(private readonly billing: BillingService) {}

  @Get(':user_id/subscriptions/history')
  @ApiOperation({
    operationId: 'adminGetSubscriptionHistory',
    summary: 'List immutable subscription events',
  })
  history(@Param({ schema: userIdParamsSchema }) params: { user_id: string }) {
    return this.billing.subscriptionHistory(params.user_id);
  }
}

@ApiTags('Admin - IPN')
@Roles('admin')
@Controller(['api/v1/admin/ipn', 'api/v2/admin/ipn'])
export class AdminIpnController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ operationId: 'adminListIpnLogs', summary: 'List redacted IPN inbox records' })
  list(@Query({ schema: ipnListQuerySchema }) query: IpnListQuery) {
    return this.billing.listIpnLogs(query);
  }

  @Get(':log_id')
  @ApiOperation({ operationId: 'adminGetIpnLog', summary: 'Get redacted IPN inbox record' })
  get(@Param({ schema: ipnLogIdParamsSchema }) params: { log_id: string }) {
    return this.billing.getIpnLog(params.log_id);
  }

  @Post(':log_id/retry')
  @ApiOperation({ operationId: 'adminRetryIpn', summary: 'Reprocess one valid IPN inbox record' })
  retry(
    @Param({ schema: ipnLogIdParamsSchema }) params: { log_id: string },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.billing.retryIpn(params.log_id, actor(user, request));
  }
}
