/**
 * `/admin/vt/accounts/:accountId` — hồ sơ 360 của một tài khoản giao dịch ảo.
 *
 * Phần đầu trang nói rõ nguồn và chế độ tài khoản: đây là tài khoản **Sân tập**
 * (tiền ảo VND) đọc từ `/api/v2/admin/vt/accounts/{id}`; trạng thái, thời điểm
 * khoá và lý do khoá lấy nguyên từ backend. Các con số tiền mặt là ba hũ thật của
 * backend (khả dụng / giữ cho lệnh mua / chờ tất toán), không suy diễn thêm.
 *
 * Năm tab dữ liệu nằm ở `components/account-tabs.tsx`; các thao tác ghi (khoá,
 * mở khoá, điều chỉnh tiền, đặt lại) nằm ở `components/account-actions.tsx`.
 */
import { useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError, errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { AccountActions } from "./components/account-actions"
import { LedgerTab, OrdersTab, PositionsTab, SettlementsTab, TradesTab } from "./components/account-tabs"
import { DetailList, DetailRow, ErrorLine, HintLine, StatTile, StatusBadge } from "./components/ui"
import { useVtAccount, useVtAccountStats } from "./hooks"
import { ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_TONE } from "./labels"

const TABS = [
  { value: "positions", label: "Vị thế" },
  { value: "orders", label: "Lệnh" },
  { value: "trades", label: "Giao dịch" },
  { value: "ledger", label: "Sổ cái" },
  { value: "settlements", label: "T+N" },
] as const

export function VTAccountDetailPage() {
  const { accountId = "" } = useParams()
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("positions")
  const account = useVtAccount(accountId)
  const stats = useVtAccountStats(accountId)

  const notFound = account.error instanceof ApiError && account.error.status === 404
  const accountRef = account.data ? account.data.userId : accountId

  return (
    <WorkspacePage
      title="Chi tiết tài khoản giao dịch ảo"
      description={
        account.data
          ? `Tài khoản Sân tập (tiền ảo VND) của người dùng ${accountRef} · dữ liệu từ /api/v2/admin/vt/accounts/${accountId}`
          : "Tài khoản Sân tập (tiền ảo VND) — nguồn: /api/v2/admin/vt/accounts"
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/vt/accounts">
              <ArrowLeft />
              Danh sách
            </Link>
          </Button>
          {account.data && <AccountActions account={account.data} />}
        </>
      }
    >
      {!accountId && <ErrorLine text="Thiếu mã tài khoản trên đường dẫn." />}

      {account.isLoading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-[86px] w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
        </>
      )}

      {account.isError && (
        <Card className="gap-3 p-4">
          <ErrorLine
            text={
              notFound
                ? "Không tìm thấy tài khoản giao dịch ảo này (có thể đã bị xoá hoặc mã sai)."
                : errorMessage(account.error)
            }
            onRetry={() => void account.refetch()}
          />
          <HintLine>
            Mã tài khoản: <span className="font-mono">{accountId}</span>
          </HintLine>
        </Card>
      )}

      {account.data && (
        <>
          <Card className="gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={ACCOUNT_STATUS_LABEL[account.data.status] ?? account.data.status}
                tone={ACCOUNT_STATUS_TONE[account.data.status] ?? ""}
              />
              {account.data.frozenAt && (
                <StatusBadge label="Đang bị khoá" tone="border-destructive/40 text-destructive" />
              )}
              <span className="text-xs text-muted-foreground">
                {account.data.frozenAt
                  ? "Người dùng không đặt được lệnh cho tới khi mở khoá."
                  : "Người dùng đặt lệnh bình thường nếu cấu hình cho phép giao dịch."}
              </span>
            </div>
            <DetailList>
              <DetailRow label="Người dùng">
                <Link to={`/admin/users/${account.data.userId}`} className="text-primary hover:underline">
                  Xem hồ sơ người dùng
                </Link>
                <HintLine className="mt-0.5">
                  Payload 360 chỉ trả mã người dùng, không kèm email/tên — mở hồ sơ để xem.
                </HintLine>
              </DetailRow>
              <DetailRow label="Mã người dùng">
                <span className="font-mono text-xs">{account.data.userId}</span>
              </DetailRow>
              <DetailRow label="Mã tài khoản">
                <span className="font-mono text-xs">{account.data.id}</span>
              </DetailRow>
              <DetailRow label="Kích hoạt">{account.data.activatedAt ? formatDateTime(account.data.activatedAt) : "—"}</DetailRow>
              <DetailRow label="Tạo lúc">{account.data.createdAt ? formatDateTime(account.data.createdAt) : "—"}</DetailRow>
              <DetailRow label="Khoá lúc">{account.data.frozenAt ? formatDateTime(account.data.frozenAt) : "—"}</DetailRow>
              <DetailRow label="Khoá bởi (admin)">
                {account.data.frozenByUserId ? (
                  <span className="font-mono text-xs">{account.data.frozenByUserId}</span>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="Lý do khoá">{account.data.freezeReason ?? "—"}</DetailRow>
            </DetailList>
          </Card>

          <div className="space-y-2">
            <h2 className="font-heading text-sm font-semibold">Tiền mặt (VND)</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Khả dụng"
                value={formatMoney(account.data.cashAvailableVnd)}
                hint="Dùng được ngay cho lệnh mới."
              />
              <StatTile
                label="Đang giữ"
                value={formatMoney(account.data.cashReservedVnd)}
                hint="Bị khoá bởi lệnh mua đang chờ."
              />
              <StatTile
                label="Đang chờ"
                value={formatMoney(account.data.cashPendingVnd)}
                hint="Chờ tất toán T+N."
              />
              <StatTile
                label="Vốn ban đầu"
                value={formatMoney(account.data.initialCashVnd)}
                hint="Mốc cấu hình tại thời điểm kích hoạt/đặt lại."
              />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-heading text-sm font-semibold">Hoạt động</h2>
            {stats.isError && <ErrorLine text={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />}
            {stats.isLoading && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <Skeleton key={key} className="h-[86px] w-full" />
                ))}
              </div>
            )}
            {stats.data && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <StatTile
                    label="Tổng lệnh"
                    value={formatNumber(stats.data.totalOrders)}
                    hint={`${formatNumber(stats.data.totalTrades)} giao dịch đã khớp`}
                  />
                  <StatTile
                    label="Tiền mua ròng"
                    value={formatMoney(stats.data.grossBuyVnd)}
                    hint="Tổng |net| của các giao dịch MUA (đã gồm phí)."
                  />
                  <StatTile
                    label="Tiền bán ròng"
                    value={formatMoney(stats.data.grossSellVnd)}
                    hint="Tổng net của các giao dịch BÁN (sau phí và thuế)."
                  />
                  <StatTile
                    label="PnL thực hiện (≈)"
                    value={formatMoney(stats.data.realizedPnlVnd)}
                    tone={stats.data.realizedPnlVnd > 0 ? "up" : stats.data.realizedPnlVnd < 0 ? "down" : "neutral"}
                    hint="Backend xấp xỉ = tiền bán ròng − tiền mua ròng."
                  />
                  <StatTile
                    label="Giá trị khớp"
                    value={formatMoney(stats.data.turnoverVnd)}
                    hint="Tiền mua ròng + tiền bán ròng."
                  />
                  <StatTile
                    label="Tỷ lệ thắng"
                    value={stats.data.winRate === null ? "—" : formatPercent(stats.data.winRate)}
                    hint="Backend chưa trả về chỉ số này (cần theo dõi giá vốn từng mã)."
                  />
                </div>
                <HintLine>
                  PnL ở đây là con số xấp xỉ của backend dựa trên dòng tiền ròng, không phải lãi/lỗ theo giá vốn từng
                  mã; dùng để đối chiếu nhanh, không dùng để kết luận hiệu quả đầu tư.
                </HintLine>
              </>
            )}
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as (typeof TABS)[number]["value"])}>
            <TabsList variant="line" className="h-9 w-full justify-start overflow-x-auto">
              {TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="px-3">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tab === "positions" && (
              <TabsContent value="positions">
                <PositionsTab accountId={accountId} />
              </TabsContent>
            )}
            {tab === "orders" && (
              <TabsContent value="orders">
                <OrdersTab accountId={accountId} />
              </TabsContent>
            )}
            {tab === "trades" && (
              <TabsContent value="trades">
                <TradesTab accountId={accountId} />
              </TabsContent>
            )}
            {tab === "ledger" && (
              <TabsContent value="ledger">
                <LedgerTab accountId={accountId} />
              </TabsContent>
            )}
            {tab === "settlements" && (
              <TabsContent value="settlements">
                <SettlementsTab accountId={accountId} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </WorkspacePage>
  )
}
