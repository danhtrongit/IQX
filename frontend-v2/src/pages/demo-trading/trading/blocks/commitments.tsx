/**
 * Cấp 2's "Cắt lỗ / Chốt lời" commitment and Cấp 3's "Quản lý vốn".
 *
 * Both compute their numbers from REAL data — Cách 1 reads hỗ trợ/kháng cự out
 * of the AI Insight L1 layer, Cách 2 reads the symbol's own OHLCV history — and
 * both disable (with a reason) rather than invent a threshold when that data
 * isn't there. Neither ever sets cat_lo/chot_loi on its own: the user presses
 * "Chọn cách này", which is the commitment Cấp 2 measures.
 */
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { StockInsight } from "../stock-insight"
import { extractHoTroKhangCu, ohlcvBars } from "../stock-insight"
import type {
  CachKhoiLuong,
  KhauViLoai,
  MucTuTin,
  PhuongPhapSlTp,
} from "../plan-math"
import {
  CACH_KHOI_LUONG_OPTIONS,
  KHAU_VI_OPTIONS,
  KHAU_VI_PCT,
  MUC_TU_TIN_OPTIONS,
  computeBienDoDaoDong,
  computeBienDoSlTp,
  computeHoTroKhangCuSlTp,
  computeKhoiLuong,
  fmtPct,
  fmtVnd,
} from "../plan-math"

