import { useEffect, useRef, useState } from "react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` … `@/features/cap4` barrels) —
// those barrels re-export their `Cap*TradingPage`, which themselves import
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`; going
// through them here would create a module-graph cycle (same anti-cycle rationale
// `Cap4TradingPage.tsx`/`RightSidebar.tsx` already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress, useRecordKetso } from "@/features/cap1/hooks"
import { useCap1TradeLog } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "@/features/cap2/Cap2Context"
import { useDiemKyLuat } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
// Cấp 2's own (already-proven) client-side approximation of the 4 hành vi vi phạm
// kỷ luật — REUSED as-is, not re-implemented (Cấp 5 changes nothing about how
// discipline is scored; spec §0 "GIỮ NGUYÊN … điểm kỷ luật/chuỗi (Cấp 2)").
import { computeKetsoFlagsCap2 } from "@/features/cap2/Cap2TradingPage"
import type { PhuongPhapSlTp } from "@/features/cap2/types"
import { Cap3Provider, useCap3Events, type Cap3OrderEvent } from "@/features/cap3/Cap3Context"
import { KhauViModal } from "@/features/cap3/KhauViModal"
import { useCap3TradeLog } from "@/features/cap3/tradeLogCap3"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "@/features/cap3/types"
import { Cap4Provider, useCap4Events, type Cap4OrderEvent } from "@/features/cap4/Cap4Context"
import { isDoc5LopComplete } from "@/features/cap4/doc5Lop"
import { useCap4TradeLog } from "@/features/cap4/tradeLogCap4"
import type { Lop5Partial } from "@/features/cap4/types"
import { Cap5Provider, useCap5Events, type Cap5OrderEvent } from "./Cap5Context"
import { GraduationModalCap5 } from "./GraduationModalCap5"
import { KetsoModalCap5, type KetsoDataCap5 } from "./KetsoModalCap5"
import { cap5Api } from "./api"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 5 «Lão luyện»"

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap4TradingPage`'s own
 * `todayYmd` (the client's only proxy for a fill's `trading_date`). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * `/dau-truong` — Cấp 5 «Lão luyện» demo-trading shell (spec §0/§4/§7), mounted
 * by `DauTruongPage` once the user has graduated Cấp 4. Mirrors
 * `cap4/Cap4TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT wraps ALL
 * FIVE of `Cap1Provider` … `Cap5Provider` (spec's "cộng dồn" principle: panel Cấp
 * 5 = panel Cấp 4 GIỮ NGUYÊN 100% + MỘT nút phụ "Đứng ngoài", so `TradingPanel`'s
 * Cấp 1 vùng mua, Cấp 2 `SlTpBlock`, Cấp 3 `QuanLyVonBlock` and Cấp 4
 * `Doc5LopBlock` must all stay active alongside Cấp 5's `DungNgoaiButton`).
 */
export function Cap5TradingPage() {
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
              <Cap5Provider>
                <Cap5Terminal />
              </Cap5Provider>
            </Cap4Provider>
          </Cap3Provider>
        </Cap2Provider>
      </Cap1Provider>
    </SymbolProvider>
  )
}

/** Everything tracked from a symbol's BUY fill needed to reconcile its SELL into
 * Kết sổ Cấp 5 — Cấp 1's kế hoạch fields + Cấp 2's SL/TP commitment + Cấp 3's
 * quản lý vốn commitment + Cấp 4's khối "Đọc 5 lớp". Cấp 5 adds NOTHING at buy
 * time (spec §11), so this is `LastBuyCap4`'s shape unchanged. All buses fire for
 * the SAME buy fill (see `TradingPanel.tsx`), in cap1 → cap2 → cap3 → cap4 order. */
interface LastBuyCap5 {
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

function Cap5Terminal() {
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { registerHandlers: registerCap3Handlers } = useCap3Events()
  const { registerHandlers: registerCap4Handlers } = useCap4Events()
  const { registerHandlers: registerCap5Handlers } = useCap5Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()
  const { record: recordCap3Trade } = useCap3TradeLog()
  const { record: recordCap4Trade } = useCap4TradeLog()
  const recordKetsoCap1 = useRecordKetso()

  // Journey bar sticky trên đầu — same override/restore pattern as
  // `Cap4Terminal`/`Cap3Terminal`/… (the sidebar's `SidebarProvider` is a single
  // app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký dùng chung (Cấp 2's score log —
  // Cấp 3/4/5 KHÔNG có nhật ký điểm riêng, xem `tradeLogCap5.ts`) bất cứ khi nào
  // `useDiemKyLuat` resolves a REAL (non-null) score, so Phân tích danh mục Cấp
  // 5's khối điểm kỷ luật has real data. Never records a fabricated 0.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ Cấp 5 (spec §4 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging ALL FOUR lower buses' buy-time data — mirrors
  // `Cap4Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap5>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap5 | null>(null)

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

  // Cấp 4's bus is used for the BUY-time khối "Đọc 5 lớp" ONLY here: at Cấp 5 the
  // SELL is owned by Cấp 5's own bus (below), which opens Kết sổ Cấp 5 — Kết sổ
  // Cấp 4 must NOT also open for the same fill.
  useEffect(() => {
    registerCap4Handlers({
      onOrderFilled: (order: Cap4OrderEvent) => {
        if (order.side !== "buy") return
        const key = order.symbol.toUpperCase()
        const existing = lastBuyBySymbolRef.current.get(key)
        if (!existing) return
        lastBuyBySymbolRef.current.set(key, {
          ...existing,
          doc5Lop: order.doc5Lop ?? existing.doc5Lop,
          ai5Lop: order.ai5Lop ?? existing.ai5Lop,
        })
      },
    })
  }, [registerCap4Handlers])

  /**
   * Reconciles a Cấp 5 SELL fill into Kết sổ Cấp 5 — and owns the ORDERING FIX.
   *
   * ★ **`POST /cap1/ketso` PHẢI xong TRƯỚC khi modal mở.** Backend Cấp 5 đọc/ghi
   * verdict trên CHÍNH hàng `order_ketso` mà `POST /cap1/ketso` tạo: cả
   * `GET /cap5/verdict/{order_id}` và `POST /cap5/ketso` trả **404** khi hàng đó
   * chưa tồn tại (`services/cap5/service.py#_verdict_payload`: "kết sổ Cấp 1 —
   * cần kết sổ (Cấp 1) trước"). Ở Cấp 1-4 hàng đó chỉ được tạo khi user ĐÓNG màn
   * Kết sổ — tức là quá muộn cho Cấp 5: `PhanLoai4O` sẽ hiện trạng thái lỗi, cổng
   * `Đóng kết sổ ✓` fail-closed không mở, mà modal `closable={false}` không có nút
   * huỷ → **user kẹt trong màn không đóng được**. Vì vậy trang này kết sổ Cấp 1
   * NGAY khi lệnh bán khớp, rồi mới mở modal.
   *
   * Lỗi của call này bị bỏ qua CÓ CHỦ ĐÍCH: 409 "Lệnh này đã kết sổ" là trạng
   * thái bình thường (vd. user mở lại tab, hoặc `KetsoModalCap5` đã ghi trước),
   * và nếu call thất bại thật thì modal vẫn phải mở — nó có lối ra riêng khi
   * verdict không lấy được (xem `KetsoModalCap5#handleEscape`), tuyệt đối không
   * được im lặng bỏ một lệnh đã bán.
   *
   * ĐÁNH ĐỔI ĐÃ BIẾT: `cam_xuc` gửi ở đây là `null` vì khối cảm xúc Cấp 1 nằm
   * TRONG modal (chưa mở). Call thứ hai của modal sẽ 409 nên cảm xúc user chọn
   * KHÔNG được lưu server-side ở Cấp 5 (nó vẫn nuôi đoạn coach Cấp 1 tại chỗ).
   * Không có endpoint nào cập nhật `cam_xuc` sau khi hàng đã tạo — fix đúng là
   * một task BE (cho `/cap1/ketso` upsert `cam_xuc`, hoặc cho `/cap5/ketso` tự
   * tạo hàng). Ghi ra đây để không ai tưởng là bỏ sót.
   */
  const openKetsoCap5 = async (order: Cap5OrderEvent) => {
    const key = order.symbol.toUpperCase()
    const buy = lastBuyBySymbolRef.current.get(key)
    // No tracked buy THIS session, or one of the commitments never resolved (hard
    // gates upstream should prevent this, but guard anyway) — nothing to
    // reconcile into Kết sổ Cấp 5 yet.
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
      // Cổng cứng Cấp 4 (giữ nguyên ở Cấp 5): a lệnh ALWAYS has all 5 lớp rated —
      // without them there is no "Đọc 5 lớp — nhìn lại" to show.
      buy.doc5Lop == null ||
      !isDoc5LopComplete(buy.doc5Lop)
    ) {
      return
    }

    try {
      await recordKetsoCap1.mutateAsync({ order_id: order.orderId, cam_xuc: null })
    } catch {
      // Đã kết sổ Cấp 1 trước đó (409) hoặc lỗi khác — modal vẫn mở (xem trên).
    }

    /**
     * NGUỒN SĂN của lệnh (spec §8) — `GET /cap5/nguon-san/{symbol}`.
     *
     * ★★ Ba trạng thái, KHÔNG hai (luật số 1):
     *   · gọi được + `tu_san_ma` ⇒ bộ lọc + số phiên chờ thật;
     *   · gọi được + KHÔNG từ săn ⇒ `huntFilter: null`, màn Kết sổ nói thẳng
     *     "mã này không đến từ săn mã";
     *   · gọi KHÔNG được ⇒ `huntNguonChuaBiet: true`. Gộp trạng thái này vào
     *     `huntFilter: null` sẽ biến một cú lỗi mạng thành lời khẳng định
     *     "bạn tự chọn mã này" — một điều ta không hề biết.
     *
     * `so_lop_luc_vao` server LUÔN trả `null` (điểm đồng thuận lúc ĐẶT LỆNH chưa
     * từng được lưu) — chép nguyên, không thay bằng điểm hôm nay.
     */
    let nguonSan: Pick<
      KetsoDataCap5,
      "huntFilter" | "huntSoPhienCho" | "huntSoLopLucVao" | "huntNguonChuaBiet"
    > = {
      huntFilter: null,
      huntSoPhienCho: null,
      huntSoLopLucVao: null,
      huntNguonChuaBiet: true,
    }
    try {
      const ns = await cap5Api.getNguonSan(order.symbol)
      nguonSan = {
        huntFilter: ns.tu_san_ma ? ns.hunt_filter : null,
        huntSoPhienCho: ns.so_phien_trong_watchlist,
        huntSoLopLucVao: ns.so_lop_luc_vao,
        huntNguonChuaBiet: false,
      }
    } catch {
      // Giữ nguyên `huntNguonChuaBiet: true` — xem docstring trên. Lệnh đã bán
      // thì màn Kết sổ VẪN phải mở; thiếu nguồn săn không được nuốt một lệnh.
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
      ...nguonSan,
    })
  }

  useEffect(() => {
    registerCap5Handlers({
      onOrderFilled: (order: Cap5OrderEvent) => {
        // Cấp 5 KHÔNG thêm gì vào panel mua (spec §11) → chỉ nhánh BÁN có việc.
        if (order.side !== "sell") return
        void openKetsoCap5(order)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCap5Handlers])

  /**
   * Records the closed trade into Cấp 1's + Cấp 2's + Cấp 3's + Cấp 4's
   * (unchanged) trade logs. The Cấp 5 log is written by `KetsoModalCap5` ITSELF
   * (documented contract in that module — it owns the `Cap5TradeRecord` it just
   * reconciled), so this must NOT append it a second time. `Cap5TradeRecord` is a
   * superset of all four lower records, so it's passed straight through and the
   * earlier cấp's Phân tích danh mục blocks keep working.
   */
  const handleKetsoRecorded = (rec: Cap5TradeRecord) => {
    recordCap1Trade(rec)
    recordCap2Trade(rec)
    recordCap3Trade(rec)
    recordCap4Trade(rec)
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

      {/* Top bar (mirrors Cấp 4's — spec §1 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 5 · LÃO LUYỆN</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Màn chọn khẩu vị rủi ro BẮT BUỘC vẫn áp dụng ở Cấp 5 (Cấp 3 spec §5.2 —
          khẩu vị áp cho MỌI lệnh, và Cấp 5 giữ nguyên khối Quản lý vốn): tự mở
          khi `khau_vi_da_dat === false`, không có nút đóng. Đây là instance DUY
          NHẤT của bản bắt buộc; `TradingPanel` chỉ mount bản `forceOpen` (đổi
          khẩu vị) từ nút "Đổi". */}
      <KhauViModal />

      {/* Kết sổ Cấp 5 (spec §4) — self-contained; opens itself once a Thực chiến
          lệnh's SELL fill is reconciled against its buy-time kế hoạch + SL/TP +
          quản lý vốn + đọc-5-lớp commitments, VÀ hàng `order_ketso` đã tồn tại
          (xem `openKetsoCap5`). */}
      <KetsoModalCap5
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 5 (spec §3) — self-contained: opens itself once
          progress shows 3/3, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap5 />

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
