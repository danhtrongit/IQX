import { useEffect, useRef, useState } from "react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` … `@/features/cap5` barrels) —
// those barrels re-export their `Cap*TradingPage`, which themselves import
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`; going
// through them here would create a module-graph cycle (same anti-cycle rationale
// `Cap5TradingPage.tsx`/`RightSidebar.tsx` already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress, useRecordKetso } from "@/features/cap1/hooks"
import { useCap1TradeLog } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "@/features/cap2/Cap2Context"
import { useDiemKyLuat } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
// Cấp 2's own (already-proven) client-side approximation of the 4 hành vi vi phạm
// kỷ luật — REUSED as-is, not re-implemented (Cấp 6 changes nothing about how
// discipline is scored; spec §0 "GIỮ NGUYÊN … điểm kỷ luật/chuỗi").
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
import { Cap5Provider } from "@/features/cap5/Cap5Context"
import { fetchNguonSanKetso } from "@/features/cap5/nguonSanKetso"
import { useCap5TradeLog } from "@/features/cap5/tradeLogCap5"
import { cap6Api } from "./api"
import { Cap6Provider, useCap6Events, type Cap6OrderEvent } from "./Cap6Context"
import { GraduationModalCap6 } from "./GraduationModalCap6"
import { useEnterCap6 } from "./hooks"
import { KetsoModalCap6, type DoiChieuKetsoCap6, type KetsoDataCap6 } from "./KetsoModalCap6"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import { KIEU_OPTIONS, type KieuCoPhieu } from "./types"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 6 «Đối chiếu»"

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap5TradingPage`'s own
 * `todayYmd` (the client's only proxy for a fill's `trading_date`). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Tên tiếng Việt của 1 kiểu — dùng CHÍNH bảng nhãn của `types.ts` (bằng đúng
 * `KIEU_CO_PHIEU[...]["ten"]` của backend), không tự đặt tên thứ hai. */
function kieuTenOf(kieu: KieuCoPhieu | null): string | null {
  if (!kieu) return null
  return KIEU_OPTIONS.find((o) => o.value === kieu)?.label ?? null
}

/**
 * Dựng khối "Đối chiếu — nhìn lại" của MỘT lệnh mua, từ `GET /cap6/goi-y`.
 *
 * ★ VÌ SAO PHẢI GỌI LẠI SERVER: `Cap6OrderEvent` chỉ mang những gì user tự nhập
 * (lớp quyết định + lý do + kiểu client chọn khi hệ bó tay). `kieu`/`kieu_ten`/
 * `nganh`/`lop_uu_tien` là do SERVER suy từ ngành, và `khop_goi_y` là
 * `lop_quyet_dinh ∈ lop_uu_tien` — cùng một luật `POST /cap6/kehoach` đã ghi vào
 * `order_kehoach` (`services/cap6/service.py`). Đọc lại từ đúng nguồn đó là cách
 * duy nhất để Kết sổ không nói khác hàng đã lưu; FE KHÔNG có bảng trọng số.
 *
 * Fail-closed và trung thực:
 *  - query lỗi → `kieu = null` → khối hiện "chưa phân loại", `khopGoiY = null`.
 *  - hệ không phân loại được nhưng user tự chọn kiểu → hiện ĐÚNG kiểu user chọn,
 *    nhưng `lopUuTien = []` + `khopGoiY = null`: bảng trọng số cho kiểu đó chỉ có
 *    ở server và `/cap6/goi-y` không trả về nó khi ngành không map được. Nói
 *    "chưa xét" còn hơn đoán một kết luận khớp/lệch. (`GET /cap6/goi-y?kieu=` sẽ
 *    xoá hẳn khoảng trống này — một task BE nhỏ, ghi ra đây để không ai tưởng là
 *    bỏ sót.)
 *
 * ★ `khopGoiY === false` KHÔNG BAO GIỜ là "sai", và `null` KHÔNG BAO GIỜ được
 * hiện thành lệch (spec §5/§10) — `KetsoModalCap6` render đúng như vậy.
 */
