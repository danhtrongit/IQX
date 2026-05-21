import { useCallback, useEffect, useState } from "react"
import { useParams, Link } from "react-router"
import {
  ArrowLeft,
  RotateCcw,
  Mail,
  Shield,
} from "lucide-react"
import { toast } from "sonner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/status-badge"
import { CopyButton } from "@/components/common/copy-button"
import { ErrorState } from "@/components/common/error-state"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { api } from "@/lib/api/client"
import { usersApi, type User360, type LoginHistoryRow } from "@/lib/api/users"
import { plansApi, type PlanRow } from "@/lib/api/plans"
import { fmtVnd, fmtDate, fmtDateTime, fmtRelative } from "@/lib/format"

// ── Grant premium types ────────────────────────────────────────────────────

interface AdminGrantRequest {
  plan_id: string
  note?: string | null
}

async function grantPremium(userId: string, body: AdminGrantRequest) {
  return api.post(`premium/admin/users/${userId}/grant`, { json: body })
}

// ── Column defs ────────────────────────────────────────────────────────────

const loginHistoryColumns: ColumnDef<LoginHistoryRow>[] = [
  {
    accessorKey: "loginAt",
    header: "Thời gian",
    cell: ({ getValue }) => (
      <span className="text-sm">{fmtDateTime(getValue() as string)}</span>
    ),
  },
  {
    accessorKey: "success",
    header: "Kết quả",
    cell: ({ getValue }) => (
      <StatusBadge
        status={String(getValue())}
        label={getValue() ? "Thành công" : "Thất bại"}
      />
    ),
  },
  {
    accessorKey: "ip",
    header: "IP",
    cell: ({ getValue }) => (
      <span className="text-sm font-mono">{(getValue() as string | null) ?? "—"}</span>
    ),
  },
  {
    accessorKey: "failureReason",
    header: "Lý do thất bại",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {(getValue() as string | null) ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "userAgent",
    header: "User Agent",
    cell: ({ getValue }) => (
      <span className="max-w-64 truncate text-xs text-muted-foreground block">
        {(getValue() as string | null) ?? "—"}
      </span>
    ),
  },
]

// ── Main component ─────────────────────────────────────────────────────────

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const [data360, setData360] = useState<User360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset password
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // Grant premium sheet
  const [grantSheetOpen, setGrantSheetOpen] = useState(false)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [grantPlanId, setGrantPlanId] = useState("")
  const [grantNote, setGrantNote] = useState("")
  const [grantLoading, setGrantLoading] = useState(false)

  // Login history pagination
  const [loginPage, setLoginPage] = useState(0) // 0-indexed
  const [loginPageSize, setLoginPageSize] = useState(10)
  const [loginData, setLoginData] = useState<{
    items: LoginHistoryRow[]
    total: number
    totalPages: number
  } | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const fetch360 = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const d = await usersApi.get360(userId)
      setData360(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }, [userId])

  const fetchLoginHistory = useCallback(async () => {
    if (!userId) return
    setLoginLoading(true)
    try {
      const res = await usersApi.loginHistory(userId, {
        page: loginPage + 1,
        page_size: loginPageSize,
      })
      setLoginData({ items: res.items, total: res.total, totalPages: res.totalPages })
    } catch {
      // ignore
    } finally {
      setLoginLoading(false)
    }
  }, [userId, loginPage, loginPageSize])

  useEffect(() => { void fetch360() }, [fetch360])
  useEffect(() => { void fetchLoginHistory() }, [fetchLoginHistory])

  const handleResetPassword = async () => {
    if (!userId) return
    setResetLoading(true)
    try {
      const res = await usersApi.resetPassword(userId)
      setTempPassword(res.temporary_password)
      setResetDialogOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Đặt lại mật khẩu thất bại")
    } finally {
      setResetLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!userId) return
    try {
      await usersApi.resendVerification(userId)
      toast.success("Đã gửi lại email xác thực")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gửi thất bại")
    }
  }

  const handleOpenGrantSheet = async () => {
    setGrantSheetOpen(true)
    try {
      const p = await plansApi.list()
      setPlans(p.filter((x) => x.isActive))
    } catch {
      toast.error("Không thể tải danh sách gói")
    }
  }

  const handleGrant = async () => {
    if (!userId || !grantPlanId) return
    setGrantLoading(true)
    try {
      await grantPremium(userId, { plan_id: grantPlanId, note: grantNote || null })
      toast.success("Đã cấp Premium thành công")
      setGrantSheetOpen(false)
      setGrantPlanId("")
      setGrantNote("")
      void fetch360()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cấp Premium thất bại")
    } finally {
      setGrantLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data360) {
    return <ErrorState message={error ?? "Không tìm thấy người dùng"} onRetry={fetch360} />
  }

  const { user } = data360
  const displayName = user.fullName ?? `${user.firstName} ${user.lastName}`
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()

  const loginPagination: PaginationState = { pageIndex: loginPage, pageSize: loginPageSize }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        to="/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Quay lại danh sách
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge
                status={user.role}
                label={{ user: "User", premium: "Premium", admin: "Admin" }[user.role] ?? user.role}
                variantMap={{ premium: "blue", admin: "amber", user: "gray" }}
              />
              <StatusBadge status={user.status} />
              <span className="text-xs text-muted-foreground">
                Thành viên từ {fmtDate(user.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void handleResetPassword() }}
            disabled={resetLoading}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Đặt lại mật khẩu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void handleResendVerification() }}
            className="gap-1.5"
          >
            <Mail className="size-3.5" />
            Gửi lại xác thực
          </Button>
          <Button
            size="sm"
            onClick={() => { void handleOpenGrantSheet() }}
            className="gap-1.5"
          >
            <Shield className="size-3.5" />
            Cấp Premium thủ công
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
          <TabsTrigger value="premium">Premium</TabsTrigger>
          <TabsTrigger value="payments">Thanh toán</TabsTrigger>
          <TabsTrigger value="vt">Giao dịch ảo</TabsTrigger>
          <TabsTrigger value="login">Lịch sử đăng nhập</TabsTrigger>
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin cơ bản</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                <ProfileField label="ID" value={user.id} mono />
                <ProfileField label="Email" value={user.email} />
                <ProfileField label="Họ" value={user.firstName} />
                <ProfileField label="Tên" value={user.lastName} />
                <ProfileField label="Họ và tên" value={user.fullName ?? "—"} />
                <ProfileField label="SĐT" value={user.phoneNumber ?? "—"} />
                <ProfileField
                  label="Email xác thực"
                  value={user.isEmailVerified ? "Đã xác thực" : "Chưa xác thực"}
                />
                <ProfileField
                  label="Đăng nhập lần cuối"
                  value={user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : "—"}
                />
                <ProfileField label="Ngày tạo" value={fmtDateTime(user.createdAt)} />
                <ProfileField
                  label="Dùng trial"
                  value={data360.trialUsed ? "Đã dùng" : "Chưa dùng"}
                />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Premium tab */}
        <TabsContent value="premium" className="mt-4 space-y-4">
          {/* Current subscription */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thuê bao hiện tại</CardTitle>
            </CardHeader>
            <CardContent>
              {data360.subscription ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                  <ProfileField
                    label="Gói"
                    value={data360.subscription.plan?.name ?? "—"}
                  />
                  <ProfileField
                    label="Trạng thái"
                    value={data360.subscription.status}
                    badge
                  />
                  <ProfileField
                    label="Trial"
                    value={data360.subscription.isTrial ? "Có" : "Không"}
                  />
                  <ProfileField
                    label="Bắt đầu"
                    value={fmtDate(data360.subscription.currentPeriodStart)}
                  />
                  <ProfileField
                    label="Kết thúc"
                    value={fmtDate(data360.subscription.currentPeriodEnd)}
                  />
                  {data360.subscription.cancelledAt && (
                    <ProfileField
                      label="Hủy lúc"
                      value={fmtDate(data360.subscription.cancelledAt)}
                    />
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Không có thuê bao</p>
              )}
            </CardContent>
          </Card>

          {/* Subscription history */}
          {data360.subscriptionHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lịch sử thuê bao</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gói</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Bắt đầu</TableHead>
                      <TableHead>Kết thúc</TableHead>
                      <TableHead>Trial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data360.subscriptionHistory.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="text-sm">{sub.plan?.name ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={sub.status} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {fmtDate(sub.currentPeriodStart)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {fmtDate(sub.currentPeriodEnd)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sub.isTrial ? "Có" : "Không"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Payments tab */}
        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lịch sử thanh toán</CardTitle>
            </CardHeader>
            <CardContent>
              {data360.paymentHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có giao dịch</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hóa đơn</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Gói</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Thanh toán lúc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data360.paymentHistory.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm font-mono">
                          <Link
                            to={`/payments/${p.id}`}
                            className="hover:underline text-primary"
                          >
                            {p.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {fmtVnd(p.amountVnd)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.planCode ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.grantType ?? "payment"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.paidAt ? fmtDateTime(p.paidAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VT tab */}
        <TabsContent value="vt" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tài khoản giao dịch ảo</CardTitle>
            </CardHeader>
            <CardContent>
              {data360.vtAccount ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                  <ProfileField label="ID" value={data360.vtAccount.id} mono />
                  <ProfileField
                    label="Trạng thái"
                    value={data360.vtAccount.status}
                    badge
                  />
                  <ProfileField
                    label="Cash ban đầu"
                    value={fmtVnd(data360.vtAccount.initialCashVnd)}
                  />
                  <ProfileField
                    label="Cash khả dụng"
                    value={fmtVnd(data360.vtAccount.cashAvailableVnd)}
                  />
                  <ProfileField
                    label="Cash reserved"
                    value={fmtVnd(data360.vtAccount.cashReservedVnd)}
                  />
                  <ProfileField
                    label="Cash đang chờ"
                    value={fmtVnd(data360.vtAccount.cashPendingVnd)}
                  />
                  {data360.vtAccount.activatedAt && (
                    <ProfileField
                      label="Kích hoạt lúc"
                      value={fmtDate(data360.vtAccount.activatedAt)}
                    />
                  )}
                  {data360.vtAccount.frozenAt && (
                    <ProfileField
                      label="Đóng băng lúc"
                      value={fmtDate(data360.vtAccount.frozenAt)}
                    />
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có tài khoản VT</p>
              )}
            </CardContent>
          </Card>

          {data360.vtRecentOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lệnh gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã CK</TableHead>
                      <TableHead>Chiều</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Giá</TableHead>
                      <TableHead>Tạo lúc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data360.vtRecentOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-sm font-semibold">{o.symbol}</TableCell>
                        <TableCell>
                          <StatusBadge
                            status={o.side.toLowerCase()}
                            label={o.side}
                            variantMap={{ buy: "green", sell: "red" }}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-sm">{o.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-sm">
                          {o.priceVnd != null ? fmtVnd(o.priceVnd) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {fmtRelative(o.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Login history tab */}
        <TabsContent value="login" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lịch sử đăng nhập</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DataTable
                columns={loginHistoryColumns}
                data={loginData?.items ?? []}
                pageCount={loginData?.totalPages ?? 1}
                pagination={loginPagination}
                onPaginationChange={(updater) => {
                  const next =
                    typeof updater === "function"
                      ? updater(loginPagination)
                      : updater
                  setLoginPage(next.pageIndex)
                  setLoginPageSize(next.pageSize)
                }}
                loading={loginLoading}
                emptyMessage="Chưa có lịch sử đăng nhập"
              />
              <DataTablePagination
                pagination={loginPagination}
                pageCount={loginData?.totalPages ?? 1}
                onPaginationChange={(updater) => {
                  const next =
                    typeof updater === "function"
                      ? updater(loginPagination)
                      : updater
                  setLoginPage(next.pageIndex)
                  setLoginPageSize(next.pageSize)
                }}
                total={loginData?.total}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reset password dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mật khẩu tạm thời</DialogTitle>
          </DialogHeader>
          {tempPassword && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <code className="flex-1 break-all font-mono text-sm">{tempPassword}</code>
                <CopyButton text={tempPassword} />
              </div>
              <p className="text-xs text-amber-600">
                Hãy chia sẻ mật khẩu này một cách an toàn. Mật khẩu sẽ không được gửi qua email.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Grant premium sheet */}
      <Sheet open={grantSheetOpen} onOpenChange={setGrantSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Cấp Premium thủ công</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Gói Premium</Label>
              <Select value={grantPlanId} onValueChange={(v) => setGrantPlanId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn gói..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {fmtVnd(p.priceVnd)} / {p.durationDays} ngày
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ghi chú (tuỳ chọn)</Label>
              <Textarea
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="Lý do cấp premium..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => { void handleGrant() }}
                disabled={!grantPlanId || grantLoading}
              >
                {grantLoading ? "Đang cấp..." : "Cấp Premium"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setGrantSheetOpen(false)}
              >
                Hủy
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  )
}

// ── Helper component ───────────────────────────────────────────────────────

function ProfileField({
  label,
  value,
  mono = false,
  badge = false,
}: {
  label: string
  value: string
  mono?: boolean
  badge?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        {badge ? (
          <StatusBadge status={value} />
        ) : (
          <span className={`text-sm ${mono ? "font-mono break-all" : ""}`}>{value}</span>
        )}
      </dd>
    </div>
  )
}
