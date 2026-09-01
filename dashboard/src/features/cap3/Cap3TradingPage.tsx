import { useEffect, useRef, useState } from "react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` / `@/features/cap2`
// barrels) — those barrels re-export `Cap1TradingPage`/`Cap2TradingPage`, which
// themselves import `CenterPanel`/`RightSidebar`/`RightToolbar` from
// `@/features/dashboard`; going through them here would create a module-graph
// cycle (same anti-cycle rationale `Cap2TradingPage.tsx`/`RightSidebar.tsx`
// already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress } from "@/features/cap1/hooks"
import { useCap1TradeLog } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "@/features/cap2/Cap2Context"
import { useDiemKyLuat } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
// Cấp 2's own (already-proven) client-side approximation of the 4 hành vi vi
// phạm kỷ luật — REUSED as-is, not re-implemented (Cấp 3 changes nothing about
// how discipline is scored; spec §0 "GIỮ NGUYÊN … điểm kỷ luật").
import { computeKetsoFlagsCap2 } from "@/features/cap2/Cap2TradingPage"
import type { PhuongPhapSlTp } from "@/features/cap2/types"
import { Cap3Provider, useCap3Events, type Cap3OrderEvent } from "./Cap3Context"
import { GraduationModalCap3 } from "./GraduationModalCap3"
import { KetsoModalCap3, type KetsoDataCap3 } from "./KetsoModalCap3"
import { KhauViModal } from "./KhauViModal"
import type { Cap3TradeRecord } from "./tradeLogCap3"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 3 «Bản lĩnh»"

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap2TradingPage`'s
 * own `todayYmd` (the client's only proxy for a fill's `trading_date`). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * `/dau-truong` — Cấp 3 «Bản lĩnh» demo-trading shell (spec §0/§6-§8), mounted
 * by `DauTruongPage` once the user has graduated Cấp 2. Mirrors
 * `cap2/Cap2TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT wraps
 * ALL THREE of `Cap1Provider`, `Cap2Provider` and `Cap3Provider` (spec's
 * "cộng dồn" principle: panel Cấp 3 = panel Cấp 2 GIỮ NGUYÊN + chèn khối Quản
 * lý vốn, so `TradingPanel`'s Cấp 1 lý do/vùng mua UI and Cấp 2's `SlTpBlock`
 * must stay active alongside Cấp 3's `QuanLyVonBlock`).
 */
export function Cap3TradingPage() {
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
          <Cap3Provider>
            <Cap3Terminal />
          </Cap3Provider>
        </Cap2Provider>
      </Cap1Provider>
    </SymbolProvider>
  )
}

/** Everything tracked from a symbol's BUY fill needed to reconcile its SELL
 * into Kết sổ Cấp 3 — Cấp 1's kế hoạch fields + Cấp 2's SL/TP commitment +
 * Cấp 3's quản lý vốn commitment. All three buses fire for the SAME buy fill
 * (see `TradingPanel.tsx`), in cap1 → cap2 → cap3 order. */
interface LastBuyCap3 {
  price: number
  lyDo: LyDo | null
  trangThaiLucDat: TrangThaiLucDat | null
  vungMua: number | null
  buyDate: string
  phuongPhapSlTp: PhuongPhapSlTp | null
  catLo: number | null
  chotLoi: number | null
  khauVi: KhauViLoai | null
  mucTuTin: MucTuTin | null
  cachKhoiLuong: CachKhoiLuong | null
  khoiLuong: number | null
  pctVon: number | null
}

