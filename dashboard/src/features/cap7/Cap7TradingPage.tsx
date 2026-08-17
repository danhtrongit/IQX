import { useEffect, useRef, useState } from "react"
import { Message } from "@arco-design/web-react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` … `@/features/cap6` barrels) —
// those barrels re-export their `Cap*TradingPage`, which themselves import
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`; going
// through them here would create a module-graph cycle (same anti-cycle rationale
// `Cap6TradingPage.tsx`/`RightSidebar.tsx` already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress, useRecordKetso } from "@/features/cap1/hooks"
import { useCap1TradeLog } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "@/features/cap2/Cap2Context"
import { useDiemKyLuat } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
// Cấp 2's own (already-proven) client-side approximation of the 4 hành vi vi phạm
// kỷ luật — REUSED as-is, not re-implemented (Cấp 7 changes nothing about how
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
import { Cap5Provider, useCap5Events } from "@/features/cap5/Cap5Context"
import { useCap5TradeLog } from "@/features/cap5/tradeLogCap5"
import { VERDICT_LABEL } from "@/features/cap5/types"
import { cap6Api } from "@/features/cap6/api"
import { Cap6Provider, useCap6Events, type Cap6OrderEvent } from "@/features/cap6/Cap6Context"
import { useCap6TradeLog } from "@/features/cap6/tradeLogCap6"
import type { DoiChieuKetsoCap6 } from "@/features/cap6/KetsoModalCap6"
import { KIEU_OPTIONS, type KieuCoPhieu } from "@/features/cap6/types"
import { Cap7Provider, useCap7Events, type Cap7OrderEvent } from "./Cap7Context"
import { bandLuc } from "./docSoLenh"
import { GraduationModalCap7 } from "./GraduationModalCap7"
import { useEnterCap7, usePhienCap7 } from "./hooks"
import { KetsoModalCap7, type DocLucKetsoCap7, type KetsoDataCap7 } from "./KetsoModalCap7"
import type { Cap7TradeRecord } from "./tradeLogCap7"
import {
  HANH_VI_CO_LABEL,
  LUC_DOC_OPTIONS,
  type HanhViCo,
  type LucDocUser,
  type QuyTacCap7,
} from "./types"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 7 «Đọc sổ lệnh»"

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap6TradingPage`'s own
 * `todayYmd` (the client's only proxy for a fill's `trading_date`). */
