export type SqlValue = string | number | boolean | Date | null | Record<string, unknown>;

export interface BillingSqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
}

export interface AdminActor {
  id: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface PlanRow extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_vnd: number;
  duration_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PaymentOrderRow extends Record<string, unknown> {
  id: string;
  invoice_number: string;
  user_id: string;
  plan_id: string;
  /** PostgreSQL int4 normally decodes to number; accept text for defensive projections. */
  amount_vnd: number | string;
  /** node-postgres deliberately decodes int8 as text to avoid precision loss. */
  refunded_amount_vnd: number | string;
  currency: string;
  status: string;
  duration_days_snapshot: number;
  plan_code_snapshot: string;
  plan_name_snapshot: string;
  sepay_transaction_id: string | null;
  paid_at: Date | string | null;
  grant_type: string | null;
  granted_by_user_id: string | null;
  grant_note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SubscriptionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  current_plan_id: string | null;
  current_period_start: Date | string;
  current_period_end: Date | string;
  status: string;
  cancelled_at: Date | string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface IpnPayload {
  timestamp?: number | null;
  notification_type?: string | null;
  order?: {
    id?: string | null;
    order_id?: string | null;
    order_status?: string | null;
    order_currency?: string | null;
    order_amount?: string | null;
    order_invoice_number?: string | null;
    order_description?: string | null;
  } | null;
  transaction?: {
    id?: string | null;
    payment_method?: string | null;
    transaction_id?: string | null;
    transaction_type?: string | null;
    transaction_date?: string | null;
    transaction_status?: string | null;
    transaction_amount?: string | null;
    transaction_currency?: string | null;
    authentication_status?: string | null;
  } | null;
}