function Cap3Terminal() {
  // ★★ Đổi mã NGAY TRONG shell cấp (ô tìm kiếm trên Header, cụm giá MarketBar)
  // thay vì điều hướng sang trang cổ phiếu — `Cap3Terminal` nằm trong
  // `SymbolProvider` ở trên, y hệt tám shell cấp còn lại.
  const { setSymbol } = useSymbol()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { registerHandlers: registerCap3Handlers } = useCap3Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()

  // Journey bar sticky trên đầu — same override/restore pattern as
  // `Cap2Terminal`/`Cap1Terminal`/`Cap0TradingPage` (the sidebar's
  // `SidebarProvider` is a single app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký dùng chung (Cấp 2's score log
  // — Cấp 3 KHÔNG có nhật ký điểm riêng, xem `tradeLogCap3.ts`) bất cứ khi nào
  // `useDiemKyLuat` resolves a REAL (non-null) score, so Phân tích danh mục
  // Cấp 3's khối điểm kỷ luật has real data. Never records a fabricated 0.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ Cấp 3 (spec §7 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging ALL THREE buses' buy-time data — mirrors
  // `Cap2Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap3>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap3 | null>(null)

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
          khauVi: existing?.khauVi ?? null,
          mucTuTin: existing?.mucTuTin ?? null,
          cachKhoiLuong: existing?.cachKhoiLuong ?? null,
          khoiLuong: existing?.khoiLuong ?? null,
          pctVon: existing?.pctVon ?? null,
        })
      },
    })
  }, [registerCap1Handlers])

  // Cấp 3's OWN bus only carries BUY-time quản lý vốn data: `TradingPanel`
  // notifies cap1 + cap2 ONLY on a sell fill (it never calls
  // `cap3Events.onOrderFilled` for `side === "sell"` — see `TradingPanel.tsx`),
  // so the SELL side of Kết sổ Cấp 3 is driven off the Cấp 2 bus below. Same
  // "reuse the bus that actually fires" choice `Cap2Terminal` made for Cấp 1's
  // kế hoạch fields.
  useEffect(() => {
    registerCap3Handlers({
      onOrderFilled: (order: Cap3OrderEvent) => {
        if (order.side !== "buy") return
        const key = order.symbol.toUpperCase()
        const existing = lastBuyBySymbolRef.current.get(key)
        // Defensive: Cấp 1's handler always fires FIRST for the same buy fill
        // (same `TradingPanel` submit call) and creates the map entry.
        if (!existing) return
        lastBuyBySymbolRef.current.set(key, {
          ...existing,
          khauVi: order.khauVi ?? existing.khauVi,
          mucTuTin: order.mucTuTin ?? existing.mucTuTin,
          cachKhoiLuong: order.cachKhoiLuong ?? existing.cachKhoiLuong,
          khoiLuong: order.khoiLuong ?? existing.khoiLuong,
          pctVon: order.pctVon ?? existing.pctVon,
        })
      },
    })
  }, [registerCap3Handlers])

  useEffect(() => {
    registerCap2Handlers({
      onOrderFilled: (order: Cap2OrderEvent) => {
        const key = order.symbol.toUpperCase()
        if (order.side === "buy") {
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
        // No tracked buy THIS session, or one of the 3 commitments never
        // resolved (hard gates upstream should prevent this, but guard anyway)
        // — nothing to reconcile into Kết sổ Cấp 3 yet.
        if (!buy) return
        if (
          buy.lyDo == null ||
          buy.trangThaiLucDat == null ||
          buy.vungMua == null ||
          buy.phuongPhapSlTp == null ||
          buy.catLo == null ||
          buy.chotLoi == null ||
          buy.khauVi == null ||
          buy.mucTuTin == null ||
          buy.cachKhoiLuong == null ||
          buy.khoiLuong == null ||
          buy.pctVon == null
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
          khauVi: buy.khauVi,
          mucTuTin: buy.mucTuTin,
          cachKhoiLuong: buy.cachKhoiLuong,
          khoiLuong: buy.khoiLuong,
          pctVon: buy.pctVon,
        })
      },
    })
  }, [registerCap2Handlers])

  /**
   * Records the closed trade into Cấp 1's + Cấp 2's (unchanged) trade logs.
   * The Cấp 3 log is written by `KetsoModalCap3` ITSELF (documented contract in
   * that module — it owns the `Cap3TradeRecord` it just reconciled), so this
   * must NOT append it a second time. `Cap3TradeRecord` is a superset of both
   * lower records, so it's passed straight through.
   */
  const handleKetsoRecorded = (rec: Cap3TradeRecord) => {
    recordCap1Trade(rec)
    recordCap2Trade(rec)
  }

  // Nút «AI Phân tích» của RightToolbar — modal tự lo phần nhập mã và bản đọc
  // 6 lớp, mở ngay trong shell cấp (identical to `Cap2TradingPage`'s).
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

      {/* Top bar (mirrors Cấp 2's — spec §1 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 3 · BẢN LĨNH</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Màn chọn khẩu vị rủi ro BẮT BUỘC lần đầu vào Cấp 3 (spec §5.2) —
          self-contained: tự mở khi `khau_vi_da_dat === false`, không có nút
          đóng. Đây là instance DUY NHẤT của bản bắt buộc; `TradingPanel` chỉ
          mount bản `forceOpen` (đổi khẩu vị) từ nút "Đổi". */}
      <KhauViModal />

      {/* Kết sổ Cấp 3 (spec §7) — self-contained; opens itself once a Thực
          chiến lệnh's SELL fill is reconciled against its buy-time kế hoạch +
          SL/TP + quản lý vốn commitments. */}
      <KetsoModalCap3
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 3 (spec §3) — self-contained: opens itself once
          progress shows 2/2, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap3 />

      {/* ★★ AI Insight mở NGAY TRONG shell cấp (xem `AiInsightModal`).
          Trước đây nút này đổi hẳn route sang trang cổ phiếu: user bấm một nút
          của chính terminal, nhập một mã, rồi bị chuyển trang — mất hành trình,
          mất form kế hoạch/quản lý vốn đang gõ dở, không có đường quay lại. */}
      <AiInsightSymbolModal visible={aiInsightOpen} onClose={() => setAiInsightOpen(false)} />
    </div>
  )
}