async function resolveDoiChieu(order: Cap6OrderEvent): Promise<DoiChieuKetsoCap6 | null> {
  const lopQuyetDinh = order.lopQuyetDinh
  if (!lopQuyetDinh) return null

  let goiY: Awaited<ReturnType<typeof cap6Api.getGoiY>> | null = null
  try {
    goiY = await cap6Api.getGoiY(order.symbol)
  } catch {
    // 404 "chưa vào Cấp 6" / mạng lỗi / 500 — khối vẫn hiện, chỉ không có kiểu.
    goiY = null
  }

  const serverKieu = goiY?.kieu ?? null
  const kieu = serverKieu ?? order.kieuCoPhieu ?? null
  const lopUuTien = serverKieu ? goiY!.lop_uu_tien : []
  return {
    kieu,
    kieuTen: serverKieu ? (goiY!.kieu_ten ?? kieuTenOf(kieu)) : kieuTenOf(kieu),
    nganh: goiY?.nganh ?? null,
    lopQuyetDinh,
    lopUuTien,
    khopGoiY: serverKieu ? lopUuTien.includes(lopQuyetDinh) : null,
    lyDo: order.lyDoDoiChieu ?? null,
  }
}

/**
 * `/dau-truong` — Cấp 6 «Đối chiếu» demo-trading shell (spec §0/§4/§8), mounted
 * by `DauTruongPage` once the user has graduated Cấp 5. Mirrors
 * `cap5/Cap5TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT wraps ALL
 * SIX of `Cap1Provider` … `Cap6Provider` (spec's "cộng dồn" principle: panel Cấp
 * 6 = panel Cấp 5 GIỮ NGUYÊN 100% + bước "Đối chiếu" chỉ hiện khi 5 lớp mâu
 * thuẫn, so `TradingPanel`'s Cấp 1 vùng mua, Cấp 2 `SlTpBlock`, Cấp 3
 * `QuanLyVonBlock` and Cấp 4 `Doc5LopBlock` must all stay active alongside Cấp 6's
 * `DoiChieuBlock`. Cấp 5 KHÔNG thêm gì vào panel đặt lệnh — nút «Đứng ngoài» đã
 * nghỉ hưu cùng Cấp 5 cũ).
 */
export function Cap6TradingPage() {
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
                <Cap6Provider>
                  <Cap6Terminal />
                </Cap6Provider>
              </Cap5Provider>
            </Cap4Provider>
          </Cap3Provider>
        </Cap2Provider>
      </Cap1Provider>
    </SymbolProvider>
  )
}

/** Everything tracked from a symbol's BUY fill needed to reconcile its SELL into
 * Kết sổ Cấp 6 — Cấp 1's kế hoạch fields + Cấp 2's SL/TP commitment + Cấp 3's
 * quản lý vốn commitment + Cấp 4's khối "Đọc 5 lớp". Cấp 6's own block is tracked
 * separately (it resolves asynchronously — see `doiChieuBySymbolRef`). All buses
 * fire for the SAME buy fill (see `TradingPanel.tsx`), in cap1 → … → cap6 order. */
