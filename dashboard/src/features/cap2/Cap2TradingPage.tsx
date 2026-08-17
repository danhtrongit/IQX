import { useEffect, useRef, useState } from "react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` barrel) — that barrel
// re-exports `Cap1TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`; going through
// the barrel here would create a module-graph cycle (same anti-cycle
// rationale `KetsoModalCap2.tsx`/`RightSidebar.tsx` already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress } from "@/features/cap1/hooks"
import { useCap1TradeLog, type Cap1TradeRecord } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "./Cap2Context"
import { GraduationModalCap2 } from "./GraduationModalCap2"
import { KetsoModalCap2, type KetsoDataCap2 } from "./KetsoModalCap2"
import { useCap2Progress, useDiemKyLuat } from "./hooks"
import { useCap2TradeLog } from "./tradeLogCap2"
import type { KetsoInputCap2, PhuongPhapSlTp } from "./types"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 2 «Kỷ luật»"

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap1TradingPage`'s
 * own `todayYmd` (the client's only proxy for a fill's `trading_date`). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** spec §1.3 — "lỗ nhẹ" ceiling: bán sớm only counts between 0% and −2% loss. */
const BAN_SOM_LOSS_CEILING_PCT = -2

export interface KetsoFlagsCap2Input {
  entryPrice: number
  exitPrice: number
  /** Cắt lỗ cam kết (`order_kehoach.cat_lo`). */
  catLo: number
  /** Số phiên đã giữ lệnh (mua → bán), via `countTradingSessions`. */
  soPhienGiu: number
}

export type KetsoFlagsCap2 = Omit<KetsoInputCap2, "order_id">

/**
 * Best-effort client-side approximation of the 4 hành vi vi phạm kỷ luật
 * (spec §1) from what's available at Kết sổ time — entry/exit fill price,
 * the SL/TP commitment, and sessions held (`countTradingSessions`, the same
 * calendar-based approximation `KetsoModalCap1`/`isLenhCoChuyen` already use
 * — no minute-level tick data, "reasonable, not exact").
 *
 * - **Cắt lỗ đúng phiên / cắt lỗ chậm:** exit price at/below cắt lỗ cam kết
 *   → treated as "touched". Held ≤1 phiên → cắt trong phiên chạm (đúng);
 *   held longer → cắt lỗ chậm, `giu_cham_SL_bao_nhieu_phien` = phiên giữ − 1.
 * - **Bán sớm khi lỗ nhẹ:** a loss strictly between 0% and −2% (spec's own
 *   ">−2%" wording) while the exit price never reached cắt lỗ.
 * - **KNOWN LIMITATION (documented, not silently fabricated):**
 *   `cham_TP_giu_lam_hut` ("chạm chốt lời rồi giữ tiếp làm hụt") and
 *   `nhoi_lenh_khi_lo` ("mua thêm khi đang lỗ") both need observation this
 *   single sell fill doesn't have — the former needs the intraday HIGH after
 *   touching chốt lời (this client has no live-quote history buffer per
 *   held position), the latter needs tracking every BUY placed DURING the
 *   holding period, not just the final round trip. Both always resolve
 *   `false` here rather than guess. A proper fix is a future task that feeds
 *   real intraday ticks / a multi-order ledger into this computation (same
 *   spirit as `cap1/tradeLog.ts`'s own documented BE gaps).
 * - `cham_SL_cuoi_phien` (spec §8's end-of-day banner concept) doesn't apply
 *   to a CLOSED round trip's Kết sổ — that flag is about a still-HELD
 *   position observed at market close, owned by `AlertCap2`'s (separately
 *   wired) banner flow, not this function.
 */
export function computeKetsoFlagsCap2({
  entryPrice,
  exitPrice,
  catLo,
  soPhienGiu,
}: KetsoFlagsCap2Input): KetsoFlagsCap2 {
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const touchedSl = catLo > 0 && exitPrice <= catLo
  const cutSameSession = soPhienGiu <= 1

  const cham_SL_cat_dung_phien_ke = touchedSl && cutSameSession
  const cham_SL_khong_cat = touchedSl && !cutSameSession
  const giu_cham_SL_bao_nhieu_phien = cham_SL_khong_cat
    ? Math.max(1, soPhienGiu - 1)
    : undefined

  const ban_som_khi_lo_nhe = !touchedSl && pnlPct < 0 && pnlPct > BAN_SOM_LOSS_CEILING_PCT

  return {
    cham_SL_cuoi_phien: false,
    cham_SL_cat_dung_phien_ke,
    cham_SL_khong_cat,
    giu_cham_SL_bao_nhieu_phien,
    cham_TP_giu_lam_hut: false,
    ban_som_khi_lo_nhe,
    nhoi_lenh_khi_lo: false,
  }
}

/**
 * `/dau-truong` — Cấp 2 «Kỷ luật» demo-trading shell (spec §0/§4-§13), mounted
 * by `DauTruongPage` once the user has graduated Cấp 1. Mirrors
 * `cap1/Cap1TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT wraps
 * BOTH `Cap1Provider` AND `Cap2Provider` (Cấp 2 reuses Cấp 1's Form Kế hoạch
 * 100% intact — spec's "cộng dồn" principle — so `TradingPanel`'s Cấp 1 lý
 * do/vùng mua UI must stay active alongside Cấp 2's `SlTpBlock`).
 */
export function Cap2TradingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = prevTitle
    }
  }, [])

  return (
    <SymbolProvider symbol="VNM">
      <Cap1Provider>
        <Cap2Provider>
          <Cap2Terminal />
        </Cap2Provider>
      </Cap1Provider>
    </SymbolProvider>
  )
}

