/**
 * Hộp chỉ báo của Flashback v2 (spec v2 §6.4), kiểu TradingView.
 *
 * - "Các chỉ báo": ô tìm kiếm và danh sách ĐỦ 16 CHỈ BÁO cho mọi người, không phụ thuộc tiến độ
 *   Học viện; bấm một chỉ báo sẽ thêm một instance mới với tham số mặc định rồi đóng hộp. Có thể
 *   thêm nhiều lần cùng một chỉ báo.
 * - "Cài đặt": tiêu đề là tên chỉ báo, tab "Đầu vào" liệt kê tham số với miền cho phép ngay
 *   dưới ô nhập; cuối hộp có "Mặc định" bên trái, "Hủy" và "OK" bên phải. Giá trị sai ràng buộc
 *   bị báo trong hộp và KHÔNG lưu.
 */
import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FlashbackIndicatorMeta, FlashbackIndicatorParams } from "./flashback-api"
import { defaultParams, validateParams } from "./flashback-indicators"

const rangeBoundFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

function formatRangeBound(value: number): string {
  return Number.isFinite(value) ? rangeBoundFormat.format(value) : "—"
}

/** "5 đến 200": miền cho phép của một ô nhập, không dùng dấu gạch. */
function formatRange(min: number, max: number): string {
  return `${formatRangeBound(min)} đến ${formatRangeBound(max)}`
}

/** Mô tả ngắn của từng chỉ báo, hiện bên phải tên trong hộp chọn. */
const INDICATOR_DESCRIPTIONS: Record<string, string> = {
  volume: "Ngưỡng khối lượng",
  ma: "Đường trung bình (SMA)",
  rsi: "Chỉ số sức mạnh tương đối",
  macd: "Trung bình động hội tụ phân kỳ",
  bollinger: "Dải Bollinger",
  ema: "Đường trung bình hàm mũ",
  ma_cross: "Giao cắt hai đường SMA",
  dmi: "Chỉ báo định hướng (+DI, −DI)",
  donchian: "Kênh giá Donchian",
  stochastic: "Dao động ngẫu nhiên (%K, %D)",
  cci: "Chỉ số kênh hàng hóa",
  roc: "Tốc độ thay đổi giá (%)",
  williams_r: "Williams %R",
  obv: "Khối lượng cân bằng",
  mfi: "Chỉ số dòng tiền",
  cmf: "Dòng tiền Chaikin",
}

