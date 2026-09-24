import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';

import { DatabaseService } from '../../platform/database/database.service.js';
import type {
  IpnListQuery,
  PaymentListQuery,
  PlanCreateInput,
  PlanUpdateInput,
  SubscriptionListQuery,
} from './billing.schemas.js';
import { ipnPayloadSchema } from './billing.schemas.js';
import type {
  AdminActor,
  BillingSqlClient,
  IpnPayload,
  PaymentOrderRow,
  PlanRow,
  SubscriptionRow,
} from './billing.types.js';

const PAYMENT = 'payment';
const ADMIN_CONFIRMED = 'admin_confirmed';
const ADMIN_GRANT = 'admin_grant';
const TRIAL = 'trial';
const EXTENSION = 'admin_extension';

type DatabaseWithWrites = DatabaseService &
  BillingSqlClient & {
    transaction<T>(operation: (client: BillingSqlClient) => Promise<T>): Promise<T>;
  };

type CountRow = Record<string, unknown> & { total: number };

function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function parseVndAmount(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[0-9]+(?:\.0+)?$/.test(value)) return null;
  const normalized = value.split('.')[0] ?? '';
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

/** Convert PostgreSQL integer/int8 money to an exact JSON integer. */
export function exactVndNumber(value: unknown, field: string): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') ||
    (typeof value === 'string' && !/^\d+$/.test(value)) ||
    (typeof value === 'number' && (!Number.isInteger(value) || value < 0))
  ) {
    throw new InternalServerErrorException({
      code: 'BILLING_MONEY_INVALID',
      message: `Invalid ${field}`,
    });
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new InternalServerErrorException({
      code: 'BILLING_MONEY_OUT_OF_RANGE',
      message: `${field} cannot be represented exactly`,
    });
  }
  const amount = typeof value === 'bigint' ? value : BigInt(value);
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InternalServerErrorException({
      code: 'BILLING_MONEY_OUT_OF_RANGE',
      message: `${field} cannot be represented exactly`,
    });
  }
  return Number(amount);
}

/** V1/V2 billing contracts expose VND as exact integer JSON numbers. */
function normalizePaymentMoney<T extends Record<string, unknown>>(row: T): T {
  const normalized: Record<string, unknown> = { ...row };
  for (const field of ['amount_vnd', 'refunded_amount_vnd', 'plan_price_vnd'] as const) {
    if (normalized[field] !== undefined && normalized[field] !== null) {
      normalized[field] = exactVndNumber(normalized[field], field);
    }
  }
  return normalized as T;
}

export function signCheckoutFields(fields: Record<string, string>, secret: string): string {
  const ordered = [
    'order_amount',
    'merchant',
    'currency',
    'operation',
    'order_description',
    'order_invoice_number',
    'customer_id',
    'payment_method',
    'success_url',
    'error_url',
    'cancel_url',
  ];
  const input = ordered
    .filter((key) => Object.hasOwn(fields, key))
    .map((key) => `${key}=${fields[key] ?? ''}`)
    .join(',');
  return createHmac('sha256', secret).update(input).digest('base64');
}

