/**
 * `/admin/vt/config` — cấu hình giao dịch ảo đang hoạt động.
 *
 * Mọi trường backend cho sửa đều có mặt ở đây, kèm đúng ràng buộc của DTO
 * (`ConfigUpdateDto`): `initial_cash_vnd` ≥ 1, ba loại phí/thuế 0–1000 bps,
 * `settlement_mode` ∈ {T0, T2}, `board_lot_size` ≥ 1, `trading_enabled` boolean,
 * `holidays` là danh sách chuỗi `YYYY-MM-DD`.
 *
 * - Chỉ gửi các trường **thực sự đổi** (PATCH của backend dùng
 *   `exclude_unset`, nên trường không gửi sẽ không vào audit).
 * - Ngày nghỉ được nhập bằng ô chọn ngày để luôn đúng định dạng mà lịch giao dịch
 *   đọc; chuỗi sai định dạng bị engine bỏ qua im lặng nên UI không cho tạo.
 * - Hệ quả của từng trường được ghi ngay dưới ô nhập; lỗi từ server hiện nguyên
 *   văn phía trên nút lưu.
 */
import { useMemo, useState } from "react"
import { CalendarPlus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format"
import type { VtConfig, VtConfigPatch, VtSettlementMode } from "./api"
import { ErrorLine, FormField, HintLine, StatusBadge, TableNoticeRow } from "./components/ui"
import { formatDateOnly } from "./format"
import { useUpdateVtConfig, useVtConfig } from "./hooks"
import { SETTLEMENT_MODE_OPTIONS } from "./labels"
import { useConfirmDialog } from "../core/components/use-confirm-dialog"

interface ConfigForm {
  initialCash: string
  buyFeeBps: string
  sellFeeBps: string
  sellTaxBps: string
  boardLotSize: string
  settlementMode: VtSettlementMode
  tradingEnabled: boolean
  holidays: string[]
}

const MAX_BPS = 1000

function toForm(config: VtConfig): ConfigForm {
  return {
    initialCash: String(config.initialCashVnd),
    buyFeeBps: String(config.buyFeeRateBps),
    sellFeeBps: String(config.sellFeeRateBps),
    sellTaxBps: String(config.sellTaxRateBps),
    boardLotSize: String(config.boardLotSize),
    settlementMode: config.settlementMode,
    tradingEnabled: config.tradingEnabled,
    holidays: [...config.holidays].sort(),
  }
}

function digitsOf(value: string): string {
  return value.replace(/[^\d]/g, "")
}

/** `null` khi hợp lệ; ngược lại là thông báo lỗi hiển thị dưới ô nhập. */
function integerError(value: string, min: number, max?: number): string | null {
  if (digitsOf(value).length === 0) return "Không được để trống."
  const parsed = Number(digitsOf(value))
  if (!Number.isSafeInteger(parsed)) return "Giá trị quá lớn."
  if (parsed < min) return `Phải ≥ ${min}.`
  if (max !== undefined && parsed > max) return `Phải ≤ ${max}.`
  return null
}

export function VTConfigPage() {
  const config = useVtConfig()
  const update = useUpdateVtConfig()
  const confirm = useConfirmDialog()
  const [form, setForm] = useState<ConfigForm | null>(null)
  const [loadedConfig, setLoadedConfig] = useState<VtConfig>()
  const [newHoliday, setNewHoliday] = useState("")

  if (config.data && config.data !== loadedConfig) {
    setLoadedConfig(config.data)
    setForm(toForm(config.data))
  }

  const errors = useMemo(() => {
    if (!form) return null
    return {
      initialCash: integerError(form.initialCash, 1),
      buyFee: integerError(form.buyFeeBps, 0, MAX_BPS),
      sellFee: integerError(form.sellFeeBps, 0, MAX_BPS),
      sellTax: integerError(form.sellTaxBps, 0, MAX_BPS),
      boardLot: integerError(form.boardLotSize, 1),
    }
  }, [form])

  const patch = useMemo<VtConfigPatch | null>(() => {
    if (!form || !config.data) return null
    const next: VtConfigPatch = {}
    if (Number(form.initialCash) !== config.data.initialCashVnd) next.initialCashVnd = Number(form.initialCash)
    if (Number(form.buyFeeBps) !== config.data.buyFeeRateBps) next.buyFeeRateBps = Number(form.buyFeeBps)
    if (Number(form.sellFeeBps) !== config.data.sellFeeRateBps) next.sellFeeRateBps = Number(form.sellFeeBps)
    if (Number(form.sellTaxBps) !== config.data.sellTaxRateBps) next.sellTaxRateBps = Number(form.sellTaxBps)
    if (Number(form.boardLotSize) !== config.data.boardLotSize) next.boardLotSize = Number(form.boardLotSize)
    if (form.settlementMode !== config.data.settlementMode) next.settlementMode = form.settlementMode
    if (form.tradingEnabled !== config.data.tradingEnabled) next.tradingEnabled = form.tradingEnabled
    if (form.holidays.join(",") !== [...config.data.holidays].sort().join(",")) next.holidays = form.holidays
    return next
  }, [config.data, form])

  const changed = patch ? Object.keys(patch).length : 0
  const hasError = errors !== null && Object.values(errors).some((value) => value !== null)

  const openHolidays = form?.holidays ?? []

  const save = () => {
    if (!patch || changed === 0 || hasError) return
    confirm.ask({
      title: "Lưu cấu hình giao dịch ảo?",
      description: "Các thay đổi có hiệu lực ngay cho tài khoản và lệnh mới.",
      confirmLabel: "Lưu cấu hình",
      body: (
        <p className="text-sm text-muted-foreground">
          Bạn sắp cập nhật <span className="font-medium text-foreground">{changed} trường</span>. Thao tác được ghi vào
          nhật ký kiểm toán.
        </p>
      ),
      run: async () => {
        const saved = await update.mutateAsync(patch)
        toast.success("Đã lưu cấu hình giao dịch ảo", {
          description: `${changed} trường được cập nhật · hiệu lực ngay cho lệnh mới. Cập nhật lúc ${formatDateTime(saved.updatedAt)}.`,
        })
      },
    })
  }

  return (
    <WorkspacePage
      title="Cấu hình giao dịch ảo"
      description="Cấu hình đang hoạt động cho toàn bộ tài khoản Sân tập: vốn ban đầu, phí/thuế, chế độ tất toán, lô giao dịch, ngày nghỉ và công tắc cho phép giao dịch. Nguồn: /api/v2/virtual-trading/admin/config."
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!config.data || changed === 0}
            onClick={() => config.data && setForm(toForm(config.data))}
          >
            <RotateCcw />
            Hoàn tác
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!patch || changed === 0 || hasError}
            onClick={save}
          >
            {update.isPending ? "Đang lưu…" : changed > 0 ? `Lưu ${changed} thay đổi` : "Lưu"}
          </Button>
        </>
      }
    >
      {config.isError && <ErrorLine text={errorMessage(config.error)} onRetry={() => void config.refetch()} />}
      {update.isError && <ErrorLine text={errorMessage(update.error)} />}
      {confirm.element}

      {config.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 w-full" />
          ))}
        </div>
      )}

      {config.data && form && (
        <>
          <Card className="gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={form.tradingEnabled ? "Đang cho phép giao dịch" : "Đang tạm dừng giao dịch"}
                tone={form.tradingEnabled ? "border-price-up/40 text-price-up" : "border-destructive/40 text-destructive"}
              />
              <StatusBadge
                label={`Tất toán ${form.settlementMode}`}
                tone="border-accent/60 text-accent-foreground"
              />
              {changed > 0 && <StatusBadge label={`${changed} thay đổi chưa lưu`} tone="border-border text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">
                Cập nhật lần cuối {formatDateTime(config.data.updatedAt)} · tạo lúc {formatDateTime(config.data.createdAt)}
              </span>
            </div>
            <DetailMeta config={config.data} />
          </Card>

          <Card className="gap-4 p-4">
            <h2 className="font-heading text-sm font-semibold">Vốn và chi phí</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                label="Vốn ban đầu (VND)"
                hint={`Ràng buộc: số nguyên ≥ 1. Hiện tại ${formatMoney(config.data.initialCashVnd)}. Áp dụng khi kích hoạt tài khoản mới và khi đặt lại tài khoản.`}
                error={errors?.initialCash}
              >
                <Input
                  value={form.initialCash}
                  onChange={(event) => setForm({ ...form, initialCash: digitsOf(event.target.value).slice(0, 15) })}
                  inputMode="numeric"
                  aria-label="Vốn ban đầu (VND)"
                />
              </FormField>
              <FormField
                label="Phí mua (bps)"
                hint={`Ràng buộc: 0–1000 bps. Hiện tại ${formatPercent(config.data.buyFeeRateBps / 100)}.`}
                error={errors?.buyFee}
              >
                <Input
                  value={form.buyFeeBps}
                  onChange={(event) => setForm({ ...form, buyFeeBps: digitsOf(event.target.value).slice(0, 4) })}
                  inputMode="numeric"
                  aria-label="Phí mua (bps)"
                />
              </FormField>
              <FormField
                label="Phí bán (bps)"
                hint={`Ràng buộc: 0–1000 bps. Hiện tại ${formatPercent(config.data.sellFeeRateBps / 100)}.`}
                error={errors?.sellFee}
              >
                <Input
                  value={form.sellFeeBps}
                  onChange={(event) => setForm({ ...form, sellFeeBps: digitsOf(event.target.value).slice(0, 4) })}
                  inputMode="numeric"
                  aria-label="Phí bán (bps)"
                />
              </FormField>
              <FormField
                label="Thuế bán (bps)"
                hint={`Ràng buộc: 0–1000 bps. Hiện tại ${formatPercent(config.data.sellTaxRateBps / 100)}.`}
                error={errors?.sellTax}
              >
                <Input
                  value={form.sellTaxBps}
                  onChange={(event) => setForm({ ...form, sellTaxBps: digitsOf(event.target.value).slice(0, 4) })}
                  inputMode="numeric"
                  aria-label="Thuế bán (bps)"
                />
              </FormField>
            </div>
            <HintLine>
              1 bps = 0,01%. Phí và thuế được backend chốt theo cấu hình tại thời điểm khớp lệnh; lệnh đang chờ giữ mức
              đã chốt khi đặt.
            </HintLine>
          </Card>

          <Card className="gap-4 p-4">
            <h2 className="font-heading text-sm font-semibold">Quy tắc giao dịch</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <FormField
                label="Chế độ tất toán"
                hint={
                  SETTLEMENT_MODE_OPTIONS.find((option) => option.value === form.settlementMode)?.hint ??
                  "T0 hoặc T2."
                }
              >
                <Select
                  value={form.settlementMode}
                  onValueChange={(value) => setForm({ ...form, settlementMode: value as VtSettlementMode })}
                >
                  <SelectTrigger size="default" className="w-full text-sm" aria-label="Chế độ tất toán">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Lô giao dịch (cổ phiếu)"
                hint={`Ràng buộc: số nguyên ≥ 1. Hiện tại ${form.boardLotSize || config.data.boardLotSize}. Khối lượng mỗi lệnh phải là bội số của lô.`}
                error={errors?.boardLot}
              >
                <Input
                  value={form.boardLotSize}
                  onChange={(event) => setForm({ ...form, boardLotSize: digitsOf(event.target.value).slice(0, 7) })}
                  inputMode="numeric"
                  aria-label="Lô giao dịch"
                />
              </FormField>
              <FormField
                label="Cho phép giao dịch"
                hint="Tắt công tắc này khiến mọi lệnh mới và việc kích hoạt tài khoản bị backend từ chối (403) cho tới khi bật lại."
              >
                <div className="flex h-8 items-center gap-2">
                  <Switch
                    checked={form.tradingEnabled}
                    onCheckedChange={(checked) => setForm({ ...form, tradingEnabled: checked })}
                    aria-label="Cho phép giao dịch"
                  />
                  <span className="text-xs text-muted-foreground">
                    {form.tradingEnabled ? "Đang bật" : "Đang tắt — người dùng không đặt được lệnh"}
                  </span>
                </div>
              </FormField>
            </div>
            <HintLine>
              Chế độ tất toán T0/T2 chỉ áp cho lệnh ở chế độ thực chiến; các chế độ luyện tập luôn tất toán T0 theo thiết
              kế của backend.
            </HintLine>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <h2 className="font-heading text-sm font-semibold">
                Ngày nghỉ ({openHolidays.length}) — dùng cho lịch giao dịch
              </h2>
              <div className="flex items-end gap-2">
                <DatePicker
                  id="vt-new-holiday"
                  value={newHoliday}
                  onChange={setNewHoliday}
                  className="h-8 w-40"
                  aria-label="Ngày nghỉ cần thêm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!newHoliday || openHolidays.includes(newHoliday)}
                  onClick={() => {
                    setForm({ ...form, holidays: [...openHolidays, newHoliday].sort() })
                    setNewHoliday("")
                  }}
                >
                  <CalendarPlus />
                  Thêm
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày nghỉ</TableHead>
                  <TableHead>Thứ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {openHolidays.length === 0 && (
                  <TableNoticeRow colSpan={3}>
                    Chưa cấu hình ngày nghỉ nào — lịch giao dịch chỉ loại trừ thứ Bảy và Chủ nhật.
                  </TableNoticeRow>
                )}
                {openHolidays.map((holiday) => (
                  <TableRow key={holiday}>
                    <TableCell className="tabular-nums">
                      {/^\d{4}-\d{2}-\d{2}$/.test(holiday) ? (
                        formatDateOnly(holiday)
                      ) : (
                        <span className="font-mono text-destructive" title="Giá trị sai định dạng — lịch giao dịch bỏ qua">
                          {holiday} (sai định dạng)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{weekdayLabel(holiday)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Xoá ngày nghỉ ${holiday}`}
                        onClick={() => setForm({ ...form, holidays: openHolidays.filter((item) => item !== holiday) })}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <HintLine className="px-3 py-2">
              Ngày nghỉ được lưu dưới dạng chuỗi <span className="font-mono">YYYY-MM-DD</span>. Lịch giao dịch của
              backend chỉ đọc đúng định dạng này; giá trị khác định dạng bị bỏ qua im lặng nên ô chọn ngày là cách nhập
              duy nhất ở đây. Ngày nghỉ ảnh hưởng tới ngày giao dịch, hạn tất toán T+2 và giá tham chiếu.
            </HintLine>
          </Card>
        </>
      )}
    </WorkspacePage>
  )
}

/** Thông tin chỉ đọc của bản ghi cấu hình (id, mốc thời gian). */
function DetailMeta({ config }: { config: VtConfig }) {
  return (
    <div className="grid gap-3 text-xs sm:grid-cols-3">
      <div>
        <p className="text-muted-foreground">Mã cấu hình</p>
        <p className="mt-0.5 font-mono">{config.id}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Tạo lúc</p>
        <p className="mt-0.5">{formatDateTime(config.createdAt)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Cập nhật lúc</p>
        <p className="mt-0.5">{formatDateTime(config.updatedAt)}</p>
      </div>
    </div>
  )
}

const WEEKDAY_LABEL = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"]

/** Thứ trong tuần của một ngày `YYYY-MM-DD` (đọc theo UTC để không lệch ngày). */
function weekdayLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return "—"
  return WEEKDAY_LABEL[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "—"
}