interface LastBuyCap6 {
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

function Cap6Terminal() {
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { registerHandlers: registerCap3Handlers } = useCap3Events()
  const { registerHandlers: registerCap4Handlers } = useCap4Events()
  const { registerHandlers: registerCap6Handlers } = useCap6Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()
  const { record: recordCap3Trade } = useCap3TradeLog()
  const { record: recordCap4Trade } = useCap4TradeLog()
  const { record: recordCap5Trade } = useCap5TradeLog()
  const recordKetsoCap1 = useRecordKetso()
  const enterCap6 = useEnterCap6()

  /**
   * ★ `POST /cap6/enter` NGAY khi vào trang, idempotent.
   *
   * `DauTruongPage` cũng gọi nó, nhưng CHỈ khi `GET /cap6/progress` trả null lúc
   * nó fetch. Nếu hàng `cap6_progress` chưa có mà trang này đã mount (vd. user
   * vừa tốt nghiệp Cấp 5 trong phiên này, hoặc progress fetch chậm/lỗi), thì
   * `GET /cap6/goi-y` và `POST /cap6/kehoach` sẽ 404 — `TradingPanel` await call
   * đó trong cùng một `try`, nên MỌI `onOrderFilled` phía sau bị nuốt và KHÔNG
   * Kết sổ nào của bất kỳ cấp nào mở ra (FE1 đã gặp). Gọi lại ở đây là bảo hiểm
   * rẻ: server trả về hàng sẵn có khi đã tồn tại.
   */
  const enterAttemptedRef = useRef(false)
  useEffect(() => {
    if (enterAttemptedRef.current) return
    enterAttemptedRef.current = true
    enterCap6.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Journey bar sticky trên đầu — same override/restore pattern as
  // `Cap5Terminal`/`Cap4Terminal`/… (the sidebar's `SidebarProvider` is a single
  // app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký dùng chung (Cấp 2's score log —
  // Cấp 3-6 KHÔNG có nhật ký điểm riêng) bất cứ khi nào `useDiemKyLuat` resolves
  // a REAL (non-null) score. Never records a fabricated 0.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ Cấp 6 (spec §6 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging ALL FIVE lower buses' buy-time data — mirrors
  // `Cap5Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap6>>(new Map())
  /**
   * Khối Đối chiếu của lệnh mua đang mở, theo mã — lưu PROMISE chứ không phải
   * giá trị: nó cần một round-trip `GET /cap6/goi-y`, còn `onOrderFilled` là
   * đồng bộ. `openKetsoCap6` await promise này, nên một lệnh bán ngay sau lệnh
   * mua vẫn nhận đủ khối Đối chiếu thay vì mất trắng vì đua.
   */
  const doiChieuBySymbolRef = useRef<Map<string, Promise<DoiChieuKetsoCap6 | null>>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap6 | null>(null)

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

  // Cấp 4's bus is used for the BUY-time khối "Đọc 5 lớp" ONLY here: at Cấp 6 the
  // SELL is owned by Cấp 6's own bus (below), which opens Kết sổ Cấp 6 — Kết sổ
  // Cấp 4 (and Cấp 5's) must NOT also open for the same fill.
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

  // ★ KHÔNG đăng ký handler nào ở bus Cấp 5.
  //   · `onVerdictSettled` ĐÃ BỊ GỠ cùng phân loại 4 ô của Cấp 5 cũ (Kết sổ Cấp 6
  //     không còn chốt verdict nên không còn gì để ghi nhận).
  //   · `onOrderFilled` thì CỐ Ý không đăng ký: lệnh bán do bus Cấp 6 xử lý, đăng
  //     ký cả hai sẽ mở 2 màn Kết sổ cho cùng một lệnh.

  /**
   * Reconciles a Cấp 6 SELL fill into Kết sổ Cấp 6 — và kết sổ Cấp 1 NGAY
   * khi lệnh bán khớp (do NOT reorder).
   *
   * ★★ **LÝ DO CŨ ĐÃ MẤT, THỨ TỰ THÌ CÒN.** Trước đây bước này bắt buộc vì backend
   * Cấp 5 (phân loại 4 ô) đọc/ghi verdict trên CHÍNH hàng `order_ketso` mà
   * `POST /cap1/ketso` tạo, và `GET /cap5/verdict` / `POST /cap5/ketso` trả 404 khi
   * hàng đó chưa có → cổng fail-closed không mở → user kẹt trong modal
   * `closable={false}`. Cả hai endpoint đó ĐÃ NGHỈ HƯU cùng Cấp 5 cũ, nên KHÔNG
   * còn nguy cơ kẹt. Giữ call ở đây vì nó vẫn bảo đảm hàng `order_ketso` tồn tại
   * TRƯỚC `PATCH /cap{6,7,8}/task` (nhiệm vụ của các cấp trên được suy ra
   * server-side từ `order_kehoach` JOIN `order_ketso`), và vì nó idempotent.
   *
   * Lỗi của call này bị bỏ qua CÓ CHỦ ĐÍCH: 409 "Lệnh này đã kết sổ" là trạng
   * thái bình thường, và nếu call thất bại thật thì modal vẫn phải mở — tuyệt đối
   * không được im lặng bỏ một lệnh đã bán.
   *
   * ĐÁNH ĐỔI ĐÃ BIẾT: `cam_xuc` gửi ở đây là `null` vì khối cảm xúc Cấp 1 nằm
   * TRONG modal (chưa mở), nên lần POST thứ hai của modal 409 và cảm xúc user
   * chọn KHÔNG được lưu server-side. Fix đúng vẫn là task BE "cho `/cap1/ketso`
   * upsert `cam_xuc`" — nay cổng Cấp 5 đã bỏ, một lựa chọn khác là bỏ hẳn call
   * sớm này và để modal tự kết sổ.
   */
  const openKetsoCap6 = async (order: Cap6OrderEvent) => {
    const key = order.symbol.toUpperCase()
    const buy = lastBuyBySymbolRef.current.get(key)
    // No tracked buy THIS session, or one of the commitments never resolved (hard
    // gates upstream should prevent this, but guard anyway) — nothing to
    // reconcile into Kết sổ Cấp 6 yet.
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
      // Cổng cứng Cấp 4 (giữ nguyên ở Cấp 6): a lệnh ALWAYS has all 5 lớp rated —
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

    // Khối Đối chiếu (nếu lệnh mua này có mâu thuẫn). `await undefined` khi mã
    // chưa từng đi qua bước Đối chiếu → `null` → modal bỏ hẳn khối, im lặng.
    const doiChieu = (await doiChieuBySymbolRef.current.get(key)) ?? null

    /**
     * NGUỒN SĂN của lệnh (spec Cấp 5 §8) — `GET /cap5/nguon-san/{symbol}`.
     *
     * ★★ Nguyên tắc cộng dồn: trang này bọc `Cap5Provider`, nên nút «Săn mã» +
     * «Watchlist» VẪN có ở cấp này và một lệnh ở đây HOÀN TOÀN có thể đến từ bộ
     * lọc săn mã (backend đóng dấu `order_kehoach.hunt_filter`). Trước đây Kết sổ
     * điền `huntFilter: null` cứng ⇒ màn khẳng định "mã này KHÔNG đến từ săn mã"
     * cho mọi lệnh, ngược lại chính dữ liệu server. Ba trạng thái xem
     * `cap5/nguonSanKetso.ts`.
     */
    const nguonSan = await fetchNguonSanKetso(order.symbol)

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
      doiChieu,
    })
  }

  useEffect(() => {
    registerCap6Handlers({
      onOrderFilled: (order: Cap6OrderEvent) => {
        const key = order.symbol.toUpperCase()
        if (order.side === "buy") {
          // Lệnh KHÔNG mâu thuẫn → `TradingPanel` không gửi khối Đối chiếu → xoá
          // khối cũ của mã này (đừng để lệnh trước dây sang lệnh sau).
          if (!order.lopQuyetDinh) {
            doiChieuBySymbolRef.current.delete(key)
            return
          }
          doiChieuBySymbolRef.current.set(key, resolveDoiChieu(order))
          return
        }
        void openKetsoCap6(order)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCap6Handlers])

  /**
   * Records the closed trade into Cấp 1's + 2's + 3's + 4's + 5's (unchanged)
   * trade logs. The Cấp 6 log is written by `KetsoModalCap6` ITSELF (documented
   * contract in that module — it owns the `Cap6TradeRecord` it just reconciled),
   * so this must NOT append it a second time. `Cap6TradeRecord` is a superset of
   * all five lower records, so it's passed straight through and every earlier
   * cấp's Phân tích danh mục block keeps working.
   */
  const handleKetsoRecorded = (rec: Cap6TradeRecord) => {
    recordCap1Trade(rec)
    recordCap2Trade(rec)
    recordCap3Trade(rec)
    recordCap4Trade(rec)
    recordCap5Trade(rec)
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

      {/* Top bar (mirrors Cấp 5's — spec §1 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 6 · ĐỐI CHIẾU</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Màn chọn khẩu vị rủi ro BẮT BUỘC vẫn áp dụng ở Cấp 6 (Cấp 3 spec §5.2 —
          khẩu vị áp cho MỌI lệnh, và Cấp 6 giữ nguyên khối Quản lý vốn). Đây là
          instance DUY NHẤT của bản bắt buộc; `TradingPanel` chỉ mount bản
          `forceOpen` (đổi khẩu vị) từ nút "Đổi". */}
      <KhauViModal />

      {/* Kết sổ Cấp 6 (spec §6) — self-contained; opens itself once a Thực chiến
          lệnh's SELL fill is reconciled against its buy-time kế hoạch + SL/TP +
          quản lý vốn + đọc-5-lớp + đối-chiếu commitments, VÀ hàng `order_ketso`
          đã tồn tại (xem `openKetsoCap6`). */}
      <KetsoModalCap6
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 6 (spec §3) — self-contained: opens itself once
          progress shows 3/3, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap6 />

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