/** Store only fields necessary for reconciliation; discard customer/card data and secrets. */
export function sanitizeIpnPayload(input: unknown): Record<string, unknown> | null {
  const parsed = ipnPayloadSchema.safeParse(input);
  if (!parsed.success) return null;
  const payload = parsed.data;
  const order = payload.order;
  const transaction = payload.transaction;
  return {
    timestamp: payload.timestamp ?? null,
    notification_type: payload.notification_type ?? null,
    order: order
      ? {
          id: order.id ?? null,
          order_id: order.order_id ?? null,
          order_status: order.order_status ?? null,
          order_currency: order.order_currency ?? null,
          order_amount: order.order_amount ?? null,
          order_invoice_number: order.order_invoice_number ?? null,
        }
      : null,
    transaction: transaction
      ? {
          id: transaction.id ?? null,
          payment_method: transaction.payment_method ?? null,
          transaction_id: transaction.transaction_id ?? null,
          transaction_type: transaction.transaction_type ?? null,
          transaction_date: transaction.transaction_date ?? null,
          transaction_status: transaction.transaction_status ?? null,
          transaction_amount: transaction.transaction_amount ?? null,
          transaction_currency: transaction.transaction_currency ?? null,
          authentication_status: transaction.authentication_status ?? null,
        }
      : null,
  };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private db(): DatabaseWithWrites {
    return this.database as DatabaseWithWrites;
  }

  private setting(name: string): string | undefined {
    const value = this.config.get<string>(name);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private checkoutConfiguration(): {
    merchant: string;
    secret: string;
    checkoutUrl: string;
    publicUrl: string;
  } {
    const merchant = this.setting('SEPAY_MERCHANT_ID');
    const secret = this.setting('SEPAY_SECRET_KEY');
    const checkoutUrl = this.setting('SEPAY_CHECKOUT_URL');
    const publicUrl = this.setting('APP_PUBLIC_URL');
    if (!merchant || !secret || !checkoutUrl || !publicUrl) {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: 'Cổng thanh toán chưa được cấu hình',
      });
    }
    return { merchant, secret, checkoutUrl, publicUrl: publicUrl.replace(/\/$/, '') };
  }

  getWebhookSecret(): string {
    const secret = this.setting('SEPAY_SECRET_KEY');
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: 'Cổng thanh toán chưa được cấu hình',
      });
    }
    return secret;
  }

  async listPlans(activeOnly = true): Promise<PlanRow[]> {
    return this.db().query<PlanRow>(
      `select id, code, name, description, price_vnd, duration_days, is_active,
              sort_order, created_at, updated_at
         from premium_plans
        ${activeOnly ? 'where is_active = true' : ''}
        order by sort_order, price_vnd, created_at`,
    );
  }

  async getPlan(planId: string, client: BillingSqlClient = this.db()): Promise<PlanRow> {
    const [plan] = await client.query<PlanRow>(
      `select id, code, name, description, price_vnd, duration_days, is_active,
              sort_order, created_at, updated_at
         from premium_plans where id = $1`,
      [planId],
    );
    if (!plan) throw notFound('PREMIUM_PLAN_NOT_FOUND', 'Không tìm thấy gói Premium');
    return plan;
  }

  async createPlan(input: PlanCreateInput, actor: AdminActor): Promise<PlanRow> {
    return this.db().transaction(async (tx) => {
      let rows: PlanRow[];
      try {
        rows = await tx.query<PlanRow>(
          `insert into premium_plans
             (code, name, description, price_vnd, duration_days, is_active, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning id, code, name, description, price_vnd, duration_days, is_active,
                     sort_order, created_at, updated_at`,
          [
            input.code,
            input.name,
            input.description ?? null,
            input.price_vnd,
            input.duration_days,
            input.is_active,
            input.sort_order,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw conflict('PREMIUM_PLAN_CODE_EXISTS', `Đã tồn tại gói với mã '${input.code}'`);
        }
        throw error;
      }
      const plan = rows[0];
      if (!plan) throw new Error('Plan insert returned no row');
      await this.audit(tx, actor, 'premium.plan.create', 'plan', plan.id, null, input);
      return plan;
    });
  }

  async updatePlan(planId: string, patch: PlanUpdateInput, actor: AdminActor): Promise<PlanRow> {
    return this.db().transaction(async (tx) => {
      const before = await this.getPlan(planId, tx);
      const keys = Object.keys(patch) as (keyof PlanUpdateInput)[];
      const values = keys.map((key) => patch[key] ?? null);
      const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
      const [updated] = await tx.query<PlanRow>(
        `update premium_plans set ${assignments}, updated_at = now()
          where id = $1
          returning id, code, name, description, price_vnd, duration_days, is_active,
                    sort_order, created_at, updated_at`,
        [planId, ...values],
      );
      if (!updated) throw notFound('PREMIUM_PLAN_NOT_FOUND', 'Không tìm thấy gói Premium');
      await this.audit(tx, actor, 'premium.plan.update', 'plan', planId, before, patch);
      return updated;
    });
  }

  async deletePlan(planId: string, actor: AdminActor): Promise<PlanRow> {
    return this.db().transaction(async (tx) => {
      const before = await this.getPlan(planId, tx);
      if (before.code === 'TRIAL_7D') {
        throw badRequest('TRIAL_PLAN_PROTECTED', 'Không thể xoá gói TRIAL_7D');
      }
      const [updated] = await tx.query<PlanRow>(
        `update premium_plans set is_active = false, updated_at = now()
          where id = $1
          returning id, code, name, description, price_vnd, duration_days, is_active,
                    sort_order, created_at, updated_at`,
        [planId],
      );
      if (!updated) throw notFound('PREMIUM_PLAN_NOT_FOUND', 'Không tìm thấy gói Premium');
      await this.audit(
        tx,
        actor,
        'premium.plan.delete',
        'plan',
        planId,
        { is_active: before.is_active },
        { is_active: false },
      );
      return updated;
    });
  }

  async getEntitlement(userId: string, role: string): Promise<Record<string, unknown>> {
    const [row] = await this.db().query<
      Record<string, unknown> & {
        grant_id: string | null;
        starts_at: Date | string | null;
        ends_at: Date | string | null;
        status: string | null;
        plan_id: string | null;
        code: string | null;
        name: string | null;
        description: string | null;
        price_vnd: number | null;
        duration_days: number | null;
        is_active: boolean | null;
        sort_order: number | null;
        plan_created_at: Date | string | null;
        plan_updated_at: Date | string | null;
      }
    >(
      `select g.id as grant_id, g.starts_at, g.ends_at, g.status,
              p.id as plan_id, p.code, p.name, p.description, p.price_vnd,
              p.duration_days, p.is_active, p.sort_order,
              p.created_at as plan_created_at, p.updated_at as plan_updated_at
         from billing_entitlement_grants g
         left join premium_plans p on p.id = g.plan_id
        where g.user_id = $1 and g.status = 'active'
          and g.starts_at <= now() and now() < g.ends_at
        order by g.ends_at desc limit 1`,
      [userId],
    );
    const isAdmin = role === 'admin';
    const entitled = isAdmin || Boolean(row?.grant_id);
    return {
      is_premium: entitled,
      is_trial: row?.code === 'TRIAL_7D',
      status: isAdmin && !row ? 'active' : (row?.status ?? null),
      current_plan: row?.plan_id
        ? {
            id: row.plan_id,
            code: row.code,
            name: row.name,
            description: row.description,
            price_vnd: row.price_vnd,
            duration_days: row.duration_days,
            is_active: row.is_active,
            sort_order: row.sort_order,
            created_at: row.plan_created_at,
            updated_at: row.plan_updated_at,
          }
        : null,
      current_period_start: row?.starts_at ?? null,
      current_period_end: row?.ends_at ?? null,
    };
  }

  async createCheckout(userId: string, planId: string): Promise<Record<string, unknown>> {
    const settings = this.checkoutConfiguration();
    return this.db().transaction(async (tx) => {
      const plan = await this.getPlan(planId, tx);
      if (!plan.is_active) throw badRequest('PREMIUM_PLAN_INACTIVE', 'Gói này không còn khả dụng');
      const invoice = `IQX_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      const [order] = await tx.query<PaymentOrderRow>(
        `insert into premium_payment_orders
           (invoice_number, user_id, plan_id, amount_vnd, currency, status,
            plan_code_snapshot, plan_name_snapshot, duration_days_snapshot)
         values ($1, $2, $3, $4, 'VND', 'pending', $5, $6, $7)
         returning *`,
        [invoice, userId, plan.id, plan.price_vnd, plan.code, plan.name, plan.duration_days],
      );
      if (!order) throw new Error('Payment order insert returned no row');
      const fields: Record<string, string> = {
        order_amount: String(order.amount_vnd),
        merchant: settings.merchant,
        currency: 'VND',
        operation: 'PURCHASE',
        order_description: `IQX Premium - ${order.plan_name_snapshot}`,
        order_invoice_number: order.invoice_number,
        customer_id: userId,
        success_url: `${settings.publicUrl}/payment/success`,
        error_url: `${settings.publicUrl}/payment/error`,
        cancel_url: `${settings.publicUrl}/payment/cancel`,
      };
      return {
        action: settings.checkoutUrl,
        method: 'POST',
        fields: [
          ...Object.entries(fields).map(([name, value]) => ({ name, value })),
          { name: 'signature', value: signCheckoutFields(fields, settings.secret) },
        ],
        invoice_number: invoice,
        order_id: order.id,
      };
    });
  }

  async listMyOrders(userId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.db().query<PaymentOrderRow>(
      `select * from premium_payment_orders where user_id = $1
        order by created_at desc limit 20`,
      [userId],
    );
    return rows.map((rawRow) => {
      const row = normalizePaymentMoney(rawRow);
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        amount: row.amount_vnd,
        refundedAmount: row.refunded_amount_vnd,
        currency: row.currency,
        status: row.status,
        planName: row.plan_name_snapshot,
        planCode: row.plan_code_snapshot,
        paidAt: row.paid_at,
        createdAt: row.created_at,
      };
    });
  }

  async recordRejectedWebhook(
    payload: unknown,
    headers: Record<string, string>,
    result: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.db().query(
      `insert into sepay_ipn_logs
         (secret_key_valid, raw_body, raw_headers, result_status, error_message)
       values (false, $1::jsonb, $2::jsonb, $3, $4)`,
      [
        JSON.stringify(sanitizeIpnPayload(payload)),
        JSON.stringify(headers),
        result,
        errorMessage ?? null,
      ],
    );
  }

  async processWebhook(
    input: unknown,
    headers: Record<string, string>,
  ): Promise<{ success: string; message: string }> {
    const parsed = ipnPayloadSchema.safeParse(input);
    if (!parsed.success) {
      await this.db().query(
        `insert into sepay_ipn_logs
           (secret_key_valid, raw_body, raw_headers, result_status, error_message)
         values (true, null, $1::jsonb, 'invalid_payload', $2)`,
        [JSON.stringify(headers), 'Payload validation failed'],
      );
      throw badRequest('INVALID_IPN_PAYLOAD', 'Dữ liệu IPN không hợp lệ');
    }
    const safe = sanitizeIpnPayload(parsed.data);
    return this.db().transaction(async (tx) => {
      const result = await this.processIpnPayload(tx, parsed.data, safe);
      await tx.query(
        `insert into sepay_ipn_logs
           (secret_key_valid, raw_body, raw_headers, result_status, matched_order_id,
            sepay_transaction_id, error_message)
         values (true, $1::jsonb, $2::jsonb, $3, $4, $5, $6)`,
        [
          JSON.stringify(safe),
          JSON.stringify(headers),
          result.message,
          result.orderId ?? null,
          parsed.data.transaction?.transaction_id ?? null,
          result.error ?? null,
        ],
      );
      return { success: 'true', message: result.message };
    });
  }

  private async processIpnPayload(
    tx: BillingSqlClient,
    payload: IpnPayload,
    safePayload: Record<string, unknown> | null,
  ): Promise<{ message: string; orderId?: string; error?: string }> {
    if (payload.notification_type !== 'ORDER_PAID') return { message: 'ignored' };
    const orderData = payload.order;
    const transaction = payload.transaction;
    if (!orderData || !transaction) return { message: 'ignored' };
    if (orderData.order_status !== 'CAPTURED' || transaction.transaction_status !== 'APPROVED') {
      return { message: 'ignored' };
    }
    if (orderData.order_currency !== 'VND' || transaction.transaction_currency !== 'VND') {
      return { message: 'currency_mismatch' };
    }
    const invoice = orderData.order_invoice_number;
    if (!invoice) return { message: 'ignored' };
    const [order] = await tx.query<PaymentOrderRow>(
      `select * from premium_payment_orders where invoice_number = $1 for update`,
      [invoice],
    );
    if (!order) return { message: 'order_not_found' };
    if (order.status !== 'pending') return { message: 'already_processed', orderId: order.id };
    const orderAmount = parseVndAmount(orderData.order_amount);
    const transactionAmount = parseVndAmount(transaction.transaction_amount);
    if (orderAmount === null || transactionAmount === null) {
      return { message: 'amount_invalid', orderId: order.id };
    }
    if (orderAmount !== order.amount_vnd || transactionAmount !== order.amount_vnd) {
      return { message: 'amount_mismatch', orderId: order.id };
    }
    const transactionId = transaction.transaction_id;
    if (!transactionId) return { message: 'transaction_id_missing', orderId: order.id };
    const [duplicate] = await tx.query<{ id: string } & Record<string, unknown>>(
      `select id from premium_payment_orders
        where sepay_transaction_id = $1 and id <> $2 limit 1`,
      [transactionId, order.id],
    );
    if (duplicate) return { message: 'transaction_conflict', orderId: order.id };
    const claimed = await tx.query<PaymentOrderRow>(
      `update premium_payment_orders
          set status = 'paid', sepay_transaction_id = $2, raw_ipn = $3,
              paid_at = now(), grant_type = 'payment', updated_at = now()
        where id = $1 and status = 'pending' returning *`,
      [order.id, transactionId, JSON.stringify(safePayload)],
    );
    if (!claimed[0]) return { message: 'already_processed', orderId: order.id };
    await this.createGrant(
      tx,
      order.user_id,
      order.plan_id,
      order.id,
      PAYMENT,
      order.duration_days_snapshot,
      null,
      null,
    );
    await this.refreshSubscription(tx, order.user_id, order.plan_id);
    return { message: 'processed', orderId: order.id };
  }

  async grantTrialIfEligible(userId: string): Promise<boolean> {
    return this.db().transaction(async (tx) => {
      await this.lockEntitlementUser(tx, userId);
      const [existing] = await tx.query<{ id: string } & Record<string, unknown>>(
        `select id from billing_entitlement_grants where user_id = $1 limit 1 for update`,
        [userId],
      );
      if (existing) return false;
      const [plan] = await tx.query<PlanRow>(
        `select * from premium_plans where code = 'TRIAL_7D' and is_active = true`,
      );
      if (!plan) return false;
      await this.createGrant(tx, userId, plan.id, null, TRIAL, plan.duration_days, null, null);
      await this.refreshSubscription(tx, userId, plan.id);
      return true;
    });
  }

  async adminGrant(
    userId: string,
    planId: string,
    actor: AdminActor,
    note?: string | null,
  ): Promise<PaymentOrderRow> {
    return this.db().transaction(async (tx) => {
      await this.lockEntitlementUser(tx, userId);
      const [user] = await tx.query<{ id: string } & Record<string, unknown>>(
        `select id from users where id = $1 for update`,
        [userId],
      );
      if (!user) throw notFound('USER_NOT_FOUND', 'Không tìm thấy người dùng');
      const plan = await this.getPlan(planId, tx);
      const invoice = `GRANT_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      const [order] = await tx.query<PaymentOrderRow>(
        `insert into premium_payment_orders
           (invoice_number, user_id, plan_id, amount_vnd, currency, status, paid_at,
            grant_type, granted_by_user_id, grant_note, plan_code_snapshot,
            plan_name_snapshot, duration_days_snapshot)
         values ($1, $2, $3, 0, 'VND', 'paid', now(), 'admin_grant', $4, $5, $6, $7, $8)
         returning *`,
        [invoice, userId, planId, actor.id, note ?? null, plan.code, plan.name, plan.duration_days],
      );
      if (!order) throw new Error('Admin grant order insert returned no row');
      await this.createGrant(
        tx,
        userId,
        planId,
        order.id,
        ADMIN_GRANT,
        plan.duration_days,
        actor.id,
        note ?? null,
      );
      await this.refreshSubscription(tx, userId, planId);
      await this.audit(tx, actor, 'premium.grant', 'payment_order', order.id, null, {
        user_id: userId,
        plan_id: planId,
        note: note ?? null,
      });
      return normalizePaymentMoney(order);
    });
  }

  async listPayments(query: PaymentListQuery): Promise<Record<string, unknown>> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (query.status) add('o.status = ?', query.status);
    if (query.grant_type) add('o.grant_type = ?', query.grant_type);
    if (query.user_id) add('o.user_id = ?', query.user_id);
    if (query.plan_id) add('o.plan_id = ?', query.plan_id);
    if (query.date_from) add('o.created_at >= ?', query.date_from);
    if (query.date_to) add('o.created_at < ?', query.date_to);
    if (query.search) {
      params.push(`%${query.search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      conditions.push(
        `(o.invoice_number ilike $${params.length} escape '\\' or u.email ilike $${params.length} escape '\\')`,
      );
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const [count] = await this.db().query<CountRow>(
      `select count(*)::int as total from premium_payment_orders o
        left join users u on u.id = o.user_id ${where}`,
      params,
    );
    params.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = await this.db().query<Record<string, unknown>>(
      `select o.id, o.invoice_number, o.amount_vnd, o.refunded_amount_vnd, o.currency,
              o.status, o.grant_type, o.paid_at, o.created_at, o.plan_id,
              o.plan_name_snapshot as plan_name, o.plan_code_snapshot as plan_code,
              o.user_id, u.email as user_email,
              (select count(*)::int from sepay_ipn_logs l where l.matched_order_id = o.id) as ipn_log_count
         from premium_payment_orders o left join users u on u.id = o.user_id
         ${where} order by o.created_at desc limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const total = count?.total ?? 0;
    return {
      items: rows.map(normalizePaymentMoney),
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }

  async getPayment(
    orderId: string,
    client: BillingSqlClient = this.db(),
  ): Promise<Record<string, unknown>> {
    const [order] = await client.query<Record<string, unknown>>(
      `select o.*, o.plan_name_snapshot as plan_name, o.plan_code_snapshot as plan_code,
              o.amount_vnd as plan_price_vnd, u.email as user_email,
              s.id as subscription_id, s.status as subscription_status,
              s.current_period_end as subscription_period_end
         from premium_payment_orders o
         left join users u on u.id = o.user_id
         left join premium_subscriptions s on s.user_id = o.user_id
        where o.id = $1`,
      [orderId],
    );
    if (!order) throw notFound('PAYMENT_ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');
    const logs = await client.query<Record<string, unknown>>(
      `select id, received_at, secret_key_valid, result_status, sepay_transaction_id, error_message
         from sepay_ipn_logs where matched_order_id = $1
        order by received_at desc limit 10`,
      [orderId],
    );
    return { ...normalizePaymentMoney(order), ipn_logs: logs };
  }

  async markPaid(
    orderId: string,
    actor: AdminActor,
    note: string,
  ): Promise<Record<string, unknown>> {
    await this.db().transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'pending') {
        throw badRequest(
          'PAYMENT_NOT_PENDING',
          `Đơn hàng không ở trạng thái PENDING (${order.status})`,
        );
      }
      const [claimed] = await tx.query<PaymentOrderRow>(
        `update premium_payment_orders
            set status = 'paid', paid_at = now(), grant_type = 'admin_confirmed',
                granted_by_user_id = $2, grant_note = $3, updated_at = now()
          where id = $1 and status = 'pending' returning *`,
        [orderId, actor.id, note],
      );
      if (!claimed)
        throw conflict('PAYMENT_ALREADY_CLAIMED', 'Đơn hàng vừa được xử lý bởi yêu cầu khác');
      await this.createGrant(
        tx,
        order.user_id,
        order.plan_id,
        order.id,
        ADMIN_CONFIRMED,
        order.duration_days_snapshot,
        actor.id,
        note,
      );
      await this.refreshSubscription(tx, order.user_id, order.plan_id);
      await this.audit(
        tx,
        actor,
        'premium.order.mark_paid',
        'payment_order',
        orderId,
        { status: 'pending' },
        {
          status: 'paid',
          grant_type: ADMIN_CONFIRMED,
        },
        note,
      );
    });
    return this.getPayment(orderId);
  }

  async refund(
    orderId: string,
    actor: AdminActor,
    reason: string,
    requestedAmount?: number,
  ): Promise<Record<string, unknown>> {
    await this.db().transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      await this.lockEntitlementUser(tx, order.user_id);
      const orderAmount = exactVndNumber(order.amount_vnd, 'amount_vnd');
      const alreadyRefunded = exactVndNumber(order.refunded_amount_vnd, 'refunded_amount_vnd');
      if (!['paid', 'partially_refunded'].includes(order.status) || orderAmount <= 0) {
        throw badRequest('PAYMENT_NOT_REFUNDABLE', 'Chỉ có thể hoàn đơn thanh toán đã PAID');
      }
      const remaining = orderAmount - alreadyRefunded;
      const amount = requestedAmount ?? remaining;
      if (amount <= 0 || amount > remaining) {
        throw badRequest('REFUND_AMOUNT_INVALID', `Số tiền hoàn phải từ 1 đến ${remaining}`);
      }
      // This records an administrator-approved refund in IQX's ledger. It
      // intentionally does not claim that funds were sent by SePay: provider
      // settlement is an external operational action.
      await tx.query(
        `insert into billing_refunds (order_id, amount_vnd, reason, created_by_user_id)
         values ($1, $2, $3, $4)`,
        [orderId, amount, reason, actor.id],
      );
      const [updated] = await tx.query<
        PaymentOrderRow & { amount_vnd_text: string; refunded_amount_vnd_text: string }
      >(
        `update premium_payment_orders
            set refunded_amount_vnd = refunded_amount_vnd + $2::bigint,
                status = case
                  when refunded_amount_vnd + $2::bigint = amount_vnd::bigint
                    then 'refunded'::payment_order_status
                  else 'partially_refunded'::payment_order_status
                end,
                updated_at = now()
          where id = $1
            and status in ('paid', 'partially_refunded')
            and $2::bigint > 0
            and refunded_amount_vnd + $2::bigint <= amount_vnd::bigint
          returning *, amount_vnd::text as amount_vnd_text,
                       refunded_amount_vnd::text as refunded_amount_vnd_text`,
        [orderId, amount],
      );
      if (!updated) {
        throw conflict('REFUND_CONCURRENT_UPDATE', 'Đơn hàng vừa được hoàn bởi yêu cầu khác');
      }
      const newRefunded = exactVndNumber(updated.refunded_amount_vnd_text, 'refunded_amount_vnd');
      const full = updated.status === 'refunded';
      await tx.query(
        `update billing_entitlement_grants
            set ends_at = starts_at + (
                  (original_ends_at - starts_at) *
                  ((o.amount_vnd::numeric - o.refunded_amount_vnd::numeric) /
                   nullif(o.amount_vnd::numeric, 0))::double precision
                ),
                status = case
                  when o.refunded_amount_vnd = o.amount_vnd::bigint or
                       starts_at + (
                         (original_ends_at - starts_at) *
                         ((o.amount_vnd::numeric - o.refunded_amount_vnd::numeric) /
                          nullif(o.amount_vnd::numeric, 0))::double precision
                       ) <= now()
                  then 'revoked' else 'active' end,
                revoked_at = case when o.refunded_amount_vnd = o.amount_vnd::bigint then now() else revoked_at end,
                revoked_by_user_id = case when o.refunded_amount_vnd = o.amount_vnd::bigint then $2 else revoked_by_user_id end,
                revoke_reason = case when o.refunded_amount_vnd = o.amount_vnd::bigint then $3 else revoke_reason end,
                updated_at = now()
           from premium_payment_orders o
          where billing_entitlement_grants.order_id = o.id
            and o.id = $1
            and billing_entitlement_grants.kind in ('payment', 'admin_confirmed')`,
        [orderId, actor.id, reason],
      );
      await this.refreshSubscription(tx, order.user_id, order.plan_id);
      await this.audit(
        tx,
        actor,
        'premium.order.refund',
        'payment_order',
        orderId,
        { status: order.status, refunded_amount_vnd: alreadyRefunded },
        { status: full ? 'refunded' : 'partially_refunded', refunded_amount_vnd: newRefunded },
        reason,
      );
    });
    return this.getPayment(orderId);
  }

  async reconcile(
    orderId: string,
    actor: AdminActor,
    note?: string | null,
  ): Promise<Record<string, unknown>> {
    return this.db().transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'pending') {
        throw badRequest(
          'PAYMENT_NOT_PENDING',
          `Chỉ có thể reconcile đơn PENDING (${order.status})`,
        );
      }
      const [age] = await tx.query<{ stale: boolean } & Record<string, unknown>>(
        `select created_at <= now() - interval '30 minutes' as stale
           from premium_payment_orders where id = $1`,
        [orderId],
      );
      if (!age?.stale)
        throw badRequest('PAYMENT_TOO_RECENT', 'Đơn hàng chưa đủ 30 phút để reconcile');
      const [log] = await tx.query<
        Record<string, unknown> & { id: string; raw_body: IpnPayload | null }
      >(
        `select id, raw_body from sepay_ipn_logs
          where secret_key_valid = true and raw_body is not null
            and (matched_order_id = $1 or raw_body #>> '{order,order_invoice_number}' = $2)
          order by received_at desc limit 1`,
        [orderId, order.invoice_number],
      );
      if (!log?.raw_body) {
        await this.audit(
          tx,
          actor,
          'premium.order.reconcile',
          'payment_order',
          orderId,
          { status: 'pending' },
          {
            status: 'no_match',
          },
          note ?? null,
        );
        return { status: 'no_match', order_id: orderId };
      }
      const parsed = ipnPayloadSchema.safeParse(log.raw_body);
      if (!parsed.success) throw badRequest('IPN_LOG_INVALID', 'IPN đã lưu không thể xử lý');
      const result = await this.processIpnPayload(tx, parsed.data, sanitizeIpnPayload(parsed.data));
      await this.audit(
        tx,
        actor,
        'premium.order.reconcile',
        'payment_order',
        orderId,
        { status: 'pending' },
        {
          status: result.message,
          source_log_id: log.id,
        },
        note ?? null,
      );
      return {
        status: result.message === 'processed' ? 'reconciled' : result.message,
        order_id: orderId,
      };
    });
  }

  async listSubscriptions(query: SubscriptionListQuery): Promise<Record<string, unknown>> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (query.status) add('s.status = ?', query.status);
    if (query.plan_id) add('s.current_plan_id = ?', query.plan_id);
    if (query.user_id) add('s.user_id = ?', query.user_id);
    if (query.expiring_within_days) {
      params.push(query.expiring_within_days);
      conditions.push(
        `s.status = 'active' and s.current_period_end < now() + ($${params.length} * interval '1 day')`,
      );
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const [count] = await this.db().query<CountRow>(
      `select count(*)::int as total from premium_subscriptions s ${where}`,
      params,
    );
    params.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = await this.db().query<Record<string, unknown>>(
      `select s.*, u.email as user_email, p.name as plan_name, p.code as plan_code
         from premium_subscriptions s
         left join users u on u.id = s.user_id
         left join premium_plans p on p.id = s.current_plan_id
         ${where} order by s.created_at desc limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const total = count?.total ?? 0;
    return {
      items: rows,
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }

  async getSubscription(
    subId: string,
    client: BillingSqlClient = this.db(),
  ): Promise<Record<string, unknown>> {
    const [row] = await client.query<Record<string, unknown>>(
      `select s.*, u.email as user_email, p.name as plan_name, p.code as plan_code
         from premium_subscriptions s
         left join users u on u.id = s.user_id
         left join premium_plans p on p.id = s.current_plan_id
        where s.id = $1`,
      [subId],
    );
    if (!row) throw notFound('SUBSCRIPTION_NOT_FOUND', 'Không tìm thấy subscription');
    return row;
  }

  async subscriptionHistory(userId: string): Promise<Record<string, unknown>[]> {
    return this.db().query<Record<string, unknown>>(
      `select h.*, p.name as plan_name, p.code as plan_code, u.email as user_email
         from billing_subscription_history h
         left join premium_plans p on p.id = h.plan_id
         left join users u on u.id = h.user_id
        where h.user_id = $1 order by h.created_at desc`,
      [userId],
    );
  }

  async cancelSubscription(
    subId: string,
    actor: AdminActor,
    reason: string,
  ): Promise<Record<string, unknown>> {
    await this.db().transaction(async (tx) => {
      const sub = await this.lockSubscriptionForEntitlement(tx, subId);
      if (sub.status === 'cancelled')
        throw badRequest('SUBSCRIPTION_ALREADY_CANCELLED', 'Subscription đã bị huỷ');
      await tx.query(
        `update billing_entitlement_grants
            set status = 'revoked', revoked_at = now(), revoked_by_user_id = $2,
                revoke_reason = $3, updated_at = now()
          where user_id = $1 and status = 'active' and ends_at > now()`,
        [sub.user_id, actor.id, reason],
      );
      await tx.query(
        `update premium_subscriptions
            set status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2,
                cancel_reason = $3, updated_at = now()
          where id = $1`,
        [subId, actor.id, reason],
      );
      await tx.query(
        `update users set role = 'user', updated_at = now() where id = $1 and role = 'premium'`,
        [sub.user_id],
      );
      await this.addHistory(tx, sub.user_id, sub.current_plan_id, 'cancelled', actor.id, reason);
      await this.audit(
        tx,
        actor,
        'subscription.cancel',
        'subscription',
        subId,
        { status: sub.status },
        {
          status: 'cancelled',
        },
        reason,
      );
    });
    return this.getSubscription(subId);
  }

  async extendSubscription(
    subId: string,
    actor: AdminActor,
    days: number,
    reason?: string | null,
  ): Promise<Record<string, unknown>> {
    await this.db().transaction(async (tx) => {
      const sub = await this.lockSubscriptionForEntitlement(tx, subId);
      if (!sub.current_plan_id)
        throw badRequest('SUBSCRIPTION_HAS_NO_PLAN', 'Subscription không có gói hiện tại');
      await this.createGrant(
        tx,
        sub.user_id,
        sub.current_plan_id,
        null,
        EXTENSION,
        days,
        actor.id,
        reason ?? null,
      );
      await this.refreshSubscription(tx, sub.user_id, sub.current_plan_id);
      await this.addHistory(
        tx,
        sub.user_id,
        sub.current_plan_id,
        'extended',
        actor.id,
        reason ?? null,
        days,
      );
      await this.audit(
        tx,
        actor,
        'subscription.extend',
        'subscription',
        subId,
        {
          current_period_end: sub.current_period_end,
        },
        { days_added: days },
        reason ?? null,
      );
    });
    return this.getSubscription(subId);
  }

  async listIpnLogs(query: IpnListQuery): Promise<Record<string, unknown>> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (query.secret_key_valid !== undefined) add('secret_key_valid = ?', query.secret_key_valid);
    if (query.result_status) add('result_status = ?', query.result_status);
    if (query.date_from) add('received_at >= ?', query.date_from);
    if (query.date_to) add('received_at < ?', query.date_to);
    if (query.search) {
      params.push(`%${query.search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      conditions.push(
        `(sepay_transaction_id ilike $${params.length} escape '\\' or result_status ilike $${params.length} escape '\\')`,
      );
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const [count] = await this.db().query<CountRow>(
      `select count(*)::int as total from sepay_ipn_logs ${where}`,
      params,
    );
    params.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = await this.db().query<Record<string, unknown>>(
      `select id, received_at, secret_key_valid, result_status, matched_order_id,
              sepay_transaction_id, error_message
         from sepay_ipn_logs ${where}
        order by received_at desc limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const total = count?.total ?? 0;
    return {
      items: rows,
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }

  async getIpnLog(logId: string): Promise<Record<string, unknown>> {
    const [row] = await this.db().query<Record<string, unknown>>(
      `select id, received_at, secret_key_valid, result_status, matched_order_id,
              sepay_transaction_id, error_message, raw_body, raw_headers
         from sepay_ipn_logs where id = $1`,
      [logId],
    );
    if (!row) throw notFound('IPN_LOG_NOT_FOUND', 'Không tìm thấy IPN log');
    return row;
  }

  async retryIpn(logId: string, actor: AdminActor): Promise<Record<string, unknown>> {
    return this.db().transaction(async (tx) => {
      const [log] = await tx.query<
        Record<string, unknown> & {
          id: string;
          secret_key_valid: boolean;
          result_status: string | null;
          raw_body: unknown;
          raw_headers: Record<string, string> | null;
        }
      >(`select * from sepay_ipn_logs where id = $1 for update`, [logId]);
      if (!log) throw notFound('IPN_LOG_NOT_FOUND', 'Không tìm thấy IPN log');
      if (!log.secret_key_valid)
        throw badRequest('IPN_SECRET_INVALID', 'Không thể retry IPN không hợp lệ');
      if (log.result_status === 'processed')
        throw badRequest('IPN_ALREADY_PROCESSED', 'IPN đã được xử lý');
      const parsed = ipnPayloadSchema.safeParse(log.raw_body);
      if (!parsed.success) throw badRequest('IPN_LOG_INVALID', 'IPN đã lưu không thể xử lý');
      const result = await this.processIpnPayload(tx, parsed.data, sanitizeIpnPayload(parsed.data));
      const [newLog] = await tx.query<{ id: string } & Record<string, unknown>>(
        `insert into sepay_ipn_logs
           (secret_key_valid, raw_body, raw_headers, result_status, matched_order_id,
            sepay_transaction_id, retried_from_log_id)
         values (true, $1::jsonb, $2::jsonb, $3, $4, $5, $6) returning id`,
        [
          JSON.stringify(sanitizeIpnPayload(parsed.data)),
          JSON.stringify(log.raw_headers ?? {}),
          result.message,
          result.orderId ?? null,
          parsed.data.transaction?.transaction_id ?? null,
          logId,
        ],
      );
      if (!newLog) throw new Error('IPN retry log insert returned no row');
      await this.audit(tx, actor, 'premium.ipn.retry', 'sepay_ipn_log', logId, null, {
        retry_log_id: newLog.id,
        result: result.message,
      });
      return {
        status: result.message,
        log_id: newLog.id,
        message: `IPN retry completed: ${result.message}`,
      };
    });
  }

  private async lockOrder(tx: BillingSqlClient, orderId: string): Promise<PaymentOrderRow> {
    const [order] = await tx.query<PaymentOrderRow>(
      `select * from premium_payment_orders where id = $1 for update`,
      [orderId],
    );
    if (!order) throw notFound('PAYMENT_ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');
    return normalizePaymentMoney(order);
  }

  private async lockEntitlementUser(tx: BillingSqlClient, userId: string): Promise<void> {
    await tx.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `billing-entitlement:${userId}`,
    ]);
  }

  private async lockSubscriptionForEntitlement(
    tx: BillingSqlClient,
    subId: string,
  ): Promise<SubscriptionRow> {
    const [identity] = await tx.query<{ user_id: string } & Record<string, unknown>>(
      `select user_id from premium_subscriptions where id = $1`,
      [subId],
    );
    if (!identity) throw notFound('SUBSCRIPTION_NOT_FOUND', 'Không tìm thấy subscription');
    await this.lockEntitlementUser(tx, identity.user_id);
    const [sub] = await tx.query<SubscriptionRow>(
      `select * from premium_subscriptions where id = $1 for update`,
      [subId],
    );
    if (!sub) throw notFound('SUBSCRIPTION_NOT_FOUND', 'Không tìm thấy subscription');
    return sub;
  }

  private async createGrant(
    tx: BillingSqlClient,
    userId: string,
    planId: string,
    orderId: string | null,
    kind: string,
    durationDays: number,
    actorId: string | null,
    note: string | null,
  ): Promise<void> {
    // Serialize grants per user: different paid orders may arrive concurrently and
    // must extend from the latest end rather than both starting at the same instant.
    await this.lockEntitlementUser(tx, userId);
    await tx.query(
      `with boundary as (
         select greatest(now(), coalesce(max(ends_at), now())) as starts_at
           from billing_entitlement_grants
          where user_id = $1 and status = 'active' and ends_at > now()
       )
       insert into billing_entitlement_grants
         (user_id, plan_id, order_id, kind, duration_days, starts_at, ends_at,
          original_ends_at, granted_by_user_id, note, status)
       select $1, $2, $3, $4, $5::integer, starts_at,
              starts_at + make_interval(days => $5::integer),
              starts_at + make_interval(days => $5::integer), $6, $7, 'active'
         from boundary
       on conflict (order_id) where order_id is not null do nothing`,
      [userId, planId, orderId, kind, durationDays, actorId, note],
    );
  }

  private async refreshSubscription(
    tx: BillingSqlClient,
    userId: string,
    fallbackPlanId: string,
  ): Promise<void> {
    const [aggregate] = await tx.query<
      Record<string, unknown> & {
        starts_at: Date | string | null;
        ends_at: Date | string | null;
        current_plan_id: string | null;
        entitled: boolean;
      }
    >(
      `select min(starts_at) filter (where ends_at > now()) as starts_at,
              max(ends_at) filter (where ends_at > now()) as ends_at,
              (array_agg(plan_id order by ends_at desc) filter (where ends_at > now()))[1] as current_plan_id,
              coalesce(bool_or(starts_at <= now() and now() < ends_at), false) as entitled
         from billing_entitlement_grants
        where user_id = $1 and status = 'active'`,
      [userId],
    );
    if (aggregate?.ends_at && aggregate.starts_at) {
      const [sub] = await tx.query<{ id: string } & Record<string, unknown>>(
        `insert into premium_subscriptions
           (user_id, current_plan_id, current_period_start, current_period_end, status)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set
           current_plan_id = excluded.current_plan_id,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           status = excluded.status,
           cancelled_at = null, cancelled_by_user_id = null, cancel_reason = null,
           updated_at = now()
         returning id`,
        [
          userId,
          aggregate.current_plan_id ?? fallbackPlanId,
          aggregate.starts_at,
          aggregate.ends_at,
          aggregate.entitled ? 'active' : 'expired',
        ],
      );
      if (aggregate.entitled) {
        await tx.query(
          `update users set role = 'premium', updated_at = now() where id = $1 and role = 'user'`,
          [userId],
        );
      } else {
        await tx.query(
          `update users set role = 'user', updated_at = now() where id = $1 and role = 'premium'`,
          [userId],
        );
      }
      if (sub)
        await this.addHistory(
          tx,
          userId,
          aggregate.current_plan_id ?? fallbackPlanId,
          'grant_applied',
          null,
          null,
        );
      return;
    }
    await tx.query(
      `update premium_subscriptions
          set status = 'expired', current_period_end = least(current_period_end, now()), updated_at = now()
        where user_id = $1 and status <> 'cancelled'`,
      [userId],
    );
    await tx.query(
      `update users set role = 'user', updated_at = now() where id = $1 and role = 'premium'`,
      [userId],
    );
  }

  private async addHistory(
    tx: BillingSqlClient,
    userId: string,
    planId: string | null,
    eventType: string,
    actorId: string | null,
    reason: string | null,
    days?: number,
  ): Promise<void> {
    await tx.query(
      `insert into billing_subscription_history
         (user_id, plan_id, event_type, actor_user_id, reason, days_delta)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId, planId, eventType, actorId, reason, days ?? null],
    );
  }

  private async audit(
    tx: BillingSqlClient,
    actor: AdminActor,
    action: string,
    entity: string,
    targetId: string,
    before: unknown,
    after: unknown,
    note: string | null = null,
  ): Promise<void> {
    await tx.query(
      `insert into admin_audit_log
         (admin_user_id, action, target_entity, target_id, payload_before, payload_after,
          note, ip, user_agent, request_id)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
      [
        actor.id,
        action,
        entity,
        targetId,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        note,
        actor.ip ?? null,
        actor.userAgent ?? null,
        actor.requestId ?? null,
      ],
    );
  }
}