export function IndicatorPicker({
  open,
  onOpenChange,
  indicators,
  loading,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  indicators: readonly FlashbackIndicatorMeta[]
  loading: boolean
  onPick: (indicator: FlashbackIndicatorMeta) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return indicators
    return indicators.filter((indicator) =>
      `${indicator.name} ${indicator.id} ${INDICATOR_DESCRIPTIONS[indicator.id] ?? ""}`.toLowerCase().includes(needle),
    )
  }, [indicators, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[480px]"
        data-testid="indicator-picker"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle className="text-base font-bold">Các chỉ báo</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Danh sách 16 chỉ báo. Chọn một chỉ báo để thêm vào biểu đồ.
        </DialogDescription>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm kiếm"
              aria-label="Tìm kiếm chỉ báo"
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[min(460px,60vh)] overflow-auto px-2 py-2">
          {loading ? (
            <div className="space-y-2 px-2 py-2" role="status" aria-label="Đang tải chỉ báo">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : indicators.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-foreground">Chưa tải được danh sách chỉ báo</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-foreground">Không có chỉ báo phù hợp</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {filtered.map((indicator) => (
                <li key={indicator.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-semibold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                    onClick={() => onPick(indicator)}
                  >
                    <span className="h-0.5 w-4 shrink-0 rounded-full bg-chart-1" aria-hidden="true" />
                    <span className="truncate">{indicator.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-normal text-text-secondary">
                      {INDICATOR_DESCRIPTIONS[indicator.id] ?? ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function IndicatorSettings({
  open,
  onOpenChange,
  indicator,
  instanceKey,
  initialParams,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  indicator: FlashbackIndicatorMeta | null
  instanceKey?: string | null
  initialParams?: FlashbackIndicatorParams
  onSave: (params: FlashbackIndicatorParams) => void
}) {
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // Mở hộp cho một instance hoặc chỉ báo khác thì nạp tham số hiện tại (hoặc mặc định) của nó.
  const targetKey = instanceKey ?? indicator?.id ?? null
  if (open && indicator && openedFor !== targetKey) {
    setOpenedFor(targetKey)
    setRaw(rawOf(initialParams ?? defaultParams(indicator)))
    setError(null)
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  if (!indicator) return null
  const meta = indicator

  const setField = (key: string, value: string) => {
    setRaw((previous) => ({ ...previous, [key]: value }))
    setError(null)
  }

  function save() {
    const values = valuesOf(raw)
    const problem = validateParams(meta, values)
    if (problem) {
      setError(problem)
      return
    }
    onSave(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
        data-testid="indicator-settings"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            save()
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle className="text-base font-bold">{indicator.name}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Thiết lập tham số của chỉ báo {indicator.name}.
        </DialogDescription>

        <Tabs defaultValue="inputs" className="gap-0">
          <div className="border-b border-border px-4">
            <TabsList aria-label="Thiết lập chỉ báo" className="h-9">
              <TabsTrigger value="inputs" className="px-3 text-xs">Đầu vào</TabsTrigger>
            </TabsList>
          </div>

          <div className="space-y-3 px-4 py-4">
            {indicator.params.map((param) => {
              if (param.lower && param.upper) {
                return (
                  <div key={param.key} className="space-y-1">
                    <div className="grid grid-cols-[1fr_110px] items-center gap-x-3">
                      <Label htmlFor={`${param.key}-lower`} className="text-sm font-semibold">
                        {param.lower.label || "Ngưỡng dưới"}
                      </Label>
                      <Input
                        id={`${param.key}-lower`}
                        type="number"
                        inputMode="numeric"
                        step={param.step}
                        min={param.lower.min}
                        max={param.lower.max}
                        value={raw[`${param.key}.lower`] ?? ""}
                        onChange={(event) => setField(`${param.key}.lower`, event.target.value)}
                        className="text-right tabular-nums"
                      />
                    </div>
                    <p className="text-right text-[11px] text-text-secondary">
                      {formatRange(param.lower.min, param.lower.max)}
                    </p>
                    <div className="grid grid-cols-[1fr_110px] items-center gap-x-3">
                      <Label htmlFor={`${param.key}-upper`} className="text-sm font-semibold">
                        {param.upper.label || "Ngưỡng trên"}
                      </Label>
                      <Input
                        id={`${param.key}-upper`}
                        type="number"
                        inputMode="numeric"
                        step={param.step}
                        min={param.upper.min}
                        max={param.upper.max}
                        value={raw[`${param.key}.upper`] ?? ""}
                        onChange={(event) => setField(`${param.key}.upper`, event.target.value)}
                        className="text-right tabular-nums"
                      />
                    </div>
                    <p className="text-right text-[11px] text-text-secondary">
                      {formatRange(param.upper.min, param.upper.max)}
                    </p>
                  </div>
                )
              }
              return (
                <div key={param.key} className="space-y-1">
                  <div className="grid grid-cols-[1fr_110px] items-center gap-x-3">
                    <Label htmlFor={param.key} className="text-sm font-semibold">
                      {param.label}
                    </Label>
                    <Input
                      id={param.key}
                      type="number"
                      inputMode="numeric"
                      step={param.step}
                      min={param.min}
                      max={param.max}
                      value={raw[param.key] ?? ""}
                      onChange={(event) => setField(param.key, event.target.value)}
                      className="text-right tabular-nums"
                    />
                  </div>
                  <p className="text-right text-[11px] text-text-secondary">
                    {formatRange(param.min, param.max)}
                  </p>
                </div>
              )
            })}
            {error && (
              <p role="alert" className="text-xs leading-5 text-destructive">
                {error}
              </p>
            )}
          </div>
        </Tabs>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRaw(rawOf(defaultParams(indicator)))
              setError(null)
            }}
          >
            Mặc định
          </Button>
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="button" size="sm" onClick={save}>
              OK
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Ô nhập giữ chuỗi thô; giá trị số chỉ chốt khi bấm OK. */
function rawOf(params: FlashbackIndicatorParams): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number") {
      raw[key] = String(value)
      continue
    }
    raw[`${key}.lower`] = String(value.lower)
    raw[`${key}.upper`] = String(value.upper)
  }
  return raw
}

/** Chuyển chuỗi thô thành tham số số; ô rỗng thành NaN để bị báo lỗi. */
function valuesOf(raw: Record<string, string>): FlashbackIndicatorParams {
  const values: FlashbackIndicatorParams = {}
  for (const [key, text] of Object.entries(raw)) {
    if (key.includes(".")) {
      const [name, side] = key.split(".")
      const current = values[name]
      const base = typeof current === "number" ? { lower: current, upper: current } : current ?? { lower: 0, upper: 0 }
      values[name] = { ...base, [side]: Number(text) }
      continue
    }
    values[key] = Number(text)
  }
  return values
}