/** Everything tracked from a symbol's BUY fill needed to reconcile its SELL
 * into Kết sổ Cấp 2 — Cấp 1's kế hoạch fields (lý do/trạng thái/vùng mua,
 * from the Cấp 1 bus) merged with Cấp 2's SL/TP commitment (from the Cấp 2
 * bus) — both buses fire for the SAME buy fill (see `TradingPanel.tsx`). */
interface LastBuyCap2 {
  price: number
  lyDo: LyDo | null
  trangThaiLucDat: TrangThaiLucDat | null
  vungMua: number | null
  buyDate: string
  phuongPhapSlTp: PhuongPhapSlTp | null
  catLo: number | null
  chotLoi: number | null
}

function Cap2Terminal() {
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: cap2Progress } = useCap2Progress(isCap2Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()

  // Journey bar sticky trên đầu (spec §4) — same override/restore pattern as
  // `Cap1Terminal`/`Cap0TradingPage` (the sidebar's `SidebarProvider` is a
  // single app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký Cấp 2 (plan item 4 — "so
  // Phân tích danh mục has real data") bất cứ khi nào `useDiemKyLuat` resolves
  // a REAL (non-null) score — never records a fabricated/placeholder 0 for a
  // ngày that hasn't been scored yet.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ (spec §5.6/§6/§7 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging BOTH buses' buy-time data — mirrors
  // `Cap1Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap2>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap2 | null>(null)

  useEffect(() => {
    registerCap1Handlers({
      onOrderFilled: (order: Cap1OrderEvent) => {
        if (order.side !== "buy") return
        if (order.lyDo == null || order.trangThaiLucDat == null || order.vungMua == null) return
        const key = order.symbol.toUpperCase()
        const existing = lastBuyBySymbolRef.current.get(key)
        lastBuyBySymbolRef.current.set(key, {
          price: order.price,
          lyDo: order.lyDo,
          trangThaiLucDat: order.trangThaiLucDat,
          vungMua: order.vungMua,
          buyDate: todayYmd(),
          phuongPhapSlTp: existing?.phuongPhapSlTp ?? null,
          catLo: existing?.catLo ?? null,
          chotLoi: existing?.chotLoi ?? null,
        })
      },
    })
  }, [registerCap1Handlers])

  useEffect(() => {
    registerCap2Handlers({
      onOrderFilled: (order: Cap2OrderEvent) => {
        const key = order.symbol.toUpperCase()
        if (order.side === "buy") {
          // Defensive: Cấp 1's own handler above always fires FIRST for the
          // same buy fill (same `TradingPanel` submit call) and creates the
          // map entry — nothing to attach SL/TP to if it somehow didn't.
          const existing = lastBuyBySymbolRef.current.get(key)
          if (!existing) return
          lastBuyBySymbolRef.current.set(key, {
            ...existing,
            phuongPhapSlTp: order.phuongPhapSlTp ?? existing.phuongPhapSlTp,
            catLo: order.catLo ?? existing.catLo,
            chotLoi: order.chotLoi ?? existing.chotLoi,
          })
          return
        }
        // side === "sell"
        const buy = lastBuyBySymbolRef.current.get(key)
        // No tracked buy THIS session, or the Cấp 2 SL/TP commitment never
        // resolved (hard gate upstream should prevent this, but guard
        // anyway) — nothing to reconcile into Kết sổ Cấp 2 yet.
        if (!buy) return
        if (
          buy.lyDo == null ||
          buy.trangThaiLucDat == null ||
          buy.vungMua == null ||
          buy.phuongPhapSlTp == null ||
          buy.catLo == null ||
          buy.chotLoi == null
        ) {
          return
        }
        ketsoCountRef.current += 1
        const sellDate = todayYmd()
        const soPhienGiu = countTradingSessions(buy.buyDate, sellDate)
        const flags = computeKetsoFlagsCap2({
          entryPrice: buy.price,
          exitPrice: order.price,
          catLo: buy.catLo,
          soPhienGiu,
        })
        setKetso({
          n: ketsoCountRef.current,
          orderId: order.orderId,
          symbol: order.symbol,
          quantity: order.quantity,
          entryPrice: buy.price,
          exitPrice: order.price,
          vungMua: buy.vungMua,
          lyDo: buy.lyDo,
          trangThaiLucDat: buy.trangThaiLucDat,
          buyDate: buy.buyDate,
          sellDate,
          catLo: buy.catLo,
          chotLoi: buy.chotLoi,
          phuongPhapSlTp: buy.phuongPhapSlTp,
          flags: { order_id: order.orderId, ...flags },
          giaSauKhiCat: null,
        })
      },
    })
  }, [registerCap2Handlers])

  // Records the closed trade into BOTH Cấp 1's (unchanged) trade log AND
  // Cấp 2's (this delivery's) trade log — the latter needs the 4 vi phạm
  // flags this modal already computed/posted, which `onRecorded`'s
  // `Cap1TradeRecord` payload alone doesn't carry.
  const handleKetsoRecorded = (rec: Cap1TradeRecord) => {
    recordCap1Trade(rec)
    if (!ketso) return
    recordCap2Trade({
      ...rec,
      chamSlKhongCat: Boolean(ketso.flags.cham_SL_khong_cat),
      chamTpGiuLamHut: Boolean(ketso.flags.cham_TP_giu_lam_hut),
      banSomKhiLoNhe: Boolean(ketso.flags.ban_som_khi_lo_nhe),
      nhoiLenhKhiLo: Boolean(ketso.flags.nhoi_lenh_khi_lo),
      ghiChuNhinLai: null,
    })
  }

  // Nút «AI Phân tích» của RightToolbar — modal tự lo phần nhập mã và bản
  // đọc 6 lớp, mở ngay trong shell cấp.
  const [aiInsightOpen, setAiInsightOpen] = useState(false)

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setAiInsightOpen(true)
    }
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      <TrialBanner />
      <Header onSymbolSelect={setSymbol} />
      <MarketBar onSymbolClick={setSymbol} />

      {/* Top bar (mirrors Cấp 1's — spec §11 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 2 · KỶ LUẬT</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Kết sổ Cấp 2 (spec §5.6/§6/§7) — self-contained; opens itself once a
          Thực chiến lệnh's SELL fill is reconciled against its buy-time kế
          hoạch + SL/TP commitment. */}
      <KetsoModalCap2
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        cap2Progress={cap2Progress ?? null}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 2 (spec §13) — self-contained: opens itself once
          progress shows 5/5, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap2 />

      {/* ★★ AI Insight mở NGAY TRONG shell cấp (xem `AiInsightModal`).
          Trước đây nút này đổi hẳn route sang trang cổ phiếu: user bấm một nút
          của chính terminal, nhập một mã, rồi bị chuyển trang — mất hành trình,
          mất form kế hoạch đang gõ dở, không có đường quay lại. */}
      <AiInsightSymbolModal
        visible={aiInsightOpen}
        onClose={() => setAiInsightOpen(false)}
      />
    </div>
  )
}
