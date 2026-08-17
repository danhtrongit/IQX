import { useEffect, useRef, useState } from "react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "./Cap1Context"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { GraduationModalCap1 } from "./GraduationModalCap1"
import { KetsoModalCap1, type KetsoDataCap1 } from "./KetsoModalCap1"
import { useCap1Progress } from "./hooks"
import { useCap1TradeLog } from "./tradeLog"
import type { LyDo, TrangThaiLucDat } from "./types"
import "@/features/cap0/cap0.css"
import "./cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 1 «Học việc»"

/** `YYYY-MM-DD` for "today", browser-local time — the client's only proxy for
 * a fill's `trading_date` (the `onOrderFilled` bus event carries no
 * timestamp; mirrors `cap0/Gbar.tsx`'s own "treat a successful place-order
 * response as filled" simplification). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * `/dau-truong` — Cấp 1 «Học việc» demo-trading shell (spec §0/§4-§7), mounted
 * by `DauTruongPage` once the user has graduated Cấp 0. Mirrors
 * `cap0/Cap0TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal, wrapped in
 * `Cap1Provider` instead of `Cap0Provider`.
 */
export function Cap1TradingPage() {
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
        <Cap1Terminal />
      </Cap1Provider>
    </SymbolProvider>
  )
}

interface LastBuyCap1 {
  price: number
  lyDo: LyDo
  trangThaiLucDat: TrangThaiLucDat
  vungMua: number
  buyDate: string
}

function Cap1Terminal() {
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { isCap1Active, registerHandlers } = useCap1Events()
  const { data: progress } = useCap1Progress(isCap1Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades, record } = useCap1TradeLog()

  // Spec §8 "Journey bar sticky trên đầu như Cấp 0" — same override/restore
  // pattern as `Cap0TradingPage` (the sidebar's `SidebarProvider` is a single
  // app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Kết sổ (spec §2 nhiệm vụ ②/§6 — "opens when a Thực-chiến lệnh is sold").
  // Keyed by symbol (not a single last-buy slot) so buying two different
  // symbols before selling one of them still reconciles the SOLD symbol's own
  // kế hoạch — mirrors `cap0/Gbar.tsx#lastBuyBySymbolRef`.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap1>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap1 | null>(null)

  useEffect(() => {
    registerHandlers({
      onOrderFilled: (order: Cap1OrderEvent) => {
        if (order.side === "buy") {
          if (order.lyDo == null || order.trangThaiLucDat == null || order.vungMua == null) return
          lastBuyBySymbolRef.current.set(order.symbol.toUpperCase(), {
            price: order.price,
            lyDo: order.lyDo,
            trangThaiLucDat: order.trangThaiLucDat,
            vungMua: order.vungMua,
            buyDate: todayYmd(),
          })
          return
        }
        // side === "sell"
        const buy = lastBuyBySymbolRef.current.get(order.symbol.toUpperCase())
        // Defensive: no matching buy tracked THIS session (e.g. a position
        // opened before this page mounted) — nothing to reconcile yet.
        if (!buy) return
        ketsoCountRef.current += 1
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
          sellDate: todayYmd(),
        })
      },
    })
  }, [registerHandlers])

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

      {/* Top bar (spec §11 "Badge góc đổi ... thành THỰC CHIẾN khi vào Cấp 1"). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 1 · HỌC VIỆC</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Kết sổ Cấp 1 (spec §6) — self-contained; opens itself once a Thực
          chiến lệnh's SELL fill is reconciled against its buy-time kế hoạch. */}
      <KetsoModalCap1
        data={ketso}
        progress={progress ?? null}
        trades={trades}
        onClose={() => setKetso(null)}
        onRecorded={record}
      />

      {/* Màn tốt nghiệp Cấp 1 (spec §3) — self-contained: opens itself once
          progress shows 5/5, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap1 />

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
