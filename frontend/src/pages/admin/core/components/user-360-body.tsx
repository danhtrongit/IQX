import type { ReactNode } from "react"
import { Link } from "react-router"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime, formatMoney, formatPremiumEnd } from "@/lib/format"

import type { AdminUserDetail, LoginHistoryRow, PaymentOrderBrief, SubscriptionBrief, User360 } from "../api"
import { labelForGrantType, labelForRole } from "../labels"
import { AdminDataTable, type AdminColumn, type AdminPagination } from "./admin-data-table"
import { DetailList } from "./detail-list"
import { StatusBadge } from "./status-badge"
import { UserAcademyTab } from "./user-academy-tab"
import { UserTradingInsights } from "./user-trading-insights"

/**
 * Phần thân chỉ-xem của chi tiết người dùng, dùng chung cho quản trị viên
 * (`admin/users/:id/360`) và trưởng nhóm (`team/users/:id`, admin spec v1.1 §5.1.3).
 * Mọi thao tác ghi do trang chứa nó quyết định; ở đây không có liên kết quản trị nào
 * trừ khi trang truyền vào (`paymentHref`, `vtExtra`).
 */

function dash(value: ReactNode) {
  return value === null || value === undefined || value === "" ? <span className="text-muted-foreground">—</span> : value
}

function dateTime(value: string | null | undefined) {
  return value ? <span className="tabular-nums">{formatDateTime(value)}</span> : dash(null)
}

