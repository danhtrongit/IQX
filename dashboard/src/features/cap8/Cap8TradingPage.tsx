import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Message, Modal, Input, Button } from "@arco-design/web-react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { IconBrainCircuit } from "@/shared/icons"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Concrete-file imports (NOT the `@/features/cap1` … `@/features/cap7` barrels) —
// those barrels re-export their `Cap*TradingPage`, which themselves import
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`; going
// through them here would create a module-graph cycle (same anti-cycle rationale
// `Cap7TradingPage.tsx`/`RightSidebar.tsx` already document).
import { Cap1Provider, useCap1Events, type Cap1OrderEvent } from "@/features/cap1/Cap1Context"
import { useCap1Progress, useRecordKetso } from "@/features/cap1/hooks"
import { useCap1TradeLog } from "@/features/cap1/tradeLog"
import { countTradingSessions } from "@/features/cap1/KetsoModalCap1"
import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import { Cap2Provider, useCap2Events, type Cap2OrderEvent } from "@/features/cap2/Cap2Context"
import { useCap2Progress, useDiemKyLuat } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
// Cấp 2's own (already-proven) client-side approximation of the 4 hành vi vi phạm
// kỷ luật — REUSED as-is, not re-implemented (Cấp 8 changes nothing about how
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
import { Cap7Provider, useCap7Events, type Cap7OrderEvent } from "@/features/cap7/Cap7Context"
import { bandLuc } from "@/features/cap7/docSoLenh"
import { usePhienCap7 } from "@/features/cap7/hooks"
import type { DocLucKetsoCap7 } from "@/features/cap7/KetsoModalCap7"
import type { Cap7TradeRecord } from "@/features/cap7/tradeLogCap7"
import {
  HANH_VI_CO_LABEL,
  LUC_DOC_OPTIONS,
  type HanhViCo,
  type LucDocUser,
  type QuyTacCap7,
} from "@/features/cap7/types"
import { Cap8Provider, useCap8Events, type Cap8OrderEvent } from "./Cap8Context"
import { GraduationModalCap8 } from "./GraduationModalCap8"
import { useEnterCap8 } from "./hooks"
import { KetsoModalCap8, type KetsoDataCap8, type KiemTraKetsoCap8 } from "./KetsoModalCap8"
import { HANH_VI_CANH_BAO_LABEL, LOAI_CANH_BAO_LABEL } from "./types"
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 8 «Quản trị rủi ro danh mục»"

/** Mã mặc định của terminal — cũng là mã để quay về khi user huỷ bước chọn mã. */
const DEFAULT_SYMBOL = "VNM"

// Indices (whole-market gauges) — AI Insight needs a specific listed stock, and
// an index is not something a lệnh MUA can be placed on either.
// Duplicated from `Cap7TradingPage`/… (not imported across features) — same
// rationale as those: a tiny, self-contained guard.
const INDEX_CODES = new Set(["VNINDEX", "VN30", "HNX", "HNXINDEX", "UPCOM", "UPCOMINDEX", "HNX30"])

function isIndexSymbol(s: string): boolean {
  return INDEX_CODES.has(s.toUpperCase())
}

/** Mã cổ phiếu hợp lệ để chọn: 2-10 ký tự chữ/số VÀ không phải chỉ số thị trường. */
function isTradeableSymbol(s: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(s) && !isIndexSymbol(s)
}

/** `YYYY-MM-DD` for "today", browser-local time — mirrors `Cap7TradingPage`'s own
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
 * Mirror `Cap7TradingPage#resolveDoiChieu` (module-private ở đó, như nó vốn là
 * bản mirror của `Cap6TradingPage`) — Cấp 8 kế thừa khối Đối chiếu NGUYÊN VẸN, và
 * cùng lý do: `Cap6OrderEvent` chỉ mang những gì user tự nhập, còn
 * `kieu`/`nganh`/`lop_uu_tien`/`khop_goi_y` là do SERVER suy ra theo đúng luật
 * `POST /cap6/kehoach` đã ghi vào `order_kehoach`.
 *
 * ★ `khopGoiY === false` KHÔNG BAO GIỜ là "sai", và `null` KHÔNG BAO GIỜ được
 * hiện thành lệch (Cấp 6 spec §5/§10) — `KetsoModalCap8` render đúng như vậy.
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
 * `/dau-truong` — Cấp 8 «Quản trị rủi ro danh mục» demo-trading shell (spec
 * §0/§4/§8), mounted by `DauTruongPage` once the user has graduated Cấp 7, and
 * the TERMINAL shell of the whole program (there is no Cấp 9 page to route on
 * to). Mirrors `cap7/Cap7TradingPage.tsx`'s structure: SAME surrounding chrome +
 * SAME, untouched `CenterPanel`/`RightSidebar`/`RightToolbar` terminal — BUT
 * wraps ALL EIGHT of `Cap1Provider` … `Cap8Provider` (spec's "cộng dồn"
 * principle: panel Cấp 8 = panel Cấp 7 GIỮ NGUYÊN 100% + bước "Kiểm tra danh
 * mục" chèn ngay trước xác nhận MUA, so `TradingPanel`'s Cấp 1 vùng mua, Cấp 2
 * `SlTpBlock`, Cấp 3 `QuanLyVonBlock`, Cấp 4 `Doc5LopBlock`, Cấp 5
 * `DungNgoaiButton`, Cấp 6 `DoiChieuBlock` and Cấp 7 `DocSoLenhBlock` must all
 * stay active alongside Cấp 8's `KiemTraDanhMucBlock`).
 */
export function Cap8TradingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = prevTitle
    }
  }, [])

  return (
    <SymbolProvider symbol={DEFAULT_SYMBOL}>
      <Cap1Provider>
        <Cap2Provider>
          <Cap3Provider>
            <Cap4Provider>
              <Cap5Provider>
                <Cap6Provider>
                  <Cap7Provider>
                    <Cap8Provider>
                      <Cap8Terminal />
                    </Cap8Provider>
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
 * Kết sổ Cấp 8 — Cấp 1's kế hoạch fields + Cấp 2's SL/TP commitment + Cấp 3's
 * quản lý vốn commitment + Cấp 4's khối "Đọc 5 lớp" + Cấp 7's khối đọc lực + Cấp
 * 8's khối Kiểm tra danh mục. Cấp 6's own block is tracked separately (it
 * resolves asynchronously — see `doiChieuBySymbolRef`). All buses fire for the
 * SAME buy fill (see `TradingPanel.tsx`), in cap1 → … → cap8 order. */
interface LastBuyCap8 {
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
  // ── Cấp 8: khối Kiểm tra danh mục (chỉ có khi bước đó CHẠY được) ──
  kiemTra: KiemTraKetsoCap8 | null
}

/**
 * Khối "Đọc sổ lệnh — nhìn lại" của một lệnh vừa bán, dựng từ dữ liệu ghi lúc
 * MUA + `quy_tac` của server. Mirror `Cap7TradingPage#buildDocLucCap7` (nó
 * module-private ở đó, đúng như `resolveDoiChieu` đã module-private ở Cấp 6 rồi
 * được mirror sang Cấp 7) — Cấp 8 kế thừa khối Đọc sổ lệnh NGUYÊN VẸN.
 *
 * ★★ **`docLucDung` và `dienBienPct` LUÔN `null` ở đây, có chủ đích.** Lệnh này
 * vừa được mua trong CHÍNH phiên làm việc hiện tại (`lastBuyBySymbolRef` chỉ nhớ
 * lệnh mua của phiên này), nên phiên đích để chấm còn chưa xảy ra: backend chấm
 * bằng giá đóng cửa thật `so_phien_cham` phiên sau ngày mua. Hàm này KHÔNG được
 * đoán hộ một phán quyết, nên nó để `null` và `KetsoModalCap8` render `null`
 * thành "chưa tới hạn chấm".
 *
 * ★ `giaCo` LUÔN `null`: backend KHÔNG lưu mức nào của sổ đã kích cờ (chỉ lưu
 * `co_canh_giac_lenh_gia` + `hanh_vi_co`), và `Cap7OrderEvent` cũng không mang
 * theo giá đó. Copy của modal bỏ hẳn cụm "ở {giá}" thay vì bịa một mức giá.
 *
 * `quyTac` chưa về → trả `null` (bỏ hẳn khối) thay vì in `soPhienCham = 0`, vì
 * câu "hệ chấm bằng giá đóng cửa 0 phiên sau khi mua" là một lời nói dối.
 */
function buildDocLucCap7(
  buy: LastBuyCap8,
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

/**
 * Khối "Kiểm tra danh mục — nhìn lại" của một lệnh mua, dựng từ CHÍNH những gì
 * bước kiểm tra đã hiện cho user lúc đặt lệnh (`GET /cap8/kiem-tra`, chuyển qua
 * `Cap8OrderEvent` bởi `TradingPanel`).
 *
 * ★ **`hanhViCanhBao` là cổng.** `undefined` = bước Kiểm tra danh mục KHÔNG chạy
 * được cho lệnh này (mua trước khi Cấp 8 ship, hoặc `GET /cap8/kiem-tra` lỗi và
 * block degrade OPEN) → trả `null`, và modal bỏ hẳn khối, im lặng. Dựng một khối
 * rỗng sẽ bắt user đoán; nói "không có cảnh báo nào" sẽ là một lời khen dựa trên
 * phép đo CHƯA BAO GIỜ CHẠY.
 *
 * ★★ **KHÔNG `?? 0` Ở BẤT KỲ ĐÂU.** `donNganhPct` / `tongRuiRoPct` /
 * `soViTheThieuCatLo` đều là `number | null`, và `null` nghĩa là CHƯA TÍNH ĐƯỢC.
 * Riêng `soViTheThieuCatLo` còn nguy hiểm hơn: modal render `0` thành câu khẳng
 * định "Mọi vị thế lúc đó đều đã có cắt lỗ" — một điều không ai có cơ sở để nói
 * khi hệ chỉ đơn giản là không ghi lại con số đó. Đây đúng là bài học của Cấp 8
 * (chưa biết ≠ bằng 0), nên chỗ dựng khối không được phép vi phạm nó.
 *
 * ★ `canhBaoText` ghép bằng CHÍNH bảng nhãn `LOAI_CANH_BAO_LABEL` (mirror của
 * `LOAI_CANH_BAO_LABELS` backend) và cùng dấu ` · ` mà `service.record_kehoach`
 * dùng, nên câu "Lúc mua: ⚠ …" đọc y hệt bản server tự sinh.
 *
 * ★ `giaiThich` để `null`: câu §C12c một dòng là do SERVER sinh trên
 * `order_kehoach` (`POST /cap8/kehoach`), và trang này không giữ phản hồi đó.
 * Modal bỏ hẳn dòng ấy khi `null` — thà thiếu một câu còn hơn tự viết một câu
 * rồi trình bày nó như câu của hệ.
 */
function buildKiemTraCap8(order: Cap8OrderEvent): KiemTraKetsoCap8 | null {
  const hanhVi = order.hanhViCanhBao ?? null
  if (hanhVi == null) return null
  const canhBao = order.danhMucCanhBao ?? null
  const canhBaoTen = canhBao ? canhBao.map((ma) => LOAI_CANH_BAO_LABEL[ma]) : null
  return {
    canhBao,
    canhBaoTen,
    canhBaoText: canhBaoTen ? canhBaoTen.join(" · ") : "",
    hanhVi,
    hanhViTen: HANH_VI_CANH_BAO_LABEL[hanhVi],
    donNganhPct: order.donNganhPct ?? null,
    nganh: order.nganh ?? null,
    tuongQuanCaoVoi: order.tuongQuanCaoVoi ?? null,
    tongRuiRoPct: order.tongRuiRoPct ?? null,
    soViTheThieuCatLo: order.soViTheThieuCatLo ?? null,
    giaiThich: null,
  }
}

/**
 * Thân của bước chọn mã sau «Chọn mã khác» (spec §4) — xem docstring ở
 * `Cap8Terminal`. Là component RIÊNG và chỉ mount khi đang mở, nên ô nhập mã
 * luôn bắt đầu rỗng mà không cần một effect nào đi dọn state hộ.
 */
function ChonMaKhacBody({
  onPick,
  onCancel,
}: {
  onPick: (ma: string) => void
  onCancel: () => void
}) {
  const [ma, setMa] = useState("")
  const trimmed = ma.trim().toUpperCase()
  const hopLe = isTradeableSymbol(trimmed)
  const submit = () => {
    if (!hopLe) return
    onPick(trimmed)
  }

  return (
    <div data-testid="cap8-chon-ma">
      <div className="text-base font-semibold text-[var(--color-text-1)]">Chọn mã khác để xem</div>
      <div className="mt-1 text-xs text-[var(--color-text-3)]">
        Bạn vừa bỏ mã đang chọn ở bước Kiểm tra danh mục. Nhập mã cổ phiếu bạn muốn xem tiếp (vd.
        HPG, FPT, VCB) — hoặc quay lại mã đang xem trước đó.
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          value={ma}
          onChange={(v) => setMa(v.toUpperCase())}
          onPressEnter={submit}
          placeholder="VD: HPG"
          maxLength={10}
          autoFocus
          className="flex-1 font-mono uppercase tracking-wide"
        />
        <Button type="primary" onClick={submit} disabled={!hopLe} data-testid="cap8-chon-ma-ok">
          Xem mã này
        </Button>
      </div>
      <div className="mt-2 text-right">
        <Button size="mini" onClick={onCancel} data-testid="cap8-chon-ma-huy">
          Quay lại mã trước đó
        </Button>
      </div>
    </div>
  )
}

function Cap8Terminal() {
  const navigate = useNavigate()
  const { isCap1Active, registerHandlers: registerCap1Handlers } = useCap1Events()
  const { isCap2Active, registerHandlers: registerCap2Handlers } = useCap2Events()
  const { registerHandlers: registerCap3Handlers } = useCap3Events()
  const { registerHandlers: registerCap4Handlers } = useCap4Events()
  const { registerHandlers: registerCap5Handlers } = useCap5Events()
  const { registerHandlers: registerCap6Handlers } = useCap6Events()
  const { isCap7Active, registerHandlers: registerCap7Handlers } = useCap7Events()
  const { registerHandlers: registerCap8Handlers } = useCap8Events()
  const { data: cap1Progress } = useCap1Progress(isCap1Active)
  const { data: cap2Progress } = useCap2Progress(isCap2Active)
  const { data: diemKyLuat } = useDiemKyLuat(undefined, isCap2Active)
  // `quy_tac` (số phiên chấm + dead band + tên band) — dùng CHUNG một query key
  // với `TradingPanel`, nên khối Kết sổ nói đúng bộ ngưỡng mà server đã dùng để
  // chấm chính lệnh này. FE KHÔNG BAO GIỜ tự khai ngưỡng.
  const { data: cap7Phien } = usePhienCap7(isCap7Active)
  const { activePanel, setActivePanel } = useSidebar()
  // ★ CHỈ `setSymbol`: bước «Chọn mã khác» nay mở bằng sự kiện bus, nên trang này
  // không còn đọc `symbol` để suy ra trạng thái "không còn mã nào" — và mã đang
  // xem không bao giờ bị xoá nữa (xem docstring của `chonMaOpen` bên dưới).
  const { setSymbol } = useSymbol()
  const { trades: cap1Trades, record: recordCap1Trade } = useCap1TradeLog()
  const { record: recordCap2Trade, recordScore: recordCap2Score } = useCap2TradeLog()
  const { record: recordCap3Trade } = useCap3TradeLog()
  const { record: recordCap4Trade } = useCap4TradeLog()
  const { record: recordCap5Trade } = useCap5TradeLog()
  const { record: recordCap6Trade } = useCap6TradeLog()
  const recordKetsoCap1 = useRecordKetso()
  const enterCap8 = useEnterCap8()

  /**
   * ★★ `POST /cap8/enter` NGAY khi vào trang, idempotent.
   *
   * `DauTruongPage` cũng gọi nó, nhưng CHỈ khi `GET /cap8/progress` trả null lúc
   * nó fetch. Nếu hàng `cap8_progress` chưa có mà trang này đã mount (vd. user
   * vừa tốt nghiệp Cấp 7 trong phiên này, hoặc progress fetch chậm/lỗi), thì
   * `GET /cap8/kiem-tra` 404 và MỌI phiên mở ra với dòng "chưa chạy được bước
   * Kiểm tra danh mục" — bước trung tâm của cả cấp biến mất, dù `POST
   * /cap8/kehoach` có nuốt lỗi của nó. Gọi lại ở đây là bảo hiểm rẻ: server trả
   * về hàng sẵn có khi đã tồn tại.
   */
  const enterAttemptedRef = useRef(false)
  useEffect(() => {
    if (enterAttemptedRef.current) return
    enterAttemptedRef.current = true
    enterCap8.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Journey bar sticky trên đầu — same override/restore pattern as
  // `Cap7Terminal`/`Cap6Terminal`/… (the sidebar's `SidebarProvider` is a single
  // app-root instance shared by every route).
  const prevPanelRef = useRef(activePanel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // Ghi nhận điểm kỷ luật hằng ngày vào nhật ký dùng chung (Cấp 2's score log —
  // Cấp 3-8 KHÔNG có nhật ký điểm riêng) bất cứ khi nào `useDiemKyLuat` resolves
  // a REAL (non-null) score. Never records a fabricated 0.
  useEffect(() => {
    if (!diemKyLuat) return
    if (diemKyLuat.diem == null || diemKyLuat.xep_loai == null) return
    recordCap2Score({ ngay: diemKyLuat.ngay, diem: diemKyLuat.diem, xepLoai: diemKyLuat.xep_loai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diemKyLuat?.ngay, diemKyLuat?.diem, diemKyLuat?.xep_loai])

  // Kết sổ Cấp 8 (spec §6 — opens when a Thực-chiến lệnh is sold). Keyed by
  // symbol, merging ALL SEVEN lower buses' buy-time data — mirrors
  // `Cap7Terminal#lastBuyBySymbolRef`, one level up.
  const lastBuyBySymbolRef = useRef<Map<string, LastBuyCap8>>(new Map())
  /**
   * Khối Đối chiếu của lệnh mua đang mở, theo mã — lưu PROMISE chứ không phải
   * giá trị: nó cần một round-trip `GET /cap6/goi-y`, còn `onOrderFilled` là
   * đồng bộ. `openKetsoCap8` await promise này, nên một lệnh bán ngay sau lệnh
   * mua vẫn nhận đủ khối Đối chiếu thay vì mất trắng vì đua.
   */
  const doiChieuBySymbolRef = useRef<Map<string, Promise<DoiChieuKetsoCap6 | null>>>(new Map())
  const ketsoCountRef = useRef(0)
  const [ketso, setKetso] = useState<KetsoDataCap8 | null>(null)

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
          // ★ Reset, cùng lý do: khối Kiểm tra danh mục là ảnh chụp của danh mục
          // TẠI LỆNH ĐÓ. Dây sang lệnh sau sẽ gán một cảnh báo cũ cho một lệnh
          // chưa từng được kiểm tra.
          kiemTra: null,
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

  // Cấp 4's bus is used for the BUY-time khối "Đọc 5 lớp" ONLY here: at Cấp 8 the
  // SELL is owned by Cấp 8's own bus (below), which opens Kết sổ Cấp 8 — Kết sổ
  // Cấp 4/5/6/7 must NOT also open for the same fill.
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
      // `KetsoModalCap8` vẫn bắn event này khi user chốt phân loại 4 ô (khối Cấp
      // 5 kế thừa nguyên vẹn), nên Ghi nhận nhỏ của Cấp 5 được giữ y nguyên.
      // KHÔNG đăng ký `onOrderFilled` ở bus Cấp 5: lệnh bán do bus Cấp 8 xử lý,
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

  // Cấp 6's bus: BUY only (khối Đối chiếu). Bán vẫn do bus Cấp 8 xử lý.
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

  // Cấp 7's bus: BUY only (khối Đọc sổ lệnh). Bán vẫn do bus Cấp 8 xử lý.
  useEffect(() => {
    registerCap7Handlers({
      onOrderFilled: (order: Cap7OrderEvent) => {
        if (order.side !== "buy") return
        const key = order.symbol.toUpperCase()
        const existing = lastBuyBySymbolRef.current.get(key)
        if (!existing) return
        // `TradingPanel` chỉ gắn 4 trường này khi user ĐÃ ghi bước đọc lực trong
        // phiên (Cấp 7 spec §4 SOFT — mua ngoài giờ / sổ quá mỏng thì không có gì
        // để gắn). Không có → giữ nguyên `null` đã reset ở handler Cấp 1.
        if (order.lucChiSo == null || order.lucDocUser == null) return
        lastBuyBySymbolRef.current.set(key, {
          ...existing,
          lucChiSo: order.lucChiSo,
          lucDocUser: order.lucDocUser,
          coCanhGiac: Boolean(order.coCanhGiac),
          hanhViCo: order.hanhViCo ?? null,
        })
      },
    })
  }, [registerCap7Handlers])

  /**
   * Reconciles a Cấp 8 SELL fill into Kết sổ Cấp 8 — and owns the ORDERING FIX
   * inherited from Cấp 5/6/7 (do NOT reorder).
   *
   * ★ **`POST /cap1/ketso` PHẢI xong TRƯỚC khi modal mở.** Backend Cấp 5 (khối
   * phân loại 4 ô mà Cấp 6/7/8 kế thừa nguyên vẹn) đọc/ghi verdict trên CHÍNH
   * hàng `order_ketso` mà `POST /cap1/ketso` tạo: cả `GET /cap5/verdict/{order_id}`
   * và `POST /cap5/ketso` trả **404** khi hàng đó chưa tồn tại. Ở Cấp 1-4 hàng đó
   * chỉ được tạo khi user ĐÓNG màn Kết sổ — quá muộn: cổng `Đóng kết sổ ✓`
   * fail-closed sẽ không mở, mà modal `closable={false}` không có nút huỷ →
   * **user kẹt trong màn không đóng được**. Vì vậy trang này kết sổ Cấp 1 NGAY
   * khi lệnh bán khớp, rồi mới mở modal.
   *
   * Lỗi của call này bị bỏ qua CÓ CHỦ ĐÍCH: 409 "Lệnh này đã kết sổ" là trạng
   * thái bình thường, và nếu call thất bại thật thì modal vẫn phải mở — nó có lối
   * ra riêng khi verdict không lấy được (xem `KetsoModalCap8#handleEscape`).
   */
  const openKetsoCap8 = async (order: Cap8OrderEvent) => {
    const key = order.symbol.toUpperCase()
    const buy = lastBuyBySymbolRef.current.get(key)
    // No tracked buy THIS session, or one of the commitments never resolved (hard
    // gates upstream should prevent this, but guard anyway) — nothing to
    // reconcile into Kết sổ Cấp 8 yet.
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
      // Cổng cứng Cấp 4 (giữ nguyên ở Cấp 8): a lệnh ALWAYS has all 5 lớp rated —
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
      kiemTra: buy.kiemTra,
    })
  }

  useEffect(() => {
    registerCap8Handlers({
      onOrderFilled: (order: Cap8OrderEvent) => {
        const key = order.symbol.toUpperCase()
        if (order.side === "buy") {
          const existing = lastBuyBySymbolRef.current.get(key)
          if (!existing) return
          // `null` khi bước Kiểm tra danh mục không chạy được — giữ nguyên giá
          // trị đã reset ở handler Cấp 1 thay vì ghi đè bằng một khối rỗng.
          const kiemTra = buildKiemTraCap8(order)
          if (!kiemTra) return
          lastBuyBySymbolRef.current.set(key, { ...existing, kiemTra })
          return
        }
        void openKetsoCap8(order)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCap8Handlers, cap7Phien?.quy_tac])

  /**
   * Records the closed trade into Cấp 1's + 2's + 3's + 4's + 5's + 6's
   * (unchanged) trade logs. The Cấp 7 log is written by `KetsoModalCap8` ITSELF
   * (documented contract in that module — Cấp 8 has NO trade log of its own and
   * reuses `useCap7TradeLog`/`Cap7TradeRecord` unchanged), so this must NOT
   * append it a second time. `Cap7TradeRecord` is a superset of all six lower
   * records, so it's passed straight through and every earlier cấp's Phân tích
   * danh mục block keeps working.
   */
  const handleKetsoRecorded = (rec: Cap7TradeRecord) => {
    recordCap1Trade(rec)
    recordCap2Trade(rec)
    recordCap3Trade(rec)
    recordCap4Trade(rec)
    recordCap5Trade(rec)
    recordCap6Trade(rec)
  }

  // AI Insight symbol picker — identical to `Cap7TradingPage`'s.
  const [aiInsightOpen, setAiInsightOpen] = useState(false)
  const [aiInsightSymbol, setAiInsightSymbol] = useState("")

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setAiInsightSymbol("")
      setAiInsightOpen(true)
    }
  }

  const trimmedAiInsight = aiInsightSymbol.trim().toUpperCase()
  const aiInsightValid = isTradeableSymbol(trimmedAiInsight)

  const submitAiInsightSymbol = () => {
    if (!aiInsightValid) return
    setAiInsightOpen(false)
    navigate(`/co-phieu/${trimmedAiInsight}`)
  }

  /**
   * ★★ Bước chọn mã sau «Chọn mã khác» (spec §4).
   *
   * MỞ BẰNG SỰ KIỆN BUS, KHÔNG BẰNG "mã rỗng". `KiemTraDanhMucBlock.handleHanhVi`
   * bắn `cap8Events.onCheckHanhVi(value)` cho cả ba lựa chọn rồi mới gọi callback
   * của panel, nên trang này chỉ cần lắng nghe đúng `chon_ma_khac`.
   *
   * ★ VÌ SAO KHÔNG CÒN LÀ `symbol.trim() === ""`: bản trước đó dựa vào việc
   * `TradingPanel.onChonMaKhac` gọi `setSymbol("")`. Mã rỗng ấy đi qua CHÍNH
   * terminal dùng chung — `TVChart` huỷ rồi dựng lại widget trên một mã không
   * phân giải được (và `chartDrawingsApi.get("")` bắn theo) mỗi lần user bấm nút.
   * Fix wave FE-1 bỏ `setSymbol("")` khỏi `TradingPanel`; nếu trang này vẫn đọc
   * trạng thái rỗng thì nút «Chọn mã khác» chỉ còn bắn analytics rồi KHÔNG LÀM GÌ.
   *
   * ★ KHÔNG BAO GIỜ NHỐT USER: modal đóng được bằng nút Huỷ / mask / ESC, và vì
   * mã đang xem chưa từng bị bỏ đi, mọi lối ra đều trả user về đúng chỗ họ đứng.
   *
   * ★ Đây là bước chọn mã để MUA, nên chỉ nhận mã cổ phiếu niêm yết: một chỉ số
   * (VNINDEX/VN30/…) không đặt lệnh được, và nhận nó vào sẽ làm hỏng cả panel
   * thay vì báo cho user biết ngay tại đây.
   */
  const [chonMaOpen, setChonMaOpen] = useState(false)

  useEffect(() => {
    // Provider MERGE handlers (xem `Cap8Context`), nên đăng ký riêng key này
    // không đè lên `onOrderFilled` đã đăng ký ở effect trên.
    registerCap8Handlers({
      onCheckHanhVi: (hanhVi) => {
        if (hanhVi === "chon_ma_khac") setChonMaOpen(true)
      },
    })
  }, [registerCap8Handlers])

  const cancelChonMa = () => setChonMaOpen(false)
  const pickChonMa = (ma: string) => {
    setSymbol(ma)
    setChonMaOpen(false)
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      <TrialBanner />
      <Header />
      <MarketBar />

      {/* Top bar (mirrors Cấp 7's — spec §1 badge góc). */}
      <div className="cap0-topbar">
        <span className="cap1-topbar-label">CẤP 8 · QUẢN TRỊ RỦI RO DANH MỤC</span>
        <ModeBadge mode="thuc_chien" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* Màn chọn khẩu vị rủi ro BẮT BUỘC vẫn áp dụng ở Cấp 8 (Cấp 3 spec §5.2 —
          khẩu vị áp cho MỌI lệnh, và Cấp 8 giữ nguyên khối Quản lý vốn; trần khẩu
          vị còn là mốc đối chiếu của thước đo "tổng vốn ở rủi ro"). Đây là
          instance DUY NHẤT của bản bắt buộc; `TradingPanel` chỉ mount bản
          `forceOpen` (đổi khẩu vị) từ nút "Đổi". */}
      <KhauViModal />

      {/* Kết sổ Cấp 8 (spec §6) — self-contained; opens itself once a Thực chiến
          lệnh's SELL fill is reconciled against its buy-time kế hoạch + SL/TP +
          quản lý vốn + đọc-5-lớp + đối-chiếu + đọc-lực + kiểm-tra-danh-mục
          commitments, VÀ hàng `order_ketso` đã tồn tại (xem `openKetsoCap8`). */}
      <KetsoModalCap8
        data={ketso}
        progress={cap1Progress ?? null}
        trades={cap1Trades}
        cap2Progress={cap2Progress ?? null}
        onClose={() => setKetso(null)}
        onRecorded={handleKetsoRecorded}
      />

      {/* Màn tốt nghiệp Cấp 8 (spec §3) — màn cuối của cả chương trình 0-8.
          Self-contained: opens itself once progress shows 3/3, closes itself once
          `graduated_at` comes back, và KHÔNG có cấp sau để vào. */}
      <GraduationModalCap8 />

      {/* Bước chọn mã sau «Chọn mã khác» — xem docstring ở trên. */}
      <Modal
        visible={chonMaOpen}
        onCancel={cancelChonMa}
        footer={null}
        title={null}
        style={{ width: 420 }}
        autoFocus={false}
        /* Bỏ hẳn DOM khi đóng: để lại một hộp ẩn (kèm ô nhập còn nguyên chữ cũ)
           sẽ hiện lại đúng chữ đó ở lần «Chọn mã khác» sau. */
        unmountOnExit
      >
        {/* Nội dung gắn với `chonMaOpen` chứ không chỉ với `visible`: hoạt ảnh
            đóng của Arco giữ node lại thêm một nhịp, và một ô nhập mã còn sống
            sau khi user đã chọn xong là một cái bẫy focus nhỏ. */}
        {chonMaOpen && <ChonMaKhacBody onPick={pickChonMa} onCancel={cancelChonMa} />}
      </Modal>

      {/* AI Insight symbol picker — identical to Cap7TradingPage's. */}
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