function OptionButton({
  active,
  disabled,
  onClick,
  title,
  sub,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  sub?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col rounded-md border px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "border-primary bg-primary/10 font-semibold" : "border-border hover:border-primary/50"
      }`}
    >
      <span className="truncate">{title}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </button>
  )
}

/** Cấp 2 — one of two ways to set cắt lỗ/chốt lời, both from real data. */
export function SlTpBlock({
  giaVao,
  selected,
  catLo,
  chotLoi,
  insight,
  loading,
  onSelect,
}: {
  giaVao: number
  selected: PhuongPhapSlTp | null
  catLo: number | null
  chotLoi: number | null
  insight: StockInsight | null
  loading: boolean
  onSelect: (method: PhuongPhapSlTp, catLo: number, chotLoi: number) => void
}) {
  const { hoTro, khangCu } = extractHoTroKhangCu(insight?.layers?.L1?.fields)
  const cach1 = computeHoTroKhangCuSlTp(hoTro, khangCu, giaVao)
  const bienDo = computeBienDoDaoDong(ohlcvBars(insight))
  const cach2 = computeBienDoSlTp(bienDo, giaVao)

  return (
    <Card className="gap-2 py-3">
      <CardHeader className="px-3">
        <CardTitle className="text-xs font-bold">Cắt lỗ / Chốt lời</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Chọn 1 trong 2 cách. Mức đã chọn được ghi vào hồ sơ lệnh và đối chiếu khi kết sổ.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" /> Đang tính mức theo dữ liệu thật…
          </p>
        )}

        <SuggestionRow
          title="Cách 1 — Hỗ trợ / Kháng cự"
          note={
            hoTro == null || khangCu == null
              ? "Chưa đọc được hỗ trợ/kháng cự từ AI Insight cho mã này."
              : `Hỗ trợ ${fmtVnd(hoTro)} · Kháng cự ${fmtVnd(khangCu)}`
          }
          result={cach1}
          active={selected === "ho_tro_khang_cu"}
          disabled={cach1 == null || giaVao <= 0}
          onChoose={() => cach1 && onSelect("ho_tro_khang_cu", cach1.catLo, cach1.chotLoi)}
        />

        <SuggestionRow
          title="Cách 2 — Biên độ dao động"
          note={
            bienDo == null
              ? "Chưa đủ dữ liệu giá để tính biên độ dao động."
              : `Biên độ ${fmtVnd(bienDo)} (giá vào −2×/chiều bán, +4×/chiều mua)`
          }
          result={cach2}
          active={selected === "bien_do_dao_dong"}
          disabled={cach2 == null || giaVao <= 0}
          onChoose={() => cach2 && onSelect("bien_do_dao_dong", cach2.catLo, cach2.chotLoi)}
        />

        {selected && catLo != null && chotLoi != null && (
          <p className="rounded-md border border-border bg-muted px-2 py-1.5 text-xs tabular-nums">
            Đã chọn: cắt lỗ {fmtVnd(catLo)} · chốt lời {fmtVnd(chotLoi)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SuggestionRow({
  title,
  note,
  result,
  active,
  disabled,
  onChoose,
}: {
  title: string
  note: string
  result: { catLo: number; chotLoi: number; catLoPct: number; chotLoiPct: number } | null
  active: boolean
  disabled: boolean
  onChoose: () => void
}) {
  return (
    <div
      className={`space-y-1.5 rounded-md border px-2 py-2 ${
        active ? "border-primary bg-primary/10" : "border-border"
      }`}
    >
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
      {result && (
        <p className="text-xs tabular-nums">
          Cắt lỗ {fmtVnd(result.catLo)} ({fmtPct(result.catLoPct)}) · Chốt lời{" "}
          {fmtVnd(result.chotLoi)} ({fmtPct(result.chotLoiPct)})
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant={active ? "default" : "outline"}
        className="h-7 text-xs"
        disabled={disabled}
        onClick={onChoose}
      >
        {active ? "Đang dùng cách này" : "Chọn cách này"}
      </Button>
    </div>
  )
}

/**
 * Cấp 3 — khẩu vị × mức tự tin × cách khối lượng, and the volume it implies.
 * Khẩu vị is server state (`POST /cap3/khau-vi`); tự tin and cách are this
 * order's decision, so they reset after every fill.
 */
export function QuanLyVonBlock({
  khauVi,
  vonBanDau,
  giaVao,
  mucTuTin,
  cachKhoiLuong,
  onMucTuTin,
  onCachKhoiLuong,
  onKhoiLuong,
  dangDoiKhauVi,
  onChonKhauVi,
}: {
  khauVi: KhauViLoai | null
  vonBanDau: number
  giaVao: number
  mucTuTin: MucTuTin | null
  cachKhoiLuong: CachKhoiLuong | null
  onMucTuTin: (value: MucTuTin) => void
  onCachKhoiLuong: (value: CachKhoiLuong) => void
  onKhoiLuong: (quantity: number, pctVon: number) => void
  dangDoiKhauVi: boolean
  onChonKhauVi: (value: KhauViLoai) => void
}) {
  const suggestion =
    khauVi != null && mucTuTin != null && cachKhoiLuong != null
      ? computeKhoiLuong({
          khauViPct: KHAU_VI_PCT[khauVi],
          mucTuTin,
          cachKhoiLuong,
          vonBanDau,
          giaVao,
        })
      : null

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2">
      <p className="text-xs font-semibold">Quản lý vốn</p>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">
          {khauVi == null ? "Chọn khẩu vị rủi ro (bắt buộc, lưu vào hồ sơ Cấp 3)" : "Khẩu vị rủi ro (trần % vốn 1 lệnh)"}
        </Label>
        <div className="flex gap-1.5">
          {KHAU_VI_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={khauVi === option.value}
              disabled={dangDoiKhauVi}
              title={`${option.label} · ${KHAU_VI_PCT[option.value]}%`}
              onClick={() => onChonKhauVi(option.value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Mức độ tự tin (bạn tự chấm)</Label>
        <div className="flex gap-1.5">
          {MUC_TU_TIN_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={mucTuTin === option.value}
              title={option.label}
              onClick={() => onMucTuTin(option.value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Cách tính khối lượng</Label>
        <div className="flex flex-col gap-1.5">
          {CACH_KHOI_LUONG_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={cachKhoiLuong === option.value}
              title={option.label}
              sub={option.desc}
              onClick={() => onCachKhoiLuong(option.value)}
            />
          ))}
        </div>
      </div>

      {suggestion ? (
        <div className="space-y-1.5 rounded-md border border-border bg-card px-2 py-1.5">
          <p className="text-xs tabular-nums">
            Đề xuất: {suggestion.khoiLuong.toLocaleString("vi-VN")} CP ·{" "}
            {suggestion.pctVon.toFixed(1)}% vốn ({fmtVnd(suggestion.tienDuKien)} trước khi tròn lô)
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onKhoiLuong(suggestion.khoiLuong, suggestion.pctVon)}
          >
            Dùng khối lượng đề xuất
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Chấm mức tự tin và chọn cách tính khối lượng để xem đề xuất.
        </p>
      )}
    </div>
  )
}
