import { useCallback, useEffect, useState } from "react"
import { useParams, useSearchParams, Link } from "react-router"
import {
  ArrowLeft,
  Lock,
  Unlock,
  DollarSign,
  RotateCcw,
  Wallet,
  BarChart2,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/status-badge"
import { KpiCard } from "@/components/common/kpi-card"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { vtApi, type VTAccountRow, type VTAccountStats } from "@/lib/api/vt"
import { fmtVnd, fmtDateTime } from "@/lib/format"
import { PositionsTab } from "./tabs/positions-tab"
import { OrdersTab } from "./tabs/orders-tab"
import { TradesTab } from "./tabs/trades-tab"
import { LedgerTab } from "./tabs/ledger-tab"
import { SettlementsTab } from "./tabs/settlements-tab"

const TAB_OPTIONS = [
  { value: "positions", label: "Vị thế" },
  { value: "orders", label: "Lệnh" },
  { value: "trades", label: "Giao dịch" },
  { value: "ledger", label: "Sổ cái" },
  { value: "settlements", label: "Thanh toán T+N" },
]

export default function VTAccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = searchParams.get("tab") ?? "positions"

  const [account, setAccount] = useState<VTAccountRow | null>(null)
  const [stats, setStats] = useState<VTAccountStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action states
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [unfreezeOpen, setUnfreezeOpen] = useState(false)
  const [cashOpen, setCashOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [cashAmount, setCashAmount] = useState("")
  const [cashReason, setCashReason] = useState("")
  const [actionLoading, setActionLoading] = useState(false)

  const fetchAccount = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    setError(null)
    try {
      const [acct, s] = await Promise.all([
        vtApi.getAccount(accountId),
        vtApi.getStats(accountId),
      ])
      setAccount(acct)
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { void fetchAccount() }, [fetchAccount])

  if (!accountId) return <p className="text-destructive">Thiếu account ID</p>

  const handleFreeze = async (reason: string) => {
    setActionLoading(true)
    try {
      const updated = await vtApi.freeze(accountId, reason)
      setAccount(updated)
      toast.success("Đã khóa tài khoản")
      setFreezeOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Khóa thất bại")
      throw e
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnfreeze = async () => {
    setActionLoading(true)
    try {
      const updated = await vtApi.unfreeze(accountId)
      setAccount(updated)
      toast.success("Đã mở khóa tài khoản")
      setUnfreezeOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mở khóa thất bại")
    } finally {
      setActionLoading(false)
    }
  }

  const handleCashAdjust = async () => {
    const amount = Number(cashAmount)
    if (!cashAmount || isNaN(amount) || amount === 0) {
      toast.error("Số tiền không hợp lệ")
      return
    }
    if (!cashReason.trim()) {
      toast.error("Lý do bắt buộc")
      return
    }
    setActionLoading(true)
    try {
      const res = await vtApi.cashAdjust(accountId, amount, cashReason)
      setAccount(res.account)
      toast.success(`Điều chỉnh thành công. Số dư mới: ${fmtVnd(res.newCashAvailableVnd)}`)
      setCashOpen(false)
      setCashAmount("")
      setCashReason("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Điều chỉnh thất bại")
    } finally {
      setActionLoading(false)
    }
  }

  const handleReset = async () => {
    if (!account) return
    setActionLoading(true)
    try {
      await vtApi.reset(account.userId)
      toast.success("Đã reset tài khoản")
      setResetOpen(false)
      void fetchAccount()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset thất bại")
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/vt/accounts"
              className="inline-flex size-8 items-center justify-center rounded-lg border-transparent hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <h1 className="text-2xl font-bold">Chi tiết tài khoản giao dịch ảo</h1>
          </div>

          {loading ? (
            <div className="flex gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-24" />
            </div>
          ) : account ? (
            <div className="flex flex-wrap items-center gap-2 pl-10">
              <Link
                to={`/users/${account.userId}`}
                className="text-sm text-primary hover:underline"
              >
                {account.userEmail ?? account.userId}
              </Link>
              {account.userName && (
                <span className="text-sm text-muted-foreground">({account.userName})</span>
              )}
              <StatusBadge status={account.status} />
              {account.frozenAt && (
                <StatusBadge status="frozen" label="Đang bị khóa" variantMap={{ frozen: "amber" }} />
              )}
              {account.activatedAt && (
                <span className="text-xs text-muted-foreground">
                  Kích hoạt: {fmtDateTime(account.activatedAt)}
                </span>
              )}
            </div>
          ) : error ? (
            <p className="pl-10 text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        {/* Action menu */}
        {account && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline">Thao tác</Button>} />
            <DropdownMenuContent align="end">
              {!account.frozenAt ? (
                <DropdownMenuItem
                  onClick={() => setFreezeOpen(true)}
                  className="flex items-center gap-2 text-amber-700 focus:text-amber-700"
                >
                  <Lock className="size-3.5" />
                  Khóa tài khoản
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => setUnfreezeOpen(true)}
                  className="flex items-center gap-2 text-green-700 focus:text-green-700"
                >
                  <Unlock className="size-3.5" />
                  Mở khóa
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { setCashOpen(true); setCashAmount(""); setCashReason("") }}
                className="flex items-center gap-2"
              >
                <DollarSign className="size-3.5" />
                Điều chỉnh tiền
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setResetOpen(true)}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <RotateCcw className="size-3.5" />
                Reset tài khoản
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          label="Tiền khả dụng"
          value={account ? fmtVnd(account.cashAvailableVnd) : "—"}
          icon={Wallet}
          loading={loading}
        />
        <KpiCard
          label="Tiền đặt cọc"
          value={account ? fmtVnd(account.cashReservedVnd) : "—"}
          icon={Wallet}
          loading={loading}
        />
        <KpiCard
          label="Lệnh / Giao dịch"
          value={stats ? `${stats.totalOrders} / ${stats.totalTrades}` : "—"}
          icon={BarChart2}
          loading={loading}
        />
        <KpiCard
          label="PnL gần đúng"
          value={stats ? fmtVnd(stats.realizedPnlVnd) : "—"}
          icon={TrendingUp}
          loading={loading}
          subText="Tổng thu bán - tổng mua"
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set("tab", v)
            // Reset pagination on tab change
            next.delete("page")
            next.delete("pageSize")
            return next
          }, { replace: true })
        }}
      >
        <TabsList>
          {TAB_OPTIONS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="positions" className="pt-4">
          <PositionsTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="orders" className="pt-4">
          <OrdersTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="trades" className="pt-4">
          <TradesTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="ledger" className="pt-4">
          <LedgerTab accountId={accountId} />
        </TabsContent>

        <TabsContent value="settlements" className="pt-4">
          <SettlementsTab accountId={accountId} />
        </TabsContent>
      </Tabs>

      {/* Freeze dialog */}
      <ReasonDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        title="Khóa tài khoản"
        description={`Khóa tài khoản của ${account?.userEmail ?? account?.userId}?`}
        confirmLabel={actionLoading ? "Đang xử lý..." : "Khóa tài khoản"}
        destructive
        onConfirm={handleFreeze}
      />

      {/* Unfreeze dialog */}
      <ConfirmDialog
        open={unfreezeOpen}
        onOpenChange={setUnfreezeOpen}
        title="Mở khóa tài khoản"
        description={`Mở khóa tài khoản của ${account?.userEmail ?? account?.userId}?`}
        confirmLabel={actionLoading ? "Đang xử lý..." : "Mở khóa"}
        onConfirm={handleUnfreeze}
      />

      {/* Cash adjust dialog */}
      <Dialog
        open={cashOpen}
        onOpenChange={(open) => {
          if (!open) { setCashOpen(false); setCashAmount(""); setCashReason("") }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Điều chỉnh số dư tiền mặt</DialogTitle>
          </DialogHeader>
          {account && (
            <p className="text-sm text-muted-foreground">
              Số dư hiện tại: <strong>{fmtVnd(account.cashAvailableVnd)}</strong>
            </p>
          )}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Số tiền (+ hoặc -) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="Ví dụ: 500000 hoặc -100000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lý do <span className="text-destructive">*</span></Label>
              <Textarea
                value={cashReason}
                onChange={(e) => setCashReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashOpen(false)}>Hủy</Button>
            <Button onClick={() => { void handleCashAdjust() }} disabled={actionLoading}>
              {actionLoading ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset dialog */}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset tài khoản"
        description="Reset tài khoản? Toàn bộ lệnh, vị thế và lịch sử sẽ bị xóa."
        destructive
        confirmLabel={actionLoading ? "Đang xử lý..." : "Reset"}
        onConfirm={handleReset}
      />
    </div>
  )
}