/** Thẻ Tài khoản và Thuê bao hiện tại. `fullRecord` (hồ sơ đầy đủ) chỉ quản trị viên có. */
export function UserAccountCards({
  profile,
  fullRecord,
  scope,
}: {
  profile: User360
  fullRecord?: AdminUserDetail
  scope: "admin" | "team"
}) {
  const { user, subscription } = profile
  const items = [
    { label: "Email", value: user.email },
    { label: "Tên đăng nhập", value: user.username ? <span className="font-mono">{user.username}</span> : dash(null) },
    { label: "Họ tên", value: dash(user.fullName) },
    { label: "Điện thoại", value: dash(fullRecord?.phoneE164 ?? user.phoneNumber) },
    { label: "Vai trò", value: <StatusBadge status={user.role} label={labelForRole(user.role)} tone="info" /> },
    { label: "Trạng thái", value: <StatusBadge status={user.status} /> },
    {
      label: "Xác thực email",
      value: (
        <span className="flex items-center gap-2">
          <StatusBadge status={user.isEmailVerified} label={user.isEmailVerified ? "Đã xác thực" : "Chưa xác thực"} />
          {fullRecord?.emailVerifiedAt && (
            <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(fullRecord.emailVerifiedAt)}</span>
          )}
        </span>
      ),
    },
    { label: "Đã dùng thử", value: profile.trialUsed ? "Có" : "Không" },
    { label: "Tạo lúc", value: dateTime(user.createdAt) },
    // Hồ sơ đầy đủ (`GET users/:id`) chỉ dành cho quản trị viên.
    ...(scope === "admin" ? [{ label: "Cập nhật lúc", value: dateTime(fullRecord?.updatedAt) }] : []),
    { label: "Đăng nhập gần nhất", value: dateTime(user.lastLoginAt) },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Tài khoản</CardTitle>
          <CardDescription>Thông tin định danh và trạng thái truy cập</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList items={items} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thuê bao hiện tại</CardTitle>
          <CardDescription>
            {subscription ? "Thuê bao đang hoạt động và còn hạn" : "Không có thuê bao nào đang hoạt động"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <DetailList
              columns={2}
              items={[
                { label: "Gói", value: subscription.plan?.name ?? dash(null) },
                { label: "Mã gói", value: <span className="font-mono text-xs">{subscription.plan?.code ?? "—"}</span> },
                { label: "Giá gói", value: subscription.plan ? formatMoney(subscription.plan.priceVnd) : dash(null) },
                { label: "Trạng thái", value: <StatusBadge status={subscription.status} /> },
                { label: "Bắt đầu", value: dateTime(subscription.currentPeriodStart) },
                {
                  label: "Kết thúc",
                  value: <span className="tabular-nums">{formatPremiumEnd(subscription.currentPeriodEnd)}</span>,
                },
                { label: "Dùng thử", value: subscription.isTrial ? "Có" : "Không" },
                { label: "Hủy lúc", value: dateTime(subscription.cancelledAt) },
              ]}
            />
          ) : (
            <p className="py-6 text-sm text-muted-foreground">Người dùng chưa có thuê bao đang hoạt động.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export type LoginHistoryView = {
  rows: LoginHistoryRow[]
  loading: boolean
  error: string | null
  onRetry: () => void
  pagination: AdminPagination
}

/**
 * Các tab Thuê bao · Thanh toán · Demo Trading và Bot · Lịch sử đăng nhập · Học viện.
 * Tab Demo Trading và Bot chỉ có % lợi nhuận; quản trị viên thêm thẻ tiền và lệnh qua
 * `vtExtra`. `paymentHref` biến mã hoá đơn thành liên kết (chỉ quản trị viên).
 */
export function UserDetailTabs({
  profile,
  scope,
  loginHistory,
  paymentHref,
  vtExtra,
}: {
  profile: User360
  scope: "admin" | "team"
  loginHistory: LoginHistoryView
  paymentHref?: (paymentId: string) => string
  vtExtra?: ReactNode
}) {
  const subscriptionColumns: AdminColumn<SubscriptionBrief>[] = [
    { id: "plan", header: "Gói", cell: (row) => row.plan?.name ?? dash(null) },
    { id: "code", header: "Mã gói", cell: (row) => <span className="font-mono text-xs">{row.plan?.code ?? "—"}</span> },
    { id: "status", header: "Trạng thái", cell: (row) => <StatusBadge status={row.status} /> },
    { id: "trial", header: "Dùng thử", cell: (row) => (row.isTrial ? "Có" : "Không") },
    {
      id: "period",
      header: "Chu kỳ",
      cell: (row) => (
        <span className="tabular-nums">
          {formatDateTime(row.currentPeriodStart)} → {formatPremiumEnd(row.currentPeriodEnd)}
        </span>
      ),
    },
    {
      id: "cancelled",
      header: "Hủy",
      cell: (row) =>
        row.cancelledAt ? (
          <span className="text-xs">
            <span className="tabular-nums">{formatDateTime(row.cancelledAt)}</span>
            {row.cancelReason && <span className="block text-muted-foreground">{row.cancelReason}</span>}
            {scope === "admin" && row.cancelledByUserId && (
              <span className="block font-mono text-[11px] text-muted-foreground">bởi {row.cancelledByUserId}</span>
            )}
          </span>
        ) : (
          dash(null)
        ),
    },
  ]

  const paymentColumns: AdminColumn<PaymentOrderBrief>[] = [
    {
      id: "invoice",
      header: "Mã hóa đơn",
      cell: (row) =>
        paymentHref ? (
          <Link
            to={paymentHref(row.id)}
            className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.invoiceNumber}
          </Link>
        ) : (
          <span className="font-mono text-xs">{row.invoiceNumber}</span>
        ),
    },
    { id: "amount", header: "Số tiền", align: "right", cell: (row) => formatMoney(row.amountVnd) },
    { id: "plan", header: "Gói", cell: (row) => dash(row.planCode ?? null) },
    { id: "grant", header: "Hình thức", cell: (row) => labelForGrantType(row.grantType) },
    { id: "status", header: "Trạng thái", cell: (row) => <StatusBadge status={row.status} /> },
    { id: "paidAt", header: "Đã thanh toán", cell: (row) => dateTime(row.paidAt) },
    { id: "createdAt", header: "Tạo lúc", cell: (row) => dateTime(row.createdAt) },
  ]

  const loginColumns: AdminColumn<LoginHistoryRow>[] = [
    { id: "loginAt", header: "Thời gian", cell: (row) => dateTime(row.loginAt) },
    {
      id: "result",
      header: "Kết quả",
      cell: (row) => <StatusBadge status={row.success} label={row.success ? "Thành công" : "Thất bại"} />,
    },
    { id: "ip", header: "IP", cell: (row) => <span className="font-mono text-xs">{row.ip ?? "—"}</span> },
    {
      id: "agent",
      header: "Thiết bị",
      cell: (row) => (
        <span className="block max-w-[22rem] truncate text-xs text-muted-foreground" title={row.userAgent ?? ""}>
          {row.userAgent ?? "—"}
        </span>
      ),
    },
    { id: "reason", header: "Lý do", cell: (row) => dash(row.failureReason) },
  ]

  return (
    <Tabs defaultValue="subscriptions">
      <TabsList variant="line">
        <TabsTrigger value="subscriptions">Thuê bao ({profile.subscriptionHistory.length})</TabsTrigger>
        <TabsTrigger value="payments">Thanh toán ({profile.paymentHistory.length})</TabsTrigger>
        <TabsTrigger value="vt">Demo Trading và Bot</TabsTrigger>
        <TabsTrigger value="logins">
          Lịch sử đăng nhập ({loginHistory.pagination.total || profile.loginHistory.length})
        </TabsTrigger>
        <TabsTrigger value="academy">Học viện</TabsTrigger>
      </TabsList>

      <TabsContent value="subscriptions" className="mt-4">
        <AdminDataTable
          columns={subscriptionColumns}
          rows={profile.subscriptionHistory}
          rowKey={(row) => row.id}
          emptyLabel="Chưa có thuê bao nào."
        />
      </TabsContent>

      <TabsContent value="payments" className="mt-4">
        <AdminDataTable
          columns={paymentColumns}
          rows={profile.paymentHistory}
          rowKey={(row) => row.id}
          emptyLabel="Chưa có đơn thanh toán nào."
          footer={
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Hiển thị 20 đơn gần nhất theo máy chủ.
            </p>
          }
        />
      </TabsContent>

      <TabsContent value="vt" className="mt-4 space-y-4">
        <UserTradingInsights demoTrading={profile.demoTrading} bot={profile.bot} />
        {vtExtra}
      </TabsContent>

      <TabsContent value="logins" className="mt-4">
        <AdminDataTable
          columns={loginColumns}
          rows={loginHistory.rows}
          rowKey={(row) => row.id}
          loading={loginHistory.loading}
          error={loginHistory.error}
          onRetry={loginHistory.onRetry}
          emptyLabel="Chưa có lần đăng nhập nào được ghi lại."
          pagination={loginHistory.pagination}
        />
      </TabsContent>

      <TabsContent value="academy" className="mt-4">
        <UserAcademyTab academy={profile.academy} />
      </TabsContent>
    </Tabs>
  )
}