function todayYmd(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Tên tiếng Việt của 1 kiểu — dùng CHÍNH bảng nhãn của `cap6/types.ts`. */
function kieuTenOf(kieu: KieuCoPhieu | null): string | null {
  if (!kieu) return null
  return KIEU_OPTIONS.find((o) => o.value === kieu)?.label ?? null
}

/**
 * Dựng khối "Đối chiếu — nhìn lại" của MỘT lệnh mua, từ `GET /cap6/goi-y`.
 * Mirror `Cap6TradingPage#resolveDoiChieu` (module-private ở đó) — Cấp 7 kế thừa
 * khối Đối chiếu NGUYÊN VẸN, và cùng lý do: `Cap6OrderEvent` chỉ mang những gì
 * user tự nhập, còn `kieu`/`nganh`/`lop_uu_tien`/`khop_goi_y` là do SERVER suy ra
 * theo đúng luật `POST /cap6/kehoach` đã ghi vào `order_kehoach`.
 *
 * ★ `khopGoiY === false` KHÔNG BAO GIỜ là "sai", và `null` KHÔNG BAO GIỜ được
 * hiện thành lệch (Cấp 6 spec §5/§10) — `KetsoModalCap7` render đúng như vậy.
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
 * `/dau-truong` — Cấp 7 «Đọc sổ lệnh» demo-trading shell (spec §0/§4/§8), mounted
 * by `DauTruongPage` once the user has graduated Cấp 6. Mirrors
 * `cap6/Cap6TradingPage.tsx`'s structure: SAME surrounding chrome + SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT wraps ALL
 * SEVEN of `Cap1Provider` … `Cap7Provider` (spec's "cộng dồn" principle: panel Cấp
 * 7 = panel Cấp 6 GIỮ NGUYÊN 100% + lớp phủ "Đọc sổ lệnh" trên chính sổ bid/ask
 * đã hiện từ Cấp 2, so `TradingPanel`'s Cấp 1 vùng mua, Cấp 2 `SlTpBlock`, Cấp 3
 * `QuanLyVonBlock`, Cấp 4 `Doc5LopBlock`, Cấp 5 `DungNgoaiButton` and Cấp 6
 * `DoiChieuBlock` must all stay active alongside Cấp 7's `DocSoLenhBlock`).
 */
export function Cap7TradingPage() {
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
                  <Cap7Provider>
                    <Cap7Terminal />
                  </Cap7Provider>
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
 * Kết sổ Cấp 7 — Cấp 1's kế hoạch fields + Cấp 2's SL/TP commitment + Cấp 3's
 * quản lý vốn commitment + Cấp 4's khối "Đọc 5 lớp" + Cấp 7's khối đọc lực. Cấp
 * 6's own block is tracked separately (it resolves asynchronously — see
 * `doiChieuBySymbolRef`). All buses fire for the SAME buy fill (see
 * `TradingPanel.tsx`), in cap1 → … → cap7 order. */
interface LastBuyCap7 {
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
  // ── Cấp 7: khối đọc lực (chỉ có khi mua TRONG PHIÊN và user đã ghi) ──
  lucChiSo: number | null
  lucDocUser: LucDocUser | null
  coCanhGiac: boolean
  hanhViCo: HanhViCo | null
}

/**
 * Khối "Đọc sổ lệnh — nhìn lại" của một lệnh vừa bán, dựng từ dữ liệu ghi lúc
 * MUA + `quy_tac` của server.
 *
 * ★★ **`docLucDung` và `dienBienPct` LUÔN `null` ở đây, có chủ đích.** Lệnh này
 * vừa được mua trong CHÍNH phiên làm việc hiện tại (`lastBuyBySymbolRef` chỉ nhớ
 * lệnh mua của phiên này), nên phiên đích để chấm còn chưa xảy ra: backend chấm
 * bằng giá đóng cửa thật `so_phien_cham` phiên sau ngày mua. Hàm này KHÔNG được
 * đoán hộ một phán quyết, nên nó để `null` và `KetsoModalCap7` render `null`
 * thành "chưa tới hạn chấm" (`pickCoachCap7` cũng tự trả `null`).
 *
 * ★ Kết quả chấm THẬT thì `KetsoModalCap7` tự đọc bằng
 * `GET /cap7/kehoach/{order_id}` (chính lần đọc đó chạy pass chấm của server) và
 * ghi đè khối này qua `mergeDocLucCap7` — nhờ vậy một lệnh mở lại Kết sổ sau khi
 * đã tới hạn hiện được phán quyết + đoạn coach Cấp 7. Endpoint đó 404 khi user
 * chưa có hàng tiến độ Cấp 7 và mọi lỗi đều rơi lại về đúng khối dựng ở đây.
 *
 * ★ `quyTac` chưa về cũng không còn là ngõ cụt: hàm này trả `null` (xem dưới),
 * nhưng nếu server CÓ dữ liệu Cấp 7 cho lệnh thì `mergeDocLucCap7` vẫn dựng được
 * khối từ payload của server.
 *
 * ★ `giaCo` LUÔN `null`: backend KHÔNG lưu mức nào của sổ đã kích cờ (chỉ lưu
 * `co_canh_giac_lenh_gia` + `hanh_vi_co`), và `Cap7OrderEvent` cũng không mang
 * theo giá đó. Copy của modal bỏ hẳn cụm "ở {giá}" thay vì bịa một mức giá.
 *
 * `quyTac` chưa về → trả `null` (bỏ hẳn khối) thay vì in `soPhienCham = 0`, vì
 * câu "hệ chấm bằng giá đóng cửa 0 phiên sau khi mua" là một lời nói dối. Trên
 * thực tế không xảy ra: user chỉ ghi được đọc lực khi `GET /cap7/phien` đã trả về
 * `trong_phien === true` (cùng query key, cùng cache).
 */
function buildDocLucCap7(
  buy: LastBuyCap7,
  quyTac: QuyTacCap7 | null | undefined,
): DocLucKetsoCap7 | null {
  if (buy.lucChiSo == null || buy.lucDocUser == null) return null
  if (!quyTac) return null
  const band = bandLuc(buy.lucChiSo, quyTac)
  return {
    lucChiSo: buy.lucChiSo,
    lucBand: band,
    lucBandTen: band ? (quyTac.bands.find((b) => b.ma === band)?.ten ?? null) : null,
    lucDocUser: buy.lucDocUser,
    lucDocUserTen: LUC_DOC_OPTIONS.find((o) => o.value === buy.lucDocUser)?.label ?? null,
    docLucDung: null,
    dienBienPct: null,
    soPhienCham: quyTac.so_phien_cham,
    deadBandPct: quyTac.dead_band_pct,
    coCanhGiac: buy.coCanhGiac,
    hanhViCo: buy.hanhViCo,
    hanhViCoTen: buy.hanhViCo ? HANH_VI_CO_LABEL[buy.hanhViCo] : null,
    giaCo: null,
    giaiThich: null,
  }
}

function Cap7Terminal() {
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { registerHandlers: registerCap3Handlers } = useCap3Events()
  const { registerHandlers: registerCap4Handlers } = useCap4Events()
  const { registerHandlers: registerCap5Handlers } = useCap5Events()
  const { registerHandlers: registerCap6Handlers } = useCap6Events()
  const { isCap7Active, registerHandlers: registerCap7Handlers } = useCap7Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  // `quy_tac` (số phiên chấm + dead band + tên band) — dùng CHUNG một query key
  // với `TradingPanel`, nên khối Kết sổ nói đúng bộ ngưỡng mà server đã dùng để
  // chấm chính lệnh này. FE KHÔNG BAO GIỜ tự khai ngưỡng.
  const { data: cap7Phien } = usePhienCap7(isCap7Active)
  const { activePanel, setActivePanel } = useSidebar()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()
  const { record: recordCap3Trade } = useCap3TradeLog()
  const { record: recordCap4Trade } = useCap4TradeLog()
  const { record: recordCap5Trade } = useCap5TradeLog()
  const { record: recordCap6Trade } = useCap6TradeLog()
  const recordKetsoCap1 = useRecordKetso()
  const enterCap7 = useEnterCap7()

  /**
   * ★ `POST /cap7/enter` NGAY khi vào trang, idempotent.
   *
   * `DauTruongPage` cũng gọi nó, nhưng CHỈ khi `GET /cap7/progress` trả null lúc
   * nó fetch. Nếu hàng `cap7_progress` chưa có mà trang này đã mount (vd. user
   * vừa tốt nghiệp Cấp 6 trong phiên này, hoặc progress fetch chậm/lỗi), thì
   * `GET /cap7/phien` và `POST /cap7/kehoach` sẽ 404 — `TradingPanel` await call
   * đó trong cùng một `try`, nên MỌI `onOrderFilled` phía sau bị nuốt và KHÔNG
   * Kết sổ nào của bất kỳ cấp nào mở ra (Cấp 6 FE1 đã gặp). Gọi lại ở đây là bảo
   * hiểm rẻ: server trả về hàng sẵn có khi đã tồn tại.
   */
  const enterAttemptedRef = useRef(false)
  useEffect(() => {
    if (enterAttemptedRef.current) return
    enterAttemptedRef.current = true
    enterCap7.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Journey bar sticky trên đầu — same override/restore pattern as
  // `Cap6Terminal`/`Cap5Terminal`/… (the sidebar's `SidebarProvider` is a single
  // app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký dùng chung (Cấp 2's score log —
  // Cấp 3-7 KHÔNG có nhật ký điểm riêng) bất cứ khi nào `useDiemKyLuat` resolves
  // a REAL (non-null) score. Never records a fabricated 0.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ Cấp 7 (spec §6 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging ALL SIX lower buses' buy-time data — mirrors
  // `Cap6Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap7>>(new Map())
  /**
   * Khối Đối chiếu của lệnh mua đang mở, theo mã — lưu PROMISE chứ không phải
   * giá trị: nó cần một round-trip `GET /cap6/goi-y`, còn `onOrderFilled` là
   * đồng bộ. `openKetsoCap7` await promise này, nên một lệnh bán ngay sau lệnh
   * mua vẫn nhận đủ khối Đối chiếu thay vì mất trắng vì đua.
   */
  const doiChieuBySymbolRef = useRef<Map<string, Promise<DoiChieuKetsoCap6 | null>>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap7 | null>(null)

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
          // ★ Reset, KHÔNG kế thừa: khối đọc lực là của MỘT snapshot sổ lệnh cụ
          // thể. Để nó dây từ lệnh mua trước sang lệnh mua sau sẽ gán một lần
          // đọc cũ cho một lệnh mà user không hề đọc gì.
          lucChiSo: null,
          lucDocUser: null,
          coCanhGiac: false,
          hanhViCo: null,
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

  // Cấp 4's bus is used for the BUY-time khối "Đọc 5 lớp" ONLY here: at Cấp 7 the
  // SELL is owned by Cấp 7's own bus (below), which opens Kết sổ Cấp 7 — Kết sổ
  // Cấp 4/5/6 must NOT also open for the same fill.
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

  useEffect(() => {
    registerCap5Handlers({
      // Analytics Cấp 5 §8 (`cap5_verdict_confirm` / `cap5_verdict_override`) —
      // `KetsoModalCap7` vẫn bắn event này khi user chốt phân loại 4 ô (khối Cấp
      // 5 kế thừa nguyên vẹn), nên Ghi nhận nhỏ của Cấp 5 được giữ y nguyên.
      // KHÔNG đăng ký `onOrderFilled` ở bus Cấp 5: lệnh bán do bus Cấp 7 xử lý,
      // nếu đăng ký cả hai thì 2 màn Kết sổ cùng mở cho một lệnh.
      onVerdictSettled: (verdict, daSua) => {
        Message.success(
          `Đã ghi phân loại: ${VERDICT_LABEL[verdict]} — cập nhật «Tỷ lệ quyết định đúng» ở Phân tích danh mục.` +
            (daSua
              ? " Bạn thấy khác hệ: cả hai verdict đều được lưu — đây là dữ liệu trung tính, không phải điểm trừ."
              : ""),
        )
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCap5Handlers])

  // Cấp 6's bus: BUY only (khối Đối chiếu). Bán vẫn do bus Cấp 7 xử lý.
  useEffect(() => {
    registerCap6Handlers({
      onOrderFilled: (order: Cap6OrderEvent) => {
        if (order.side !== "buy") return
        const key = order.symbol.toUpperCase()
        // Lệnh KHÔNG mâu thuẫn → `TradingPanel` không gửi khối Đối chiếu → xoá
        // khối cũ của mã này (đừng để lệnh trước dây sang lệnh sau).
        if (!order.lopQuyetDinh) {
          doiChieuBySymbolRef.current.delete(key)
          return
        }
        doiChieuBySymbolRef.current.set(key, resolveDoiChieu(order))
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCap6Handlers])

  /**
   * Reconciles a Cấp 7 SELL fill into Kết sổ Cấp 7 — and owns the ORDERING FIX
   * inherited from Cấp 5/6 (do NOT reorder).
   *
   * ★ **`POST /cap1/ketso` PHẢI xong TRƯỚC khi modal mở.** Backend Cấp 5 (khối
   * phân loại 4 ô mà Cấp 6/7 kế thừa nguyên vẹn) đọc/ghi verdict trên CHÍNH hàng
   * `order_ketso` mà `POST /cap1/ketso` tạo: cả `GET /cap5/verdict/{order_id}` và
   * `POST /cap5/ketso` trả **404** khi hàng đó chưa tồn tại. Ở Cấp 1-4 hàng đó
   * chỉ được tạo khi user ĐÓNG màn Kết sổ — quá muộn: cổng `Đóng kết sổ ✓`
   * fail-closed sẽ không mở, mà modal `closable={false}` không có nút huỷ →
   * **user kẹt trong màn không đóng được**. Vì vậy trang này kết sổ Cấp 1 NGAY
   * khi lệnh bán khớp, rồi mới mở modal.
   *
   * Lỗi của call này bị bỏ qua CÓ CHỦ ĐÍCH: 409 "Lệnh này đã kết sổ" là trạng
   * thái bình thường, và nếu call thất bại thật thì modal vẫn phải mở — nó có lối
   * ra riêng khi verdict không lấy được (xem `KetsoModalCap7#handleEscape`).
   */
  const openKetsoCap7 = async (order: Cap7OrderEvent) => {
    const key = order.symbol.toUpperCase()
    const buy = lastBuyBySymbolRef.current.get(key)
    // No tracked buy THIS session, or one of the commitments never resolved (hard
    // gates upstream should prevent this, but guard anyway) — nothing to
    // reconcile into Kết sổ Cấp 7 yet.
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
      // Cổng cứng Cấp 4 (giữ nguyên ở Cấp 7): a lệnh ALWAYS has all 5 lớp rated —
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
      doiChieu,
      docLuc: buildDocLucCap7(buy, cap7Phien?.quy_tac),
    })
  }

  useEffect(() => {
    registerCap7Handlers({
      onOrderFilled: (order: Cap7OrderEvent) => {
        const key = order.symbol.toUpperCase()
        if (order.side === "buy") {
          const existing = lastBuyBySymbolRef.current.get(key)
          if (!existing) return
          // `TradingPanel` chỉ gắn 4 trường này khi user ĐÃ ghi bước đọc lực
          // trong phiên (spec §4 SOFT — mua ngoài giờ / sổ quá mỏng thì không có
          // gì để gắn). Không có → giữ nguyên `null` đã reset ở handler Cấp 1.
          if (order.lucChiSo == null || order.lucDocUser == null) return
          lastBuyBySymbolRef.current.set(key, {
            ...existing,
            lucChiSo: order.lucChiSo,
            lucDocUser: order.lucDocUser,
            coCanhGiac: Boolean(order.coCanhGiac),
            hanhViCo: order.hanhViCo ?? null,
          })
          return
        }
        void openKetsoCap7(order)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCap7Handlers, cap7Phien?.quy_tac])

  /**
   * Records the closed trade into Cấp 1's + 2's + 3's + 4's + 5's + 6's
   * (unchanged) trade logs. The Cấp 7 log is written by `KetsoModalCap7` ITSELF
   * (documented contract in that module — it owns the `Cap7TradeRecord` it just
   * reconciled), so this must NOT append it a second time. `Cap7TradeRecord` is a
   * superset of all six lower records, so it's passed straight through and every
   * earlier cấp's Phân tích danh mục block keeps working.
   */
  const handleKetsoRecorded = (rec: Cap7TradeRecord) => {
    recordCap1Trade(rec)
    recordCap2Trade(rec)
    recordCap3Trade(rec)
    recordCap4Trade(rec)
    recordCap5Trade(rec)
    recordCap6Trade(rec)
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

      {/* Top bar (mirrors Cấp 6's — spec §1 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 7 · ĐỌC SỔ LỆNH</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Màn chọn khẩu vị rủi ro BẮT BUỘC vẫn áp dụng ở Cấp 7 (Cấp 3 spec §5.2 —
          khẩu vị áp cho MỌI lệnh, và Cấp 7 giữ nguyên khối Quản lý vốn). Đây là
          instance DUY NHẤT của bản bắt buộc; `TradingPanel` chỉ mount bản
          `forceOpen` (đổi khẩu vị) từ nút "Đổi". */}
      <KhauViModal />

      {/* Kết sổ Cấp 7 (spec §6) — self-contained; opens itself once a Thực chiến
          lệnh's SELL fill is reconciled against its buy-time kế hoạch + SL/TP +
          quản lý vốn + đọc-5-lớp + đối-chiếu + đọc-lực commitments, VÀ hàng
          `order_ketso` đã tồn tại (xem `openKetsoCap7`). */}
      <KetsoModalCap7
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 7 (spec §3) — self-contained: opens itself once
          progress shows 3/3, closes itself once `graduated_at` comes back. */}
      <GraduationModalCap7 />

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
