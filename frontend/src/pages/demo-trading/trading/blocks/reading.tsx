/**
 * Cấp 4/5 "Đọc 5 lớp" and Cấp 6 "Đối chiếu mâu thuẫn".
 *
 * Đọc 5 lớp is a self-assessment: the user rates all 5 lớp BEFORE the AI's own
 * read is revealed ("chống nhìn bài"), and the block only reports the two
 * counts — a different view from the AI is "góc nhìn khác", never "sai". The
 * real arbiter of a read is the trade's outcome, which the server measures.
 */
import { ChevronDown, LoaderCircle } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { StockInsight, StockValuation } from "../stock-insight"
import { insightLines, valuationRange } from "../stock-insight"
import type { ConflictLevel, Lop, Lop5Partial, MauThuanCap6, NhanDinhLop } from "../plan-math"
import {
  CAU_CHOT_MAU_THUAN,
  CHU_THICH_DIEM_TRU,
  CHU_THICH_KHUNG_THAM_KHAO,
  CHU_THICH_PHU_QUYET,
  CONFLICT_LEVEL_OPTIONS,
  LOP_DEFS,
  NHAN_DINH_OPTIONS,
  conflictLevelLabel,
  countDongThuan,
  countKhacAi,
  feedbackNhanDinh,
  fmtVnd,
  isDoc5LopComplete,
  lopLabel,
  nhanDinhLabel,
} from "../plan-math"

