import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Modal, Input, Button } from "@arco-design/web-react"
import { SymbolProvider } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { IconBrainCircuit } from "@/shared/icons"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` / `@/features/cap2` /
// `@/features/cap3` barrels) — those barrels re-export their `Cap*TradingPage`,
// which themselves import `CenterPanel`/`RightSidebar`/`RightToolbar` from
// `@/features/dashboard`; going through them here would create a module-graph
// cycle (same anti-cycle rationale `Cap3TradingPage.tsx`/`RightSidebar.tsx`
// already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress } from "@/features/cap1/hooks"
import { useCap1TradeLog } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "@/features/cap2/Cap2Context"
import { useCap2Progress, useDiemKyLuat } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
// Cấp 2's own (already-proven) client-side approximation of the 4 hành vi vi
// phạm kỷ luật — REUSED as-is, not re-implemented (Cấp 4 changes nothing about
// how discipline is scored; spec §0 "GIỮ NGUYÊN … điểm kỷ luật").
import { computeKetsoFlagsCap2 } from "@/features/cap2/Cap2TradingPage"
import type { PhuongPhapSlTp } from "@/features/cap2/types"
import { Cap3Provider, useCap3Events, type Cap3OrderEvent } from "@/features/cap3/Cap3Context"
import { KhauViModal } from "@/features/cap3/KhauViModal"
import { useCap3TradeLog } from "@/features/cap3/tradeLogCap3"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "@/features/cap3/types"
import { Cap4Provider, useCap4Events, type Cap4OrderEvent } from "./Cap4Context"
import { GraduationModalCap4 } from "./GraduationModalCap4"
import { KetsoModalCap4, type KetsoDataCap4 } from "./KetsoModalCap4"
import { isDoc5LopComplete } from "./doc5Lop"
import type { Cap4TradeRecord } from "./tradeLogCap4"
import type { Lop5Partial } from "./types"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 4 «Thuần thục»"

// Indices (whole-market gauges) — AI Insight needs a specific listed stock.
// Duplicated from `Cap3TradingPage`/`Cap2TradingPage`/… (not imported across
// features) — same rationale as those: a tiny, self-contained guard.
const INDEX_CODES = new Set(["VNINDEX", "VN30", "HNX", "HNXINDEX", "UPCOM", "UPCOMINDEX", "HNX30"])

function isIndexSymbol(s: string): boolean {
  return INDEX_CODES.has(s.toUpperCase())
}

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap3TradingPage`'s
 * own `todayYmd` (the client's only proxy for a fill's `trading_date`). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * `/dau-truong` — Cấp 4 «Thuần thục» demo-trading shell (spec §0/§5-§7), mounted
 * by `DauTruongPage` once the user has graduated Cấp 3. Mirrors
 * `cap3/Cap3TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT wraps ALL
 * FOUR of `Cap1Provider`, `Cap2Provider`, `Cap3Provider` and `Cap4Provider`
 * (spec's "cộng dồn" principle: panel Cấp 4 = panel Cấp 3 GIỮ NGUYÊN với MỘT
 * thay thế — Cấp 1's lý-do field → khối "Đọc 5 lớp" — so `TradingPanel`'s Cấp 1
 * vùng mua, Cấp 2 `SlTpBlock` and Cấp 3 `QuanLyVonBlock` must all stay active
 * alongside Cấp 4's `Doc5LopBlock`).
 */
export function Cap4TradingPage() {
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
            <Cap4Provider>
              <Cap4Terminal />
            </Cap4Provider>
          </Cap3Provider>
        </Cap2Provider>
      </Cap1Provider>
    </SymbolProvider>
  )
}

/** Everything tracked from a symbol's BUY fill needed to reconcile its SELL into
 * Kết sổ Cấp 4 — Cấp 1's kế hoạch fields + Cấp 2's SL/TP commitment + Cấp 3's
 * quản lý vốn commitment + Cấp 4's khối "Đọc 5 lớp". All four buses fire for the
 * SAME buy fill (see `TradingPanel.tsx`), in cap1 → cap2 → cap3 → cap4 order. */
interface LastBuyCap4 {
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
  /** Bản tự chấm 5 lớp lúc đặt — `null` khi cổng cứng Cấp 4 chưa qua. */
  doc5Lop: Lop5Partial | null
  /** Đánh giá AI 5 lớp lúc đặt — `null` khi AI chưa bao giờ được lộ. */
  ai5Lop: Lop5Partial | null
}

function Cap4Terminal() {
  const navigate = useNavigate()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { registerHandlers: registerCap3Handlers } = useCap3Events()
  const { registerHandlers: registerCap4Handlers } = useCap4Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: cap2Progress } = useCap2Progress(isCap2Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()
  const { record: recordCap3Trade } = useCap3TradeLog()

  // Journey bar sticky trên đầu — same override/restore pattern as
  // `Cap3Terminal`/`Cap2Terminal`/`Cap1Terminal` (the sidebar's
  // `SidebarProvider` is a single app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký dùng chung (Cấp 2's score log —
  // Cấp 3/4 KHÔNG có nhật ký điểm riêng, xem `tradeLogCap4.ts`) bất cứ khi nào
  // `useDiemKyLuat` resolves a REAL (non-null) score, so Phân tích danh mục Cấp
  // 4's khối điểm kỷ luật has real data. Never records a fabricated 0.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ Cấp 4 (spec §6 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging ALL FOUR buses' buy-time data — mirrors
  // `Cap3Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap4>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap4 | null>(null)

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
          doc5Lop: existing?.doc5Lop ?? null,
          ai5Lop: existing?.ai5Lop ?? null,
        })
      },
    })
  }, [registerCap1Handlers])

  useEffect(() => {
    registerCap2Handlers({
      onOrderFilled: (order: Cap2OrderEvent) => {
        if (order.side !== "buy") return
        const key = order.symbol.toUpperCase()
        const existing = lastBuyBySymbolRef.current.get(key)
        // Defensive: Cấp 1's handler always fires FIRST for the same buy fill
        // (same `TradingPanel` submit call) and creates the map entry.
        if (!existing) return
        lastBuyBySymbolRef.current.set(key, {
          ...existing,
          phuongPhapSlTp: order.phuongPhapSlTp ?? existing.phuongPhapSlTp,
          catLo: order.catLo ?? existing.catLo,
          chotLoi: order.chotLoi ?? existing.chotLoi,
        })
      },
    })
  }, [registerCap2Handlers])

  useEffect(() => {
    registerCap3Handlers({
      onOrderFilled: (order: Cap3OrderEvent) => {
        if (order.side !== "buy") return
        const key = order.symbol.toUpperCase()
        const existing = lastBuyBySymbolRef.current.get(key)
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

  // Cấp 4's OWN bus carries BOTH sides: the BUY-time khối "Đọc 5 lớp" AND the
  // SELL fill that opens Kết sổ (FE1 made `TradingPanel` notify Cấp 3 + Cấp 4 on
  // sells too, so each cấp's Kết sổ listens to its OWN bus instead of
  // piggybacking on Cấp 2's — the known gap Cấp 3 had).
  useEffect(() => {
    registerCap4Handlers({
      onOrderFilled: (order: Cap4OrderEvent) => {
        const key = order.symbol.toUpperCase()
        if (order.side === "buy") {
          const existing = lastBuyBySymbolRef.current.get(key)
          if (!existing) return
          lastBuyBySymbolRef.current.set(key, {
            ...existing,
            doc5Lop: order.doc5Lop ?? existing.doc5Lop,
            ai5Lop: order.ai5Lop ?? existing.ai5Lop,
          })
          return
        }
        // side === "sell"
        const buy = lastBuyBySymbolRef.current.get(key)
        // No tracked buy THIS session, or one of the commitments never resolved
        // (hard gates upstream should prevent this, but guard anyway) — nothing
        // to reconcile into Kết sổ Cấp 4 yet.
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
          buy.pctVon == null ||
          // Cổng cứng Cấp 4 (spec §5.2): a Cấp 4 lệnh ALWAYS has all 5 lớp rated
          // — without them there is no "Đọc 5 lớp — nhìn lại" to show.
          buy.doc5Lop == null ||
          !isDoc5LopComplete(buy.doc5Lop)
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
          doc5Lop: buy.doc5Lop,
          ai5Lop: buy.ai5Lop,
        })
      },
    })
  }, [registerCap4Handlers])

  /**
   * Records the closed trade into Cấp 1's + Cấp 2's + Cấp 3's (unchanged) trade
   * logs. The Cấp 4 log is written by `KetsoModalCap4` ITSELF (documented
   * contract in that module — it owns the `Cap4TradeRecord` it just reconciled),
   * so this must NOT append it a second time. `Cap4TradeRecord` is a superset of
   * all three lower records, so it's passed straight through and the earlier
   * cấp's Phân tích danh mục blocks keep working.
   */
  const handleKetsoRecorded = (rec: Cap4TradeRecord) => {
    recordCap1Trade(rec)
    recordCap2Trade(rec)
    recordCap3Trade(rec)
  }

  // AI Insight symbol picker — identical to `Cap3TradingPage`'s.
  const [aiInsightOpen, setAiInsightOpen] = useState(false)
  const [aiInsightSymbol, setAiInsightSymbol] = useState("")

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setAiInsightSymbol("")
      setAiInsightOpen(true)
    }
  }

  const trimmedAiInsight = aiInsightSymbol.trim().toUpperCase()
  const aiInsightValid =
    /^[A-Z0-9]{2,10}$/.test(trimmedAiInsight) && !isIndexSymbol(trimmedAiInsight)

  const submitAiInsightSymbol = () => {
    if (!aiInsightValid) return
    setAiInsightOpen(false)
    navigate(`/co-phieu/${trimmedAiInsight}`)
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      <TrialBanner />
      <Header />
      <MarketBar />

      {/* Top bar (mirrors Cấp 3's — spec §1 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 4 · THUẦN THỤC</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Màn chọn khẩu vị rủi ro BẮT BUỘC vẫn áp dụng ở Cấp 4 (Cấp 3 spec §5.2 —
          khẩu vị áp cho MỌI lệnh, và Cấp 4 giữ nguyên khối Quản lý vốn): tự mở
          khi `khau_vi_da_dat === false`, không có nút đóng. Đây là instance DUY
          NHẤT của bản bắt buộc; `TradingPanel` chỉ mount bản `forceOpen` (đổi
          khẩu vị) từ nút "Đổi". */}
      <KhauViModal />

      {/* Kết sổ Cấp 4 (spec §6) — self-contained; opens itself once a Thực chiến
          lệnh's SELL fill is reconciled against its buy-time kế hoạch + SL/TP +
          quản lý vốn + đọc-5-lớp commitments. */}
      <KetsoModalCap4
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        cap2Progress={cap2Progress ?? null}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 4 (spec §3) — self-contained: opens itself once
          progress shows 3/3, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap4 />

      {/* AI Insight symbol picker — identical to Cap3TradingPage's. */}
      <Modal
        visible={aiInsightOpen}
        onCancel={() => setAiInsightOpen(false)}
        footer={null}
        title={null}
        style={{ width: 420 }}
        autoFocus={false}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-xl bg-[var(--color-primary-light-1)] flex items-center justify-center">
            <IconBrainCircuit className="text-[rgb(var(--primary-6))] text-lg" />
          </div>
          <div>
            <div className="text-base font-semibold text-[var(--color-text-1)]">
              Phân tích AI cho 1 mã cổ phiếu
            </div>
            <div className="text-xs text-[var(--color-text-3)]">
              AI Insight cần 1 mã cụ thể. Nhập mã (vd. VCB, HPG, FPT) để chạy phân tích 6 lớp.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={aiInsightSymbol}
            onChange={(v) => setAiInsightSymbol(v.toUpperCase())}
            onPressEnter={submitAiInsightSymbol}
            placeholder="VD: VCB"
            maxLength={10}
            autoFocus
            className="flex-1 font-mono uppercase tracking-wide"
          />
          <Button type="primary" onClick={submitAiInsightSymbol} disabled={!aiInsightValid}>
            Phân tích
          </Button>
        </div>
      </Modal>
    </div>
  )
}
