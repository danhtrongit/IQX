/**
 * Khối KẾ HOẠCH of the order panel, Cấp 0 → Cấp 6.
 *
 * - Cấp 0: 5 chip lý do đời thường (`PlanBlockCap0`).
 * - Cấp 1–3: lý do + vùng mua + AI Thanh tra (`PlanFormCap1`).
 * - Cấp 4+: the lý-do field is REPLACED (đọc 5 lớp / bảng mâu thuẫn) so only
 *   vùng mua stays — `hideLyDo`.
 */
import { Gem, Landmark, LoaderCircle, Newspaper, Target, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { StockInsight } from "../stock-insight"
import { insightLines, LAYER_BY_LY_DO, verdictForLyDo, verdictForValuation } from "../stock-insight"
import type { StockValuation } from "../stock-insight"
import type { LyDo, Verdict } from "../plan-math"
import {
  CAP0_REASONS,
  LY_DO_OPTIONS,
  VERDICT_LABEL,
  fmtVnd,
  lyDoLabel,
} from "../plan-math"

const LY_DO_ICON: Record<LyDo, typeof Target> = {
  ky_thuat: Target,
  dong_tien: Landmark,
  noi_bo: UserRound,
  tin_tuc: Newspaper,
  dinh_gia: Gem,
}

const VERDICT_TONE: Record<Verdict, string> = {
  ung_ho_manh: "border-price-up/40 bg-price-up/10 text-price-up",
  ung_ho: "border-price-up/40 bg-price-up/10 text-price-up",
  trung_tinh: "border-border bg-muted text-muted-foreground",
  can_chu_y: "border-price-ceiling/40 bg-price-ceiling/10 text-price-ceiling",
  nguoc_chieu: "border-price-down/40 bg-price-down/10 text-price-down",
}

/** Cấp 0 — "Vì sao bạn chọn {symbol}?" with the 5 chips (slug-keyed). */
export function PlanBlockCap0({
  symbol,
  reason,
  onReason,
}: {
  symbol: string
  reason: string | null
  onReason: (slug: string) => void
}) {
  return (
    <Card className="gap-3 border-primary/40 bg-primary/5 py-3">
      <CardHeader className="px-3">
        <CardTitle className="font-heading text-xs tracking-wide text-primary">KẾ HOẠCH</CardTitle>
        <p className="text-sm font-medium">Vì sao bạn chọn {symbol}?</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5 px-3">
        {CAP0_REASONS.map((option) => {
          const active = reason === option.slug
          return (
            <Button
              key={option.slug}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-7 rounded-full text-xs"
              aria-pressed={active}
              onClick={() => onReason(option.slug)}
            >
              {option.label}
            </Button>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** The verdict pill — always the AI's own tier or an explicit "no read". */
export function VerdictPill({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <span className="w-full rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
        Chưa có kết luận từ AI
      </span>
    )
  }
  return (
    <span
      className={`w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold uppercase ${VERDICT_TONE[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

/** 🔍 AI Thanh tra — the real read of the picked lý do's lớp. */
export function AiThanhTraCard({
  symbol,
  lyDo,
  insight,
  valuation,
  currentPrice,
  loading,
  failed,
  premiumBlocked,
  onDocChiTiet,
  onChonLyDoKhac,
  onOpenDetail,
}: {
  symbol: string
  lyDo: LyDo
  insight: StockInsight | null
  valuation: StockValuation | null
  currentPrice: number
  loading: boolean
  failed: boolean
  premiumBlocked: boolean
  onDocChiTiet: () => void
  onChonLyDoKhac: () => void
  onOpenDetail: () => void
}) {
  const option = LY_DO_OPTIONS.find((entry) => entry.value === lyDo)
  const layerKey = LAYER_BY_LY_DO[lyDo]
  const read = lyDo === "dinh_gia" ? null : verdictForLyDo(insight, lyDo)
  const valuationVerdict = lyDo === "dinh_gia" ? verdictForValuation(valuation, currentPrice) : null
  const verdict = lyDo === "dinh_gia" ? valuationVerdict : (read?.verdict ?? null)
  const lines =
    lyDo === "dinh_gia"
      ? valuation?.fair_median != null
        ? [
            `Giá hợp lý (trung vị): ${fmtVnd(valuation.fair_median)}`,
            `Giá hiện tại: ${fmtVnd(currentPrice > 0 ? currentPrice : (valuation.current_price ?? 0))}`,
            valuation.upside_pct == null
              ? "Chưa có % lệch so với giá hợp lý."
              : `Lệch so với giá hợp lý: ${valuation.upside_pct >= 0 ? "+" : ""}${valuation.upside_pct.toFixed(1)}%`,
          ]
        : []
      : (read?.lines ?? [])
  const unavailable = premiumBlocked ? false : failed || ((verdict == null) && !loading)

  return (
    <Card className="gap-2 border-border py-3" data-testid="ai-thanh-tra">
      <CardHeader className="px-3">
        <CardTitle className="text-xs font-bold">
          AI Thanh tra · {option?.label ?? lyDo} — {layerKey ?? "BCTC"}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">Dữ liệu: {option?.source ?? "—"}</p>
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        {premiumBlocked ? (
          <p className="text-xs text-muted-foreground">
            Cần gói Premium để đọc lớp này. Bạn vẫn đặt được lệnh — lệnh sẽ ghi nhận trạng thái
            “chưa có kết luận AI”.
          </p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" /> Đang đọc dữ liệu lớp…
          </p>
        ) : unavailable ? (
          <p className="text-xs text-muted-foreground">
            Không tải được dữ liệu lớp này ngay bây giờ.
          </p>
        ) : (
          <>
            {lines.length > 0 && (
              <ul className="space-y-1">
                {lines.map((line) => (
                  <li key={line} className="text-xs leading-relaxed text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            <VerdictPill verdict={verdict} />
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                onDocChiTiet()
                onOpenDetail()
              }}
            >
              Đọc chi tiết lớp này →
            </button>
          </>
        )}

        {verdict === "nguoc_chieu" && (
          <div className="space-y-1.5 rounded-md border border-price-down/40 bg-price-down/10 p-2">
            <p className="text-xs text-price-down">
              Lý do bạn chọn KHÔNG khớp với dữ liệu hiện tại của lớp này.
            </p>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onChonLyDoKhac}>
              Chọn lý do khác
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Mã đang đọc: {symbol}
          {lyDo === "dinh_gia" ? " · nguồn BCTC KHỐI 02" : ""}
        </p>
      </CardContent>
    </Card>
  )
}

/** Cấp 1–3 form: lý do (①) + vùng mua (②); Cấp 4+ hides ①. */
export function PlanFormCap1({
  symbol,
  lyDo,
  onLyDoChange,
  hideLyDo,
  derivedLyDo,
  vungMua,
  onVungMuaChange,
  currentPrice,
}: {
  symbol: string
  lyDo: LyDo | null
  onLyDoChange: (lyDo: LyDo) => void
  hideLyDo: boolean
  derivedLyDo: LyDo | null
  vungMua: number | null
  onVungMuaChange: (value: number | null) => void
  currentPrice: number
}) {
  return (
    <Card className="gap-2 border-primary/40 bg-primary/5 py-3">
      <CardHeader className="px-3">
        <CardTitle className="font-heading text-xs tracking-wide text-primary">KẾ HOẠCH</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3">
        {!hideLyDo && (
          <div className="space-y-1.5">
            <Label className="text-xs">1. Lý do mua {symbol}</Label>
            <div className="grid gap-1.5">
              {LY_DO_OPTIONS.map((option) => {
                const Icon = LY_DO_ICON[option.value]
                const active = lyDo === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onLyDoChange(option.value)}
                    className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 font-semibold"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block">{option.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{option.source}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {hideLyDo && (
          <p className="text-xs text-muted-foreground">
            Lý do mua của lệnh này:{" "}
            <span className="font-medium text-foreground">
              {derivedLyDo ? lyDoLabel(derivedLyDo) : "bạn tự chọn ở ô bên dưới"}
            </span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="vung-mua" className="text-xs">
            {hideLyDo ? "1. Vùng mua" : "2. Vùng mua"}
          </Label>
          <Input
            id="vung-mua"
            inputMode="numeric"
            value={vungMua == null ? "" : String(Math.round(vungMua))}
            onChange={(event) => {
              const raw = event.target.value.replace(/[^\d]/g, "")
              onVungMuaChange(raw === "" ? null : Number(raw))
            }}
            placeholder={currentPrice > 0 ? String(Math.round(currentPrice)) : "0"}
            className="tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            Mặc định là giá hiện tại. Vùng mua phải là số VND &gt; 0.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** The 6-lớp read opened from "Đọc chi tiết lớp này →" — real payload only. */
export function AiInsightDetailDialog({
  open,
  onOpenChange,
  symbol,
  insight,
  valuation,
  currentPrice,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  symbol: string
  insight: StockInsight | null
  valuation: StockValuation | null
  currentPrice: number
  loading: boolean
}) {
  const layers: { key: "L1" | "L2" | "L3" | "L4" | "L5"; title: string }[] = [
    { key: "L1", title: "L1 · Xu hướng" },
    { key: "L2", title: "L2 · Thanh khoản" },
    { key: "L3", title: "L3 · Dòng tiền" },
    { key: "L4", title: "L4 · Nội bộ" },
    { key: "L5", title: "L5 · Tin tức" },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Insight · {symbol}</DialogTitle>
          <DialogDescription>
            Bản đọc 5 lớp do AI tạo, kèm KHỐI 02 định giá từ BCTC. Số liệu chỉ hiện khi có thật.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-3 pr-2">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Đang tải bản đọc…
            </p>
          )}
          {!loading && !insight && (
            <p className="text-sm text-muted-foreground">
              Chưa có bản đọc AI cho mã này (cần gói Premium hoặc mã chưa đủ dữ liệu).
            </p>
          )}
          {insight &&
            layers.map(({ key, title }) => {
              const layer = insight.layers[key]
              return (
                <Card key={key} className="gap-2 py-3">
                  <CardHeader className="px-3">
                    <CardTitle className="flex items-center justify-between text-xs">
                      <span>{title}</span>
                      <span className="text-muted-foreground">
                        {layer?.statusLabel ?? (layer ? "—" : "chưa có")}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 px-3">
                    {layer ? (
                      insightLines(layer).map((line) => (
                        <p key={line} className="text-xs leading-relaxed text-muted-foreground">
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Lớp này chưa có dữ liệu.</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          {valuation && (
            <Card className="gap-2 py-3">
              <CardHeader className="px-3">
                <CardTitle className="text-xs">Định giá · BCTC KHỐI 02</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-3">
                <p className="text-xs text-muted-foreground">
                  Giá hợp lý (trung vị): {valuation.fair_median == null ? "—" : fmtVnd(valuation.fair_median)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Giá hiện tại: {fmtVnd(currentPrice > 0 ? currentPrice : (valuation.current_price ?? 0))}
                </p>
                {valuation.methods.map((method) => (
                  <p key={method.name} className="text-xs text-muted-foreground">
                    {method.name}: bi quan {method.bear == null ? "—" : fmtVnd(method.bear)} · cơ sở{" "}
                    {method.base == null ? "—" : fmtVnd(method.base)} · lạc quan{" "}
                    {method.bull == null ? "—" : fmtVnd(method.bull)}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