/** Cấp 4/5 — rate all 5 lớp, then compare with the AI's own read. */
export function Doc5LopBlock({
  symbol,
  doc5Lop,
  ai5Lop,
  insight,
  valuation,
  insightLoading,
  premiumBlocked,
  currentPrice,
  onRate,
}: {
  symbol: string
  doc5Lop: Lop5Partial
  ai5Lop: Lop5Partial
  insight: StockInsight | null
  valuation: StockValuation | null
  currentPrice: number
  insightLoading: boolean
  premiumBlocked: boolean
  onRate: (lop: Lop, value: NhanDinhLop) => void
}) {
  const [openLop, setOpenLop] = useState<Lop | null>(null)
  const [revealed, setRevealed] = useState(false)
  const range = valuationRange(valuation)
  const complete = isDoc5LopComplete(doc5Lop)
  const aiLayerCount = Object.keys(ai5Lop).length

  return (
    <Card className="gap-2 py-3">
      <CardHeader className="px-3">
        <CardTitle className="text-xs font-bold">Đọc 5 lớp · {symbol}</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Bạn tự chấm từng lớp theo dữ liệu thật. AI đối chiếu chỉ hiện sau khi bạn chấm đủ 5 lớp.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        {LOP_DEFS.map((def) => {
          const rated = doc5Lop[def.lop]
          const layer = def.layer ? insight?.layers?.[def.layer] : undefined
          return (
            <div key={def.lop} className="space-y-1.5 rounded-md border border-border px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  {def.label}
                  {rated && <span className="ml-1 text-muted-foreground">· {nhanDinhLabel(rated)}</span>}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  onClick={() => setOpenLop(openLop === def.lop ? null : def.lop)}
                >
                  Xem số liệu
                  <ChevronDown className={`size-3 transition-transform ${openLop === def.lop ? "rotate-180" : ""}`} />
                </button>
              </div>

              {openLop === def.lop && (
                <div className="space-y-1 rounded-md bg-muted/50 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">Nguồn: {def.source}</p>
                  {def.lop === "dinh_gia" ? (
                    range ? (
                      <>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          Vùng giá trị: {fmtVnd(range.rangeLow)} – {fmtVnd(range.rangeHigh)}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          Trung vị: {fmtVnd(range.median)} · Giá hiện tại: {fmtVnd(currentPrice)}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Chưa có dữ liệu định giá.</p>
                    )
                  ) : insightLoading ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <LoaderCircle className="size-3 animate-spin" /> Đang tải lớp…
                    </p>
                  ) : layer ? (
                    insightLines(layer).map((line) => (
                      <p key={line} className="text-[11px] leading-relaxed text-muted-foreground">
                        {line}
                      </p>
                    ))
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {premiumBlocked
                        ? "Lớp này cần gói Premium để đọc số liệu."
                        : "Chưa có dữ liệu cho lớp này."}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-1.5">
                {NHAN_DINH_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={rated === option.value ? "default" : "outline"}
                    className="h-7 flex-1 text-xs"
                    aria-pressed={rated === option.value}
                    onClick={() => onRate(def.lop, option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          )
        })}

        {!complete && (
          <p className="text-[11px] text-muted-foreground">
            Còn {LOP_DEFS.length - Object.keys(doc5Lop).length} lớp chưa chấm.
          </p>
        )}

        {complete && (
          <div className="space-y-1.5 rounded-md border border-primary/40 bg-primary/5 px-2 py-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">AI đối chiếu</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[11px]"
                disabled={aiLayerCount === 0}
                onClick={() => setRevealed(true)}
              >
                {revealed ? "Xem lại" : "Đối chiếu với AI"}
              </Button>
            </div>
            {!revealed ? (
              <p className="text-[11px] text-muted-foreground">
                Bạn đã chấm đủ 5 lớp. Bấm “Đối chiếu với AI” để xem bản đọc của IQX cho từng lớp.
              </p>
            ) : aiLayerCount === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {premiumBlocked
                  ? "Cần gói Premium để đối chiếu với AI. Lệnh vẫn ghi nhận bản tự chấm của bạn."
                  : "Chưa đọc được bản AI cho mã này — chưa thể đối chiếu."}
              </p>
            ) : (
              <>
                {LOP_DEFS.map((def) => (
                  <p key={def.lop} className="text-[11px] tabular-nums">
                    {def.label}: bạn {nhanDinhLabel(doc5Lop[def.lop])} · AI{" "}
                    {ai5Lop[def.lop] ? nhanDinhLabel(ai5Lop[def.lop]) : "chưa có dữ liệu"}
                  </p>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Đồng thuận: {countDongThuan(ai5Lop)}/{aiLayerCount} lớp AI đánh giá Ủng hộ · Góc nhìn
                  khác AI: {countKhacAi(doc5Lop, ai5Lop)} lớp (khác quan điểm, không phải sai).
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Cấp 6 — the server's own sides/conflict, plus the user's judgement. The
 * judgement NEVER blocks the buy and never resizes the order: it exists so the
 * Kết sổ can compare what the user said with what they did.
 */
export function MauThuanBlock({
  mauThuan,
  nhanDinh,
  onNhanDinh,
  loading,
}: {
  mauThuan: MauThuanCap6 | null
  nhanDinh: ConflictLevel | null
  onNhanDinh: (level: ConflictLevel | null) => void
  loading: boolean
}) {
  const coBang =
    !!mauThuan && !mauThuan.chua_du_du_lieu && mauThuan.co_mau_thuan && mauThuan.ung_ho.length > 0 && mauThuan.nguoc.length > 0

  return (
    <Card className="gap-2 py-3" data-testid="cap6-mau-thuan">
      <CardHeader className="px-3">
        <CardTitle className="text-xs font-bold">Đối chiếu mâu thuẫn 5 lớp</CardTitle>
        <p className="text-[11px] text-muted-foreground">Bản chia phe do IQX đọc từ dữ liệu thật của mã.</p>
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" /> Đang đọc 5 lớp của mã…
          </p>
        )}

        {!loading && !mauThuan && (
          <p className="text-xs text-muted-foreground">
            Chưa đọc được bản 5 lớp cho mã này — chưa thể đối chiếu mâu thuẫn.
          </p>
        )}

        {!loading && mauThuan?.chua_du_du_lieu && (
          <p className="text-xs text-muted-foreground">
            {mauThuan.ly_do_chua_du ?? "Chưa đọc đủ 5 lớp cho mã này nên chưa kết luận được mâu thuẫn."}
          </p>
        )}

        {!loading && mauThuan && !mauThuan.chua_du_du_lieu && (
          <>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-price-up">Ủng hộ mua</p>
              <p className="text-[11px] text-muted-foreground">
                {mauThuan.ung_ho.length > 0
                  ? mauThuan.ung_ho.map((row) => `${lopLabel(row.lop)} (${row.nhan})`).join(" · ")
                  : "Không có lớp nào ủng hộ."}
              </p>
              <p className="text-xs font-semibold text-price-down">Ngược chiều</p>
              <p className="text-[11px] text-muted-foreground">
                {mauThuan.nguoc.length > 0
                  ? mauThuan.nguoc
                      .map((row) => `${lopLabel(row.lop)} (${row.nhan})${row.la_phu_quyet ? " · phủ quyết" : ""}`)
                      .join(" · ")
                  : "Không có lớp nào ngược chiều."}
              </p>
              {mauThuan.trung_tinh.length > 0 && (
                <>
                  <p className="text-xs font-semibold">Trung tính</p>
                  <p className="text-[11px] text-muted-foreground">
                    {mauThuan.trung_tinh.map((row) => lopLabel(row.lop)).join(" · ")}
                  </p>
                </>
              )}
            </div>

            {mauThuan.canh_bao && (
              <p className="rounded-md border border-price-down/40 bg-price-down/10 px-2 py-1.5 text-[11px] text-price-down">
                {mauThuan.canh_bao}
              </p>
            )}

            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>{CHU_THICH_PHU_QUYET}</p>
              <p>{CHU_THICH_DIEM_TRU}</p>
              <p>{CHU_THICH_KHUNG_THAM_KHAO}</p>
            </div>

            {coBang ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Bạn đọc mâu thuẫn này ở mức nào?</p>
                <div className="grid gap-1.5">
                  {CONFLICT_LEVEL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={nhanDinh === option.value}
                      onClick={() => onNhanDinh(nhanDinh === option.value ? null : option.value)}
                      className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                        nhanDinh === option.value
                          ? "border-primary bg-primary/10 font-semibold"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className="block">{option.title}</span>
                      <span className="block text-[11px] text-muted-foreground">{option.desc}</span>
                    </button>
                  ))}
                </div>
                {nhanDinh && (
                  <p className="rounded-md border border-border bg-muted px-2 py-1.5 text-[11px]">
                    {feedbackNhanDinh(nhanDinh)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Các lớp không mâu thuẫn (hoặc chỉ một phía) — không có gì để nhận định. Lệnh vẫn ghi
                nhận kế hoạch như thường.
              </p>
            )}

            <p className="text-[11px] italic text-muted-foreground">{CAU_CHOT_MAU_THUAN}</p>
            {nhanDinh && <p className="sr-only">Mức nhận định đã chọn: {conflictLevelLabel(nhanDinh)}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
