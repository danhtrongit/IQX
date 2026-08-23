import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  Button,
  Divider,
  InputNumber,
  Message,
  Radio,
  Select,
  Spin,
  Tabs,
  Tag,
  Tooltip,
} from "@arco-design/web-react"
import {
  IconArrowFall,
  IconArrowRise,
  IconLoading,
  IconMinus,
  IconStar,
  IconStarFill,
  IconThunderbolt,
  IconTrophy,
} from "@arco-design/web-react/icon"
import { usePrice, type PriceBoardData } from "@/features/market-data"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { AiInsightDetailModal } from "@/features/dau-truong"
import { useAuth } from "@/features/auth"
import { usePremiumStatus } from "@/features/premium"
import {
  PlanBlock,
  useCap0Events,
  useCap0Progress,
  useRecordCap0Kehoach,
  cap0Visibility,
} from "@/features/cap0"
import {
  AiThanhTra,
  PlanFormCap1,
  isKehoachValid,
  useCap1Events,
  useRecordKehoach,
  verdictToTrangThai,
  type LyDo,
  type Verdict,
} from "@/features/cap1"
import {
  SlTpBlock,
  isSlTpValid,
  useCap2Events,
  useRecordKehoachCap2,
  type PhuongPhapSlTp,
} from "@/features/cap2"
import {
  KhauViModal,
  QuanLyVonBlock,
  isKhoiLuongValid,
  useCap3Events,
  useCap3Progress,
  useRecordKehoachCap3,
  type CachKhoiLuong,
  type MucTuTin,
} from "@/features/cap3"
import {
  Doc5LopBlock,
  countDongThuan,
  countKhacAi,
  deriveLyDoForCap1,
  isDoc5LopComplete,
  useCap4Events,
  useRecordKehoachCap4,
  type Lop,
  type Lop5Partial,
} from "@/features/cap4"
import { useCap5Events } from "@/features/cap5"
import {
  DoiChieuBlock,
  coMauThuan,
  isDoiChieuValid,
  useCap6Events,
  useRecordKehoachCap6,
  type KieuCoPhieu,
} from "@/features/cap6"
import {
  DocSoLenhBlock,
  docSoLenhSnapshot,
  useCap7Events,
  usePhienCap7,
  useRecordKehoachCap7,
  type HanhViCo,
  type LucDocUser,
} from "@/features/cap7"
import {
  KiemTraDanhMucBlock,
  giamKhoiLuong,
  hanhViCanhBaoToSend,
  useCap8Events,
  useKiemTraCap8,
  useRecordKehoachCap8,
  type HanhViCanhBao,
  type LoaiCanhBao,
} from "@/features/cap8"
import { getErrorMessage } from "@/shared/http/client"
import { cn } from "@/shared/lib/cn"
import { StockLogo } from "@/features/navigation/StockLogo"
import { IconWallet } from "@/features/watchlist/icons"
import {
  useWatchlistToggle,
  useSymbolInfo,
} from "@/features/watchlist"
import { useAccount, usePortfolio, usePlaceOrder, useActivateAccount } from "./hooks"
import "./order-panel.css"

/**
 * Panel này có mặc áo của mockup `iqx-cap0-datlenh.html` /
 * `iqx-cap1-datlenh.html` hay không.
 *
 * ★ CHỈ Cấp 0 và Cấp 1. /bieu-do và /co-phieu đi theo theme sáng/tối của app
 * và có chrome riêng — thẻ tối cứng này đặt vào đó là chửi nhau.
 *
 * ★★ ĐÍNH CHÍNH (08/2026) — bản trước loại trừ Cấp 2 trở lên bằng
 * `isCap1Active && !isCap2Active`, với lý do: phiên Cấp 2→8 cũng có
 * `isCap1Active === true`, nên áo sẽ lan tới Cấp 8 — nơi panel còn có SL/TP,
 * Quản lý vốn, Đọc 5 lớp… mà mockup Cấp 0/1 không vẽ, cho ra "nửa thẻ áo mới,
 * nửa thẻ áo Arco cũ".
 *
 * Lý do đó ĐÃ HẾT HIỆU LỰC, vì hai điều đã đổi:
 *   1. Đã có mockup riêng cho Cấp 2 (`iqx-cap2-datlenh.html`) vẽ đúng khối
 *      Cắt lỗ/Chốt lời trong bảng màu tối — `SlTpBlock` nay mặc đúng áo đó.
 *   2. `cap0.css` ánh xạ token Arco → bảng màu của vỏ cấp, nên khối nào còn
 *      vẽ bằng token Arco cũng ra màu tối thay vì chọi nhau.
 *
 * Cái giá của việc giữ nguyên loại trừ này thì có thật và user đã báo: từ Cấp
 * 2 trở lên panel rơi hẳn về giao diện Arco mặc định, không giống demo.
 */
/**
 * ★★ Nút mã cổ phiếu ở đầu panel Đặt lệnh dẫn đi đâu.
 *
 * `"navigate"` (mặc định) = hành vi cũ `/co-phieu/:sym` — đúng trên /bieu-do
 * và /co-phieu. `"none"` = mã chỉ là nhãn: bên trong một shell cấp, cú bấm đó
 * ném user ra khỏi `/dau-truong` NGAY GIỮA lúc điền form kế hoạch (form nằm
 * trong state của panel → mất trắng). `RightSidebar` là chỗ duy nhất biết có
 * shell cấp nào đang mount, nên nó là chỗ duy nhất truyền `"none"`.
 */
type SymbolLink = "navigate" | "none"

/**
 * ★★ Điều gì xảy ra khi BE từ chối một thao tác vì thiếu Premium.
 *
 * `undefined` (mặc định) = hành vi cũ: `navigate('/nang-cap')`. Đó là điều
 * hướng TỰ ĐỘNG — user bấm MUA hoặc «Kích hoạt Đấu trường ảo», không bấm gì
 * liên quan nâng cấp, mà vẫn bị chuyển trang. Trong shell cấp thì đó là mất
 * hành trình; `RightSidebar` truyền handler để giữ user tại chỗ.
 */
type OnPremiumRequired = (() => void) | undefined

function useMockupPanelSkin(): "cap0" | "cap1" | null {
  const { isCap0Active } = useCap0Events()
  const { isCap1Active } = useCap1Events()
  if (isCap0Active) return "cap0"
  // Mockup Cấp 1 đổi accent brand → đồng (`--copper`) ở thẻ KẾ HOẠCH, và mockup
  // Cấp 2 giữ nguyên thẻ đồng đó rồi thêm hai thẻ ngọc lam bên dưới — nên Cấp 2
  // trở lên dùng chung áo `cap1`, phần thêm nằm ở `SlTpBlock`.
  if (isCap1Active) return "cap1"
  return null
}

/* ── formatting helpers ── */
function fmtPrice(price: number): string {
  if (!price || price <= 0) return "—"
  return (price * 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })
}
function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}
function fmtVolume(v: number): string {
  return v ? v.toLocaleString("en-US") : "—"
}
function fmtCompact(v: number): string {
  if (!v) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(v)
}

/**
 * Một lựa chọn của user GẮN với mã nó nói về; giá trị hiệu lực được SUY RA lúc
 * render.
 *
 * ★★ Đổi mã là một QUYẾT ĐỊNH MỚI. Sổ lệnh, 5 lớp và danh mục của mã mới là
 * những thứ khác hẳn, nên một lựa chọn còn sót lại (nó nói về mã cũ) không được
 * theo sang: nếu theo sang, hệ sẽ ghi vào hồ sơ một lời khai mà user CHƯA BAO
 * GIỜ nói ra về mã này — và những lời khai đó là đầu vào của điều kiện tốt
 * nghiệp.
 *
 * Suy ra lúc render thay vì dọn trong một `useEffect`: không có render thừa, và
 * không có khoảnh khắc nào mà state đã cũ vẫn còn đọc được (một cú bấm MUA ngay
 * trong khoảnh khắc đó sẽ gửi đi đúng giá trị cũ ấy).
 */
function useLuaChonTheoMa<T>(symbol: string) {
  const [state, setState] = useState<{ symbol: string; value: T } | null>(null)
  return [
    /** `null` khi lựa chọn đang lưu thuộc về một mã khác. */
    state?.symbol === symbol ? state.value : null,
    (value: T) => setState({ symbol, value }),
    /** Xoá hẳn — dùng sau khi lệnh khớp (lệnh sau phải tự quyết lại). */
    () => setState(null),
  ] as const
}

/**
 * Ghi một khối kế hoạch — KHÔNG BAO GIỜ CHÍ MẠNG.
 *
 * ★★ Mọi `POST /capN/kehoach` chạy SAU khi lệnh đã khớp. Nếu một trong chúng ném
 * lỗi, exception thoát ra `catch` của `handleSubmit` và kéo theo BA hậu quả cho
 * một lệnh ĐÃ THÀNH CÔNG: user thấy toast "Đặt lệnh MUA … thất bại"; form không
 * được reset nên kế hoạch cũ dính sang lệnh sau; và — nặng nhất — TOÀN BỘ chuỗi
 * `onOrderFilled` bên dưới bị bỏ qua, nên trang không ghi được lệnh mua này vào
 * `lastBuyBySymbolRef` và Kết sổ của MỌI cấp sẽ không mở khi user bán.
 *
 * Ghi hụt sổ sách của MỘT cấp là một mất mát nhỏ và có thật; nuốt cả bus là mất
 * cả màn Kết sổ của tám cấp. Vì vậy từng lần ghi được bọc RIÊNG: một cấp hỏng
 * không kéo theo cấp nào khác.
 */
async function ghiKehoachKhongChiMang(ghi: () => Promise<unknown>): Promise<void> {
  try {
    await ghi()
  } catch {
    // Có chủ đích — xem docstring ở trên.
  }
}

function priceColorClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
}

/**
 * Bản `.op-tone-*` của `priceColorClass` cho panel có skin.
 *
 * Cùng luật màu, khác NGUỒN màu: `.text-up`/`.text-ceiling` đọc token Arco vốn
 * lật theo theme sáng/tối của app, còn thẻ mockup thì luôn tối và chỉ định
 * thẳng bộ `.cap0` (`--up`, `--warn`, `--ceil`, `--floor`).
 */
function priceToneClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "op-tone-flat"
  if (price >= ceil) return "op-tone-ceil"
  if (price <= floor) return "op-tone-floor"
  if (price > ref) return "op-tone-up"
  if (price < ref) return "op-tone-down"
  return "op-tone-ref"
}

/* ── Order book (depth) ── */
function OrderBookView({ data }: { data: PriceBoardData }) {
  const bids = data.bid || []
  const asks = data.ask || []
  const maxBidVol = Math.max(...bids.map((b) => b.volume || 0), 1)
  const maxAskVol = Math.max(...asks.map((a) => a.volume || 0), 1)

  return (
    <div className="px-1.5">
      <div className="flex items-center px-1.5 py-1 text-[10px] font-medium text-[var(--color-text-3)]">
        <span className="w-16">Giá</span>
        <span className="flex-1 text-right">KL</span>
      </div>
      <div className="space-y-px">
        {[...asks].reverse().map((entry, i) => (
          <DepthRow
            key={`ask-${i}`}
            entry={entry}
            data={data}
            ratio={(entry.volume / maxAskVol) * 100}
            side="ask"
          />
        ))}
      </div>
      <div className="flex items-center justify-center py-1">
        <span className="text-[10px] text-[var(--color-text-3)]">
          Spread:{" "}
          <span className="font-medium tabular-nums text-[var(--color-text-1)]">
            {asks.length > 0 && bids.length > 0
              ? fmtPrice(asks[0].price - bids[0].price)
              : "—"}
          </span>
        </span>
      </div>
      <div className="space-y-px">
        {bids.map((entry, i) => (
          <DepthRow
            key={`bid-${i}`}
            entry={entry}
            data={data}
            ratio={(entry.volume / maxBidVol) * 100}
            side="bid"
          />
        ))}
      </div>
    </div>
  )
}

function DepthRow({
  entry,
  data,
  ratio,
  side,
}: {
  entry: { price: number; volume: number }
  data: PriceBoardData
  ratio: number
  side: "bid" | "ask"
}) {
  return (
    <div className="group relative flex items-center rounded-sm px-1.5 py-0.5 text-[11px]">
      <div
        className={cn(
          "absolute top-0 bottom-0 rounded-sm",
          side === "ask" ? "right-0 bg-down/10" : "left-0 bg-up/10",
        )}
        style={{ width: `${ratio}%` }}
      />
      <span
        className={cn(
          "relative w-16 font-medium tabular-nums",
          priceColorClass(entry.price, data.referencePrice, data.ceilingPrice, data.floorPrice),
        )}
      >
        {fmtPrice(entry.price)}
      </span>
      <span className="relative flex-1 text-right tabular-nums text-[var(--color-text-3)] group-hover:text-[var(--color-text-1)]">
        {fmtVolume(entry.volume)}
      </span>
    </div>
  )
}

/* ── Order entry (premium-gated portion) ── */
function OrderEntry({
  symbol,
  data,
  balance,
  positionQty,
  side,
  onPremiumRequired,
}: {
  symbol: string
  data: PriceBoardData | null
  balance: number
  positionQty: number
  /** ★ `side` được NÂNG lên `GatedOrderEntry` vì tabs MUA/BÁN giờ nằm trên
      cổng Premium (mockup xếp tabs trước ticker, mà ticker phải hiện cả khi
      form bị chặn). Mọi chỗ ĐỌC `side` bên dưới giữ nguyên; chỉ tabs mới ghi
      nó, và tabs không còn ở đây. */
  side: "buy" | "sell"
  onPremiumRequired: OnPremiumRequired
}) {
  const navigate = useNavigate()
  const placeOrder = usePlaceOrder()
  const cap0Events = useCap0Events()
  // `isCap0Active` is the SAME signal `GatedOrderEntry` uses to ungate the
  // form (false outside a `Cap0Provider`, i.e. on /bieu-do & /co-phieu) — the
  // Kế hoạch block + its reason-gate below are scoped to it too, so neither
  // has any effect on normal trading outside Cấp 0.
  const { isCap0Active } = cap0Events
  const skin = useMockupPanelSkin()
  // Hide-by-level (spec §8) — `useCap0Progress(isCap0Active)` only queries
  // when actually inside Cấp 0 (the `enabled` param), so this has zero
  // effect — no extra request, no hiding — outside a `Cap0Provider`.
  const { data: cap0Progress } = useCap0Progress(isCap0Active)
  // `POST /cap0/kehoach` — persists the Kế hoạch chip for a Cấp 0 BUY (spec
  // §10), whatever `mode` the order carries. Only ever CALLED inside Cấp 0
  // (guarded at the call site below), so this is inert on /bieu-do & /co-phieu.
  const recordCap0Kehoach = useRecordCap0Kehoach()
  const cap1Events = useCap1Events()
  // `isCap1Active` mirrors `isCap0Active` above — false outside a
  // `Cap1Provider`, so the Form Kế hoạch + AI Thanh tra + hard gate below
  // have zero effect on Cấp 0 or normal (non-cap) trading.
  const { isCap1Active } = cap1Events
  const recordKehoach = useRecordKehoach()
  const [cap1LyDo, setCap1LyDo] = useState<LyDo | null>(null)
  // "Vùng mua" default = giá hiện tại (spec §4) — "computed, not stored":
  // only an explicit user edit is kept in state, the effective value is
  // computed each render.
  // `undefined` = "untouched, follow the current-price default"; `null` =
  // "user explicitly cleared the field" (must NOT silently fall back to the
  // default — the hard gate needs to see this as genuinely missing).
  const [cap1VungMuaOverride, setCap1VungMuaOverride] = useState<number | null | undefined>(
    undefined,
  )
  const [cap1Verdict, setCap1Verdict] = useState<Verdict | null>(null)
  const [cap1Snapshot, setCap1Snapshot] = useState<Record<string, unknown> | null>(null)
  const [cap1DocChiTiet, setCap1DocChiTiet] = useState(false)
  // ★★ Modal đọc chi tiết 6 lớp, mở TRONG panel (xem `onOpenDetail` bên dưới).
  // GẮN THEO MÃ: đổi mã giữa chừng thì nó tự đóng, thay vì đứng đó đọc bản
  // phân tích của một mã user không còn xem nữa.
  const [chiTietMo, setChiTietMo, dongChiTiet] = useLuaChonTheoMa<true>(symbol)
  const cap2Events = useCap2Events()
  // `isCap2Active` mirrors `isCap1Active` above — false outside a
  // `Cap2Provider`, so `SlTpBlock` + its hard gate below have zero effect on
  // Cấp 0/Cấp 1-only or normal (non-cap) trading. A Cấp 2 session also has
  // `isCap1Active` true (Cấp 2 reuses Cấp 1's Form Kế hoạch 100% intact,
  // spec §0).
  const { isCap2Active } = cap2Events
  const recordKehoachCap2 = useRecordKehoachCap2()
  // Cấp 2 khối "Cắt lỗ / Chốt lời" (spec §5.4) — KHÔNG nhập tay tự do, only
  // ever set via `SlTpBlock`'s "Chọn cách này".
  const [cap2Method, setCap2Method] = useState<PhuongPhapSlTp | null>(null)
  const [cap2CatLo, setCap2CatLo] = useState<number | null>(null)
  const [cap2ChotLoi, setCap2ChotLoi] = useState<number | null>(null)
  const cap3Events = useCap3Events()
  // `isCap3Active` mirrors `isCap2Active` above — false outside a
  // `Cap3Provider`, so the khối Quản lý vốn + its hard gate below have zero
  // effect on Cấp 0/1/2-only or normal trading. A Cấp 3 session also has
  // `isCap1Active`/`isCap2Active` true (Cấp 3 keeps their blocks 100% intact,
  // spec §0).
  const { isCap3Active } = cap3Events
  const { data: cap3Progress } = useCap3Progress(isCap3Active)
  const recordKehoachCap3 = useRecordKehoachCap3()
  // Cấp 3 khối "Quản lý vốn" (spec §6) — mức tự tin do user TỰ chấm (KHÔNG có
  // AI gợi ý, spec §6.2) + 1 trong 2 cách khối lượng.
  const [cap3MucTuTin, setCap3MucTuTin] = useState<MucTuTin | null>(null)
  const [cap3Cach, setCap3Cach] = useState<CachKhoiLuong | null>(null)
  const [cap3KhoiLuong, setCap3KhoiLuong] = useState<number | null>(null)
  const [cap3PctVon, setCap3PctVon] = useState<number | null>(null)
  // Ô Khối lượng: tự điền theo khối lượng đề xuất, NHƯNG user sửa tay được
  // (spec §6.3). Một lần user tự sửa thì thôi ghi đè — tới khi họ đổi mức tự
  // tin / cách khối lượng (một ý định mới) thì auto-fill lại.
  const [cap3VolumeTouched, setCap3VolumeTouched] = useState(false)
  const [cap3KhauViOpen, setCap3KhauViOpen] = useState(false)
  const cap4Events = useCap4Events()
  // `isCap4Active` mirrors `isCap3Active` above — false outside a
  // `Cap4Provider`, so the khối "Đọc 5 lớp" + its hard gate + the HIDING of
  // Cấp 1's lý-do field have zero effect on Cấp 0/1/2/3-only or normal
  // trading. A Cấp 4 session also has `isCap1Active`/`isCap2Active`/
  // `isCap3Active` true (Cấp 4 keeps Vùng mua + SL/TP + Quản lý vốn 100%
  // intact and replaces ONLY Cấp 1's lý-do field — spec §0/§5).
  const { isCap4Active } = cap4Events
  const recordKehoachCap4 = useRecordKehoachCap4()
  // Cấp 4 khối "Đọc 5 lớp" (spec §5) — user tự chấm cả 5 lớp; AI's own per-lớp
  // view (`cap4Ai5Lop`) only arrives once all 5 are rated ("AI ẨN tới khi chấm
  // đủ", spec §5.2), which is exactly when it becomes safe to record.
  const [cap4Doc5Lop, setCap4Doc5Lop] = useState<Lop5Partial>({})
  const [cap4Ai5Lop, setCap4Ai5Lop] = useState<Lop5Partial | null>(null)
  const cap5Events = useCap5Events()
  // `isCap5Active` mirrors `isCap4Active` above — false outside a
  // `Cap5Provider`. Cấp 5 adds NOTHING AT ALL to this panel (spec §0 "GIỮ
  // NGUYÊN — panel đặt lệnh = Cấp 4"): no state, no khối, no cổng cứng, and it
  // changes nothing about Cấp 0-4's blocks, the cổng cứng chain or Cấp 3's
  // volume auto-fill. Cấp 5 mới dạy SĂN MÃ trên một MÀN RIÊNG.
  //
  // ★★ Nút «Đứng ngoài có chủ đích» ĐÃ BỊ GỠ cùng Cấp 5 cũ: `DungNgoaiButton`
  // không còn tồn tại (nhật ký đứng ngoài + 4 ô đã nghỉ hưu). Cờ này giờ chỉ
  // còn một việc: nới điều kiện bắn event lệnh khớp cho bus Cấp 5 ở dưới.
  const { isCap5Active } = cap5Events
  const cap6Events = useCap6Events()
  // `isCap6Active` mirrors `isCap5Active` above — false outside a
  // `Cap6Provider`. Cấp 6 keeps Cấp 0-5's blocks, cổng cứng chain and Cấp 3's
  // volume auto-fill 100% intact (spec §0) and INSERTS exactly one step: the
  // khối "Đối chiếu" below, which itself renders ONLY when the user's 5 lớp
  // conflict. With no conflict Cấp 6 adds NO gate at all.
  const { isCap6Active } = cap6Events
  const recordKehoachCap6 = useRecordKehoachCap6()
  // Cấp 6 bước "Đối chiếu" (spec §4) — lớp user chọn TIN khi các lớp nói ngược
  // nhau + 1 dòng vì sao (bắt buộc). `cap6Kieu` chỉ được đặt qua lối dự phòng
  // khi server KHÔNG phân loại được kiểu từ ngành (server re-derive lúc ghi và
  // giá trị của server thắng — xem `DoiChieuBlock`'s doc).
  const [cap6LopQuyetDinh, setCap6LopQuyetDinh] = useState<Lop | null>(null)
  const [cap6LyDo, setCap6LyDo] = useState("")
  // ★ GẮN THEO MÃ (xem `useLuaChonTheoMa`): kiểu cổ phiếu là một lời khai về
  // MỘT mã. Một kiểu chọn cho mã A mà theo sang mã B sẽ được `POST /cap6/kehoach`
  // dùng làm lối dự phòng khi server không phân loại được kiểu của B — tức là
  // ghi cho B đúng cái kiểu user vừa nói về A.
  const [cap6Kieu, setCap6Kieu, resetCap6Kieu] = useLuaChonTheoMa<KieuCoPhieu>(symbol)
  const cap7Events = useCap7Events()
  // `isCap7Active` mirrors `isCap6Active` above — false outside a
  // `Cap7Provider`. Cấp 7 keeps Cấp 0-6's blocks, cổng cứng chain and Cấp 3's
  // volume auto-fill 100% intact (spec §0) and adds ONE reading overlay on the
  // bid/ask book that has been visible since Cấp 2.
  //
  // ★★ IT ADDS NO GATE AT ALL (spec §9: đọc lực là SOFT — nhiệm vụ ① chỉ cần
  // ghi ≥ 1 lần). `isCap7Active` must NEVER appear in the `disabled` chain of
  // the MUA button below; a user who skips the step places an order exactly as
  // they did at Cấp 6.
  const { isCap7Active } = cap7Events
  const recordKehoachCap7 = useRecordKehoachCap7()
  // ★ `trong_phien` + every threshold come from the SERVER (`GET /cap7/phien`).
  // The FE must never compute market-open from the browser clock — a user in
  // another timezone would be told the market is open when it is not. Only
  // queried inside Cấp 7.
  const { data: cap7Phien } = usePhienCap7(isCap7Active)
  // Cấp 7 bước "Đọc sổ lệnh" (spec §4/§5) — phần user TỰ đoán + hành vi trước
  // cờ cảnh giác. Cả hai đều tùy chọn: không có cũng đặt lệnh được.
  //
  // ★ GẮN THEO MÃ (xem `useLuaChonTheoMa`). Sổ lệnh là của MỘT mã: một bản đọc
  // lực còn sót từ mã trước sẽ làm `cap7Ready` bật ngay cho mã mới, và server sẽ
  // chấm `luc_doc_user` ấy bằng diễn biến giá của mã mới. `cap7HanhViCo` còn nặng
  // hơn: "Tôi hiểu — chờ xác nhận" theo sang một mã khác là ghi thêm một lần
  // KHÔNG đuổi theo cờ mà user chưa từng nói, tức là thổi thẳng vào điều kiện tốt
  // nghiệp ② của Cấp 7.
  const [cap7DocLuc, setCap7DocLuc, resetCap7DocLuc] = useLuaChonTheoMa<LucDocUser>(symbol)
  const [cap7HanhViCo, setCap7HanhViCo, resetCap7HanhViCo] = useLuaChonTheoMa<HanhViCo>(symbol)
  const cap8Events = useCap8Events()
  // `isCap8Active` mirrors `isCap7Active` above — false outside a
  // `Cap8Provider`. Cấp 8 keeps Cấp 0-7's blocks, cổng cứng chain and Cấp 3's
  // volume auto-fill 100% intact (spec §0) and INSERTS exactly one pre-confirm
  // step: the khối "Kiểm tra danh mục" below.
  //
  // ★★ IT ADDS NO GATE AT ALL (spec §9 rules out a cổng cứng; §C8 puts the
  // decision with the user — cảnh báo MỀM). `isCap8Active` must NEVER appear in
  // the `disabled` chain of the MUA button below; a user who ignores every
  // warning places an order exactly as they did at Cấp 7.
  const { isCap8Active } = cap8Events
  const recordKehoachCap8 = useRecordKehoachCap8()
  // Cấp 8 bước "Kiểm tra danh mục" (spec §4) — lựa chọn của user trước cảnh báo
  // danh mục. `null` cho tới khi họ bấm; không bấm cũng đặt lệnh được.
  //
  // ★ Lựa chọn được GẮN với mã nó thuộc về (cùng luật `useLuaChonTheoMa` mà Cấp
  // 6/7 dùng ở trên) — nhưng ở đây state còn mang thêm CHÍNH danh sách cảnh báo
  // đang hiện lúc user bấm, nên nó giữ `useState` riêng.
  //
  // ★★ `canhBaoDaHien` không phải dữ liệu thừa. "Giảm khối lượng" / "Chọn mã
  // khác" chính là thứ làm cảnh báo TẮT ĐI, nên khi server suy lại theo lệnh đã
  // điều chỉnh nó không còn thấy cảnh báo nào để chấp nhận hai lựa chọn đó. Giữ
  // lại danh sách user THẬT SỰ nhìn thấy lúc bấm là cách duy nhất để một lệnh mà
  // user đã NGHE lời cảnh báo không bị ghi thành "danh mục không có cảnh báo nào".
  const [cap8HanhViState, setCap8HanhViState] = useState<{
    symbol: string
    value: HanhViCanhBao
    canhBaoDaHien: LoaiCanhBao[]
  } | null>(null)
  const [method, setMethod] = useState<"market" | "limit">("market")
  const [price, setPrice] = useState<number | undefined>(undefined)
  const [volume, setVolume] = useState<number>(100)
  // Cấp 0 khối "Kế hoạch" — chip lý do đời thường.
  //
  // ★ GẮN THEO MÃ + XOÁ SAU KHI KHỚP (cùng luật `useLuaChonTheoMa` mà Cấp 6/7/8
  // dùng ở trên). Chip này KHÔNG còn là trạng thái tạm của một lần bấm: nó được
  // GHI vào `cap0_order_kehoach` và in ra ở dòng «Lý do mua» của màn Kết sổ. Một
  // chip còn sót lại sau lệnh trước là một lời khai user chưa từng nói ra về
  // lệnh này — và `requireReasonBeforeOrder` tắt hẳn sau nhiệm vụ ①, nên không
  // có gì hỏi lại họ. Đổi mã cũng vậy: "Vì sao bạn chọn VNM?" không trả lời hộ
  // được câu "Vì sao bạn chọn HPG?".
  const [reason, setReason, resetReason] = useLuaChonTheoMa<string>(symbol)

  const task1Done = !!cap0Progress?.task_1_done_at
  const cap0Vis = cap0Visibility(cap0Progress)
  // Ô Giá + dropdown loại lệnh ẩn cho đến nhiệm vụ ⑤ (spec §8) — ONLY inside
  // Cấp 0; outside it (`isCap0Active` false) this is always visible, exactly
  // as today. UNCHANGED by spec v3.0.
  const hidePriceAndType = isCap0Active && !cap0Vis.priceField

  const currentPrice = data?.closePrice ? data.closePrice * 1000 : 0
  const numPrice = price ?? currentPrice
  const numVolume = volume || 0
  const orderValue = numPrice * numVolume
  const fee = Math.round(orderValue * 0.0015)

  // Cấp 1 Form Kế hoạch (spec §4) — "Vùng mua" defaults to giá hiện tại until
  // the user types their own value (or explicitly clears it — `null` is a
  // real "missing" value here, only `undefined` follows the default).
  const cap1VungMua =
    cap1VungMuaOverride === undefined ? (currentPrice > 0 ? currentPrice : null) : cap1VungMuaOverride
  // Cấp 4 REPLACES Cấp 1's lý-do field with the khối "Đọc 5 lớp" (spec §5), but
  // `order_kehoach.lyDo` is still NOT NULL on the backend — so inside Cấp 4 the
  // lý do is DERIVED from the 5 ratings instead of picked (see
  // `deriveLyDoForCap1`'s doc for the rule). Outside Cấp 4 this is `null` and
  // the user's own pick governs, exactly as before.
  const cap4LyDo = isCap4Active ? deriveLyDoForCap1(cap4Doc5Lop, cap4Ai5Lop) : null
  const effectiveLyDo = cap4LyDo ?? cap1LyDo
  // Cổng cứng (spec §4): MUA disabled unless (lý do chosen/derived) AND (vùng
  // mua > 0). Only ever true for a BUY inside Cấp 1 — never affects Cấp 0 or
  // normal trading (`isCap1Active` is false outside a `Cap1Provider`).
  const cap1SubmitDisabled =
    side === "buy" && isCap1Active && !isKehoachValid(effectiveLyDo, cap1VungMua)
  // Cổng cứng (spec §5.4): MUA disabled unless a cách cắt lỗ/chốt lời is
  // chosen — ON TOP OF (not instead of) Cấp 1's gate above, since Cấp 2
  // keeps Cấp 1's Form Kế hoạch 100% intact. Only ever true for a BUY inside
  // Cấp 2 — never affects Cấp 0/Cấp 1-only or normal trading (`isCap2Active`
  // is false outside a `Cap2Provider`).
  const cap2SubmitDisabled =
    side === "buy" && isCap2Active && !isSlTpValid(cap2Method, cap2CatLo, cap2ChotLoi)
  // Cổng cứng (spec §6.4): MUA disabled unless (mức tự tin chấm) AND (một cách
  // khối lượng chọn) — ON TOP OF Cấp 1 + Cấp 2's gates above, since Cấp 3 keeps
  // both intact. Only ever true for a BUY inside Cấp 3.
  const cap3SubmitDisabled =
    side === "buy" && isCap3Active && !isKhoiLuongValid(cap3MucTuTin, cap3Cach)
  // Cổng cứng (spec §5.2): MUA disabled until all 5 lớp are rated — ON TOP OF
  // Cấp 1 + Cấp 2 + Cấp 3's gates above, since Cấp 4 keeps all three blocks
  // (minus Cấp 1's lý-do field). Only ever true for a BUY inside Cấp 4.
  const cap4SubmitDisabled = side === "buy" && isCap4Active && !isDoc5LopComplete(cap4Doc5Lop)
  // Cấp 6 (spec §4): the bước Đối chiếu only exists when the user's own 5 lớp
  // CONFLICT (≥1 Ủng hộ AND ≥1 Ngược chiều) — that same predicate decides both
  // whether the khối renders and whether there is a gate at all.
  const cap6CoMauThuan = isCap6Active && coMauThuan(cap4Doc5Lop)
  // Cổng cứng (spec §4): với lệnh CÓ mâu thuẫn, MUA khoá tới khi chọn lớp quyết
  // định + ghi 1 dòng vì sao — ON TOP OF Cấp 1-4's gates (Cấp 6 keeps all of
  // them intact). KHÔNG mâu thuẫn → Cấp 6 không thêm cổng nào. Only ever true
  // for a BUY inside Cấp 6.
  const cap6SubmitDisabled =
    side === "buy" && cap6CoMauThuan && !isDoiChieuValid(cap6LopQuyetDinh, cap6LyDo)
  // Cấp 7 (spec §4/§5) — ONE reading of the SAME book `OrderBookView` already
  // draws from `data`, computed once per render so the number the user sees on
  // the gauge and the number `POST /cap7/kehoach` commits are the SAME number
  // (the ladder moves on every quote tick).
  //
  // ★ There is deliberately NO `cap7SubmitDisabled`. Cấp 7 never gates MUA
  // (spec §9) — see `isCap7Active`'s note above.
  const cap7Snapshot = docSoLenhSnapshot(data?.bid, data?.ask, cap7Phien?.quy_tac)
  // Ghi bước đọc lực chỉ khi: đang trong Cấp 7, SERVER nói đang trong phiên, sổ
  // đọc được (chỉ số hữu hạn > 0 — không bao giờ gửi 0/vô cực) và user đã tự
  // chốt phần đọc của mình.
  const cap7Ready =
    isCap7Active &&
    cap7Phien?.trong_phien === true &&
    cap7Snapshot.chiSo != null &&
    cap7DocLuc != null
  // Cấp 8 bước "Kiểm tra danh mục" (spec §4) — the panel holds the SAME query
  // the block renders (react-query dedupes by key, so this is one request, not
  // two): it needs `canh_bao` at fill time to send a `hanh_vi_canh_bao` the
  // server will accept. Only queried inside Cấp 8, and DEBOUNCED inside the hook
  // — this check is O(vị thế) price lookups plus bounded O(n²) correlation
  // fetches, hanging off a volume field the user types into.
  //
  // ★ There is deliberately NO `cap8SubmitDisabled`. Cấp 8 never gates MUA
  // (spec §9/§C8) — see `isCap8Active`'s note above.
  const { data: cap8KiemTra } = useKiemTraCap8(
    { symbol, khoiLuong: numVolume, gia: numPrice, catLo: cap2CatLo },
    isCap8Active,
  )
  // ★★ MỘT KẾT QUẢ KIỂM TRA CHỈ DÙNG ĐƯỢC CHO ĐÚNG LỆNH NÓ NÓI VỀ.
  // `useKiemTraCap8` debounce đầu vào (400 ms) và cache 30 s, nên ngay sau khi
  // user đổi mã hoặc đổi khối lượng, `cap8KiemTra` VẪN là kết quả của lệnh
  // trước. Bấm MUA trong khoảng đó mà cứ dùng nó thì `hanh_vi_canh_bao`, ngành,
  // % dồn ngành, tổng rủi ro và danh sách cảnh báo đều đang tả MỘT LỆNH KHÁC:
  // server suy lại và 400 (đúng, nên cột để null), nhưng `Cap8OrderEvent` thì
  // vẫn mang bộ số sai đó đi và Kết sổ kể lại ngành + rủi ro của một mã khác.
  const cap8KiemTraKhop =
    cap8KiemTra &&
    cap8KiemTra.symbol.toUpperCase() === symbol.toUpperCase() &&
    cap8KiemTra.khoi_luong === numVolume
      ? cap8KiemTra
      : null
  // Ghi khối Kiểm tra danh mục chỉ khi bước này THẬT SỰ chạy được cho CHÍNH lệnh
  // này: không có kết quả kiểm tra khớp thì không có gì trung thực để ghi (cột
  // để null), và lệnh vẫn đặt bình thường.
  const cap8Ready = isCap8Active && !!cap8KiemTraKhop
  const cap8CanhBao = cap8KiemTraKhop?.canh_bao ?? []
  // ★ `chon_ma_khac` KHÔNG BAO GIỜ đúng cho một lệnh mua CHÍNH mã đó. Nút ấy mở
  // bước chọn mã khác; nếu user quay lại mã cũ ("Quay lại mã trước đó") rồi mua
  // y nguyên, thì họ đã KHÔNG đổi mã — ghi `chon_ma_khac` sẽ miễn cho lệnh này
  // một lần "mua bất chấp" ở nhiệm vụ ②, in ra "bạn: Chọn mã khác ✓" và khiến
  // coach khen một điều chỉnh chưa từng xảy ra. Còn nếu user ĐÃ đổi sang mã
  // khác thì lựa chọn này rơi theo mã (điều kiện `symbol` bên dưới).
  const cap8HanhVi =
    cap8HanhViState?.symbol === symbol && cap8HanhViState.value !== "chon_ma_khac"
      ? cap8HanhViState.value
      : null
  // Danh sách cảnh báo NGAY LÚC user bấm = đúng cái `KiemTraDanhMucBlock` đang
  // hiện (cùng một query, react-query dedupe theo key), tức "kết quả kiểm tra
  // user thật sự nhìn thấy".
  const setCap8HanhVi = (value: HanhViCanhBao) =>
    setCap8HanhViState({
      symbol,
      value,
      canhBaoDaHien: (cap8KiemTra?.canh_bao ?? []).map((c) => c.ma),
    })
  // ★ Chỉ lựa chọn ĐIỀU CHỈNH LỆNH mới cần khai lại cảnh báo đã hiện: chính hành
  // động của user làm cảnh báo tắt, nên server không suy lại được nó từ lệnh sau
  // điều chỉnh. `van_mua`/`khong_canh_bao` không đổi gì cả — với hai giá trị đó
  // server tự suy lại là nguồn đúng duy nhất, và backend bỏ qua trường này.
  // (`chon_ma_khac` là giá trị thứ ba backend nhận trường này, nhưng nó KHÔNG BAO
  // GIỜ là lựa chọn hiệu lực của một lệnh mua — xem `cap8HanhVi` ở trên.)
  const cap8CanhBaoDaHien =
    cap8HanhVi === "giam_kl" ? (cap8HanhViState?.canhBaoDaHien ?? []) : null
  // Có cảnh báo hay không: với một lệnh ĐÃ điều chỉnh thì lấy theo bộ cảnh báo
  // user đã thấy và đã đáp lại — nếu lấy theo lần kiểm tra sau điều chỉnh, một
  // user vừa nghe lời sẽ bị ghi thành "danh mục không có cảnh báo nào".
  const cap8CoCanhBao = cap8CanhBaoDaHien
    ? cap8CanhBaoDaHien.length > 0
    : cap8CanhBao.length > 0
  const cap8HanhViGui = hanhViCanhBaoToSend(cap8CoCanhBao, cap8HanhVi)
  // Cảnh báo để KỂ LẠI ở Kết sổ = cùng bộ đã quyết ra `cap8HanhViGui`, nếu không
  // màn Kết sổ sẽ in "bạn: Giảm khối lượng ✓" ngay dưới một dòng "không có cảnh
  // báo nào".
  const cap8DanhMucCanhBao = cap8CanhBaoDaHien ?? cap8CanhBao.map((c) => c.ma)

  // Analytics `cap4_lo_ai(so_khac_ai)` (spec §8) — fires once per reveal, when
  // `Doc5LopBlock` reports the AI đối chiếu it just un-hid. By the time this
  // effect runs, `cap4Doc5Lop` is already the completed 5-lớp map (same render
  // batch), so the neutral khác-AI count is accurate.
  useEffect(() => {
    if (cap4Ai5Lop) cap4Events.onAiRevealed?.(countKhacAi(cap4Doc5Lop, cap4Ai5Lop))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap4Ai5Lop])

  const handlePct = (pct: number) => {
    if (side === "buy" && numPrice > 0) {
      const maxShares = Math.floor(balance / (numPrice * 1.0015) / 100) * 100
      const qty = Math.floor((maxShares * pct) / 100 / 100) * 100
      setVolume(Math.max(100, qty))
    } else if (side === "sell" && positionQty > 0) {
      const qty = Math.floor((positionQty * pct) / 100 / 100) * 100
      setVolume(Math.max(100, qty))
    }
  }

  const handleSubmit = async () => {
    if (!data) {
      Message.error("Không có dữ liệu mã CK")
      return
    }
    if (numVolume < 100) {
      Message.warning("Khối lượng tối thiểu là 100 CP")
      return
    }
    if (numVolume % 100 !== 0) {
      Message.warning("Khối lượng phải là bội số của 100")
      return
    }
    if (method === "limit" && numPrice <= 0) {
      Message.warning("Vui lòng nhập giá hợp lệ cho lệnh giới hạn")
      return
    }
    // Cấp 0 nhiệm vụ ① (spec §4): block the first BUY until a Kế hoạch
    // reason chip is picked — ONLY inside Cấp 0 (`isCap0Active`). Outside
    // Cấp 0, or once task ① is done, `requireReasonBeforeOrder` is false and
    // this never fires either way; the explicit `isCap0Active` check is
    // belt-and-suspenders so a normal buy is NEVER blocked outside Cấp 0 (🔵
    // minimal-touch: everything else in this function is untouched).
    if (side === "buy" && isCap0Active && cap0Events.requireReasonBeforeOrder && !reason) {
      cap0Events.onGbarWarn?.()
      return
    }
    // Cấp 1 Form Kế hoạch cổng cứng (spec §4) — belt-and-suspenders behind
    // the Submit button's own `disabled` (a user could still reach this via
    // Enter/programmatic click). ONLY inside Cấp 1 — never affects Cấp 0 or
    // normal trading.
    if (cap1SubmitDisabled) {
      // Inside Cấp 4 the lý do is derived from the khối "Đọc 5 lớp", so only
      // Vùng mua can be the missing piece here.
      Message.warning(
        isCap4Active
          ? "Nhập vùng mua mới đặt được lệnh."
          : "Chọn lý do mua và vùng mua mới đặt được lệnh.",
      )
      return
    }
    // Cấp 2 khối Cắt lỗ/Chốt lời cổng cứng (spec §5.4) — belt-and-suspenders
    // behind the Submit button's own `disabled`. ONLY inside Cấp 2 — never
    // affects Cấp 0/Cấp 1-only or normal trading.
    if (cap2SubmitDisabled) {
      Message.warning("Chọn 1 trong 2 cách cắt lỗ/chốt lời mới đặt được lệnh.")
      return
    }
    // Cấp 3 khối Quản lý vốn cổng cứng (spec §6.4) — belt-and-suspenders behind
    // the Submit button's own `disabled`. ONLY inside Cấp 3.
    if (cap3SubmitDisabled) {
      Message.warning("Chấm mức tự tin và chọn cách tính khối lượng mới đặt được lệnh.")
      return
    }
    // Cấp 4 khối Đọc 5 lớp cổng cứng (spec §5.2) — belt-and-suspenders behind
    // the Submit button's own `disabled`. ONLY inside Cấp 4.
    if (cap4SubmitDisabled) {
      Message.warning("Chấm đủ cả 5 lớp mới đặt được lệnh.")
      return
    }
    // Cấp 6 bước Đối chiếu cổng cứng (spec §4) — belt-and-suspenders behind the
    // Submit button's own `disabled`. ONLY inside Cấp 6 AND only when the 5 lớp
    // conflict.
    if (cap6SubmitDisabled) {
      Message.warning("Chọn lớp bạn quyết định tin và ghi 1 dòng vì sao mới đặt được lệnh.")
      return
    }

    const label = side === "buy" ? "MUA" : "BÁN"
    try {
      const order = await placeOrder.mutateAsync({
        symbol,
        side,
        method,
        quantity: numVolume,
        price: numPrice,
      })
      // `order.side` is a plain `string` off the wire (backend returns
      // "BUY"/"SELL"); the bus's `Cap0OrderEvent.side` is the UI's own
      // lowercase `"buy" | "sell"` union, so build the event from the local
      // `side` state (what was actually requested) instead of re-narrowing
      // the response field.
      // v2.2 also attached the Kế hoạch SL/TP to BUY fills here, because the
      // trading backend never persists them and the later Kết sổ needed them.
      // v3.0 removes cắt lỗ/chốt lời from Cấp 0 entirely, so there is nothing
      // to attach (see `Cap0OrderEvent`).
      cap0Events.onOrderFilled?.({
        // ★ `Gbar` files this against the symbol and hands it to the Kết sổ as
        // `buyOrderId` — the key `GET /cap0/kehoach?order_id=` reads the chip
        // back under, i.e. the same order the chip was POSTed for just below.
        orderId: order.id,
        symbol,
        side,
        quantity: order.quantity,
        price: order.price,
      })
      // Cấp 0 (spec §10 "Bảng `cap0_order_kehoach`") — persist the chip the
      // user picked in the khối Kế hoạch so the Kết sổ's `Lý do mua` row
      // survives a reload (bus-only would be lost, the exact class of bug that
      // made Cấp 0 ungraduatable). Cấp 0-only and BUY-only; skipped when no
      // chip was picked (nothing to record) — the endpoint UPSERTs, so a
      // retried buy on the same order can never 409.
      //
      // ★★ KHÔNG CHÍ MẠNG, and placed AFTER `onOrderFilled` above. The order
      // has already filled by the time this runs: an exception escaping here
      // would reach `handleSubmit`'s `catch`, report a successful order as a
      // failure, skip the form reset, and — worst — swallow the whole
      // `onOrderFilled` chain below, so no cấp's Kết sổ would ever open again
      // (`7a057a3`). Losing one bookkeeping row is the small, honest loss.
      if (side === "buy" && isCap0Active && !isCap1Active && reason) {
        await ghiKehoachKhongChiMang(() =>
          recordCap0Kehoach.mutateAsync({ orderId: order.id, lyDoDoiThuong: reason }),
        )
      }
      // Chip đã dùng xong cho ĐÚNG lệnh vừa khớp: lệnh sau phải tự chọn lại.
      // Nằm NGOÀI khối reset của Cấp 1 bên dưới (khối đó chỉ chạy trong
      // `isCap1Active`, nên chip Cấp 0 chưa bao giờ được dọn).
      if (side === "buy") resetReason()
      // Cấp 1 (spec §4 "Ghi hồ sơ khi đặt lệnh") — a BUY fill inside Cấp 1
      // (only reachable once `cap1SubmitDisabled` is false, i.e. lý do +
      // vùng mua are both set) records the Form Kế hoạch. `trangThai_luc_dat`
      // is the AI Thanh tra verdict AT PICK TIME (spec §5); default to
      // "trung_tinh" for the (never-expected, degrade-gracefully) case where
      // no verdict resolved yet.
      if (side === "buy" && isCap1Active && effectiveLyDo && cap1VungMua) {
        const trangThai = verdictToTrangThai(cap1Verdict ?? "trung_tinh")
        const kehoachPayload = {
          order_id: order.id,
          // Inside Cấp 4 this is the DERIVED lý do (its own UI field is gone,
          // but the column is NOT NULL) — see `cap4LyDo` above.
          lyDo: effectiveLyDo,
          trangThai_luc_dat: trangThai,
          vung_mua: cap1VungMua,
          co_bam_doc_chi_tiet: cap1DocChiTiet,
          snapshot: cap1Snapshot,
        }
        // Cấp 2 (spec §5.4 "Ghi hồ sơ") — `/cap2/kehoach` 404s unless the
        // Cấp 1 kehoach row it extends already exists, so inside Cấp 2 the
        // Cấp 1 POST must be AWAITED (not fire-and-forget) and succeed
        // BEFORE the Cấp 2 SL/TP commitment POST fires. Outside Cấp 2 (or
        // once `cap2SubmitDisabled` is false, i.e. a cách is chosen), Cấp 1's
        // own fire-and-forget `mutate` is unchanged.
        const cap2Ready = isCap2Active && !!cap2Method && !!cap2CatLo && !!cap2ChotLoi
        const cap4Ready = isCap4Active && isDoc5LopComplete(cap4Doc5Lop)
        // Cấp 6 chỉ ghi khối Đối chiếu khi lệnh này THẬT SỰ có mâu thuẫn và user
        // đã quyết (spec §9: "chỉ điền khi lệnh có mâu thuẫn; lệnh không mâu
        // thuẫn để null").
        const cap6Ready =
          cap6CoMauThuan && isDoiChieuValid(cap6LopQuyetDinh, cap6LyDo) && !!cap6LopQuyetDinh
        // `cap7Ready` joins this OR for the same reason as the others:
        // `/cap7/kehoach` 404s unless the Cấp 1 row it extends already exists,
        // so a Cấp 7 reading must not fall into the fire-and-forget branch.
        //
        // ★★ TỪNG LẦN GHI DƯỚI ĐÂY ĐỀU KHÔNG CHÍ MẠNG (`ghiKehoachKhongChiMang`).
        // Lệnh đã khớp trước khi khối này chạy: một `POST /capN/kehoach` hỏng chỉ
        // được phép làm mất đúng khối sổ sách của cấp đó, KHÔNG được biến một
        // lệnh thành công thành thông báo lỗi, KHÔNG được chặn reset form, và
        // tuyệt đối không được nuốt chuỗi `onOrderFilled` bên dưới (nuốt bus =
        // không cấp nào mở được Kết sổ nữa). Xem docstring của hàm đó.
        if (cap2Ready || cap4Ready || cap6Ready || cap7Ready || cap8Ready) {
          await ghiKehoachKhongChiMang(() => recordKehoach.mutateAsync(kehoachPayload))
          if (isCap2Active && cap2Method && cap2CatLo && cap2ChotLoi) {
            await ghiKehoachKhongChiMang(() =>
              recordKehoachCap2.mutateAsync({
                order_id: order.id,
                phuong_phap_sl_tp: cap2Method,
                cat_lo: cap2CatLo,
                chot_loi: cap2ChotLoi,
              }),
            )
          }
          // Cấp 3 (spec §6 "Ghi hồ sơ") — same chained-await reason as Cấp 2:
          // `/cap3/kehoach` extends the SAME `order_kehoach` row, so it must
          // fire only AFTER Cấp 1's (and Cấp 2's) POST has created/updated it.
          const cap3KhauVi = cap3Progress?.khau_vi
          if (
            isCap3Active &&
            cap3KhauVi &&
            cap3MucTuTin &&
            cap3Cach &&
            cap3KhoiLuong != null &&
            cap3PctVon != null
          ) {
            await ghiKehoachKhongChiMang(() =>
              recordKehoachCap3.mutateAsync({
                order_id: order.id,
                khau_vi: cap3KhauVi,
                muc_tu_tin: cap3MucTuTin,
                cach_khoi_luong: cap3Cach,
                khoi_luong: cap3KhoiLuong,
                pct_von: cap3PctVon,
              }),
            )
          }
          // Cấp 4 (spec §8 "Dữ liệu cần ghi") — LAST in the chain, same single
          // `order_kehoach` row. BOTH JSON blobs go up: without `ai_5_lop` the
          // backend leaves `so_lop_dong_thuan` NULL and the order never counts
          // toward nhiệm vụ ③ (đồng thuận cao). `so_lop_dong_thuan`/
          // `so_lop_khac_ai` are advisory — the server re-derives them.
          if (cap4Ready) {
            await ghiKehoachKhongChiMang(() =>
              recordKehoachCap4.mutateAsync({
                order_id: order.id,
                doc_5_lop: cap4Doc5Lop,
                ai_5_lop: cap4Ai5Lop,
                so_lop_dong_thuan: countDongThuan(cap4Ai5Lop),
                so_lop_khac_ai: countKhacAi(cap4Doc5Lop, cap4Ai5Lop),
              }),
            )
          }
          // Cấp 6 (spec §4/§9 "Ghi") — LAST in the chain, same single
          // `order_kehoach` row (Cấp 6 only INSERTS the Đối chiếu block). Only
          // `lop_quyet_dinh` + `ly_do_doi_chieu` are the user's own judgement:
          // the server re-derives the kiểu from ngành and derives
          // `trong_so_goi_y`/`khop_goi_y` itself, and prefers the row's
          // persisted `doc_5_lop` over the `lop_mau_thuan` fallback sent here.
          if (cap6Ready && cap6LopQuyetDinh) {
            await ghiKehoachKhongChiMang(() =>
              recordKehoachCap6.mutateAsync({
                order_id: order.id,
                lop_quyet_dinh: cap6LopQuyetDinh,
                ly_do_doi_chieu: cap6LyDo.trim(),
                // Chỉ có giá trị khi server KHÔNG phân loại được kiểu từ ngành.
                kieu_co_phieu: cap6Kieu,
                lop_mau_thuan: cap4Doc5Lop,
              }),
            )
          }
          // Cấp 7 (spec §4/§5 "Ghi") — LAST in the chain, same single
          // `order_kehoach` row (Cấp 7 only adds the đọc-lực block).
          //
          // ★ `co_canh_giac_lenh_gia` and `hanh_vi_co` come from the SAME
          // snapshot as `luc_chi_so`, because the server enforces "hành vi
          // non-null IFF có cờ" and rejects the inconsistent pair. A cờ that is
          // showing but never acted on is recorded as `mua_duoi_theo` — a FACT
          // for the Kết sổ to reflect back, never a penalty (spec §5 "không
          // phạt cứng").
          const cap7ChiSo = cap7Snapshot.chiSo
          if (cap7Ready && cap7DocLuc && cap7ChiSo != null) {
            await ghiKehoachKhongChiMang(() =>
              recordKehoachCap7.mutateAsync({
                order_id: order.id,
                luc_chi_so: cap7ChiSo,
                luc_doc_user: cap7DocLuc,
                co_canh_giac_lenh_gia: !!cap7Snapshot.co,
                hanh_vi_co: cap7Snapshot.co ? (cap7HanhViCo ?? "mua_duoi_theo") : null,
              }),
            )
          }
          // Cấp 8 (spec §4/§8 "Ghi") — LAST in the chain, same single
          // `order_kehoach` row (Cấp 8 only adds the Kiểm tra danh mục block).
          //
          // ★ Không đo đạc nào của FE được gửi lên: server re-derives every
          // measure from the real portfolio and stores its own, so a client
          // cannot post an empty warning list to keep its "mua bất chấp" count
          // clean. `hanhViCanhBaoToSend` makes the value AGREE with what actually
          // fired — the server rejects the contradiction with 400.
          //
          // ★★ `canh_bao_da_hien` là NGOẠI LỆ DUY NHẤT, và chỉ cho hai lựa chọn
          // có ĐIỀU CHỈNH LỆNH. Giảm khối lượng / đổi mã chính là thứ làm cảnh
          // báo tắt đi, nên server suy lại theo lệnh sau điều chỉnh sẽ không thấy
          // cảnh báo nào và từ chối `giam_kl`/`chon_ma_khac` — nghĩa là một lệnh
          // user ĐÃ NGHE lời chỉ ghi được thành "danh mục không có cảnh báo nào".
          // Trường này khai lại đúng bộ cảnh báo của lần kiểm tra user đã phản
          // hồi. Server BỎ QUA nó với `van_mua`/`khong_canh_bao`.
          //
          // ★★★ NON-FATAL BY DESIGN — như mọi lần ghi kế hoạch ở trên. Lệnh đã
          // khớp, và server vẫn 400 hợp lệ khi danh mục dịch chuyển giữa lần kiểm
          // tra và lần server tự suy lại sau khớp.
          if (cap8Ready) {
            await ghiKehoachKhongChiMang(() =>
              recordKehoachCap8.mutateAsync({
                order_id: order.id,
                hanh_vi_canh_bao: cap8HanhViGui,
                ...(cap8HanhViGui === "giam_kl" || cap8HanhViGui === "chon_ma_khac"
                  ? { canh_bao_da_hien: cap8CanhBaoDaHien ?? [] }
                  : {}),
              }),
            )
          }
        } else {
          recordKehoach.mutate(kehoachPayload)
        }
        cap1Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          lyDo: effectiveLyDo,
          trangThaiLucDat: trangThai,
          vungMua: cap1VungMua,
        })
        cap2Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          ...(cap2Method && cap2CatLo && cap2ChotLoi
            ? { phuongPhapSlTp: cap2Method, catLo: cap2CatLo, chotLoi: cap2ChotLoi }
            : {}),
        })
        cap3Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          ...(cap3Progress?.khau_vi && cap3MucTuTin && cap3Cach
            ? {
                khauVi: cap3Progress.khau_vi,
                mucTuTin: cap3MucTuTin,
                cachKhoiLuong: cap3Cach,
                ...(cap3KhoiLuong != null ? { khoiLuong: cap3KhoiLuong } : {}),
                ...(cap3PctVon != null ? { pctVon: cap3PctVon } : {}),
              }
            : {}),
        })
        cap4Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          ...(isCap4Active && isDoc5LopComplete(cap4Doc5Lop)
            ? {
                doc5Lop: cap4Doc5Lop,
                ai5Lop: cap4Ai5Lop,
                soLopDongThuan: countDongThuan(cap4Ai5Lop),
                soLopKhacAi: countKhacAi(cap4Doc5Lop, cap4Ai5Lop),
              }
            : {}),
        })
        // Cấp 5 — KHÔNG có kế hoạch riêng để ghi (không có `/cap5/kehoach`):
        // cấp này đo QUYẾT ĐỊNH lúc kết sổ, không thêm gì lúc đặt. Event chỉ
        // để Hành trình/Kết sổ Cấp 5 biết lệnh nào vừa mở.
        cap5Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
        })
        // Cấp 6 — khối Đối chiếu đi kèm CHỈ khi lệnh này có mâu thuẫn và user đã
        // quyết (spec §9: lệnh không mâu thuẫn để null).
        cap6Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          ...(cap6Ready && cap6LopQuyetDinh
            ? {
                kieuCoPhieu: cap6Kieu,
                lopQuyetDinh: cap6LopQuyetDinh,
                lyDoDoiChieu: cap6LyDo.trim(),
                lopMauThuan: cap4Doc5Lop,
              }
            : {}),
        })
        // Cấp 7 — phần đọc lực đi kèm CHỈ khi lệnh này thật sự ghi được nó
        // (trong phiên + sổ đọc được + user đã tự chốt). Đọc lực không bao giờ
        // là điều kiện để mua, nên phần lớn lệnh sẽ không có khối này.
        cap7Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          ...(cap7Ready && cap7DocLuc && cap7Snapshot.chiSo != null
            ? {
                lucChiSo: cap7Snapshot.chiSo,
                lucDocUser: cap7DocLuc,
                coCanhGiac: !!cap7Snapshot.co,
                hanhViCo: cap7Snapshot.co ? (cap7HanhViCo ?? "mua_duoi_theo") : null,
              }
            : {}),
        })
        // Cấp 8 — khối Kiểm tra danh mục đi kèm CHỈ khi bước này chạy được. Các
        // con số là thứ FE ĐÃ HIỆN cho user (để Kết sổ kể lại đúng cái họ nhìn
        // thấy lúc mua); server vẫn tự suy lại và lưu số của chính nó.
        cap8Events.onOrderFilled?.({
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
          ...(cap8Ready && cap8KiemTraKhop
            ? {
                donNganhPct: cap8KiemTraKhop.don_nganh_pct_sau,
                // ★ `nganh` + `so_vi_the_thieu_cat_lo` KHÔNG có cột nào trên
                // `order_kehoach`, nên phản hồi `GET /cap8/kiem-tra` này là nguồn
                // DUY NHẤT để Kết sổ gọi tên được ngành và nói ra được caveat "N
                // vị thế chưa có cắt lỗ". Không gửi kèm thì khối Kết sổ phải viết
                // "Ngành của mã" và tự nhận là không biết có vị thế nào thiếu cắt
                // lỗ hay không — trong khi lúc mua hệ ĐÃ biết cả hai.
                nganh: cap8KiemTraKhop.nganh,
                // ★ `tuong_quan_du_lieu` là điều kiện, đúng như khối đang hiện
                // trên màn (`KiemTraDanhMucBlock` chỉ in hệ số khi
                // `tuong_quan_du_lieu && tuong_quan`). Nếu server từng trả
                // `canh_bao: true` kèm `du_lieu: false`, chỉ xét `canh_bao` sẽ
                // đẩy một `he_so` KHÔNG TÍNH ĐƯỢC lên Kết sổ và in ra "MBB
                // (~0.00)" — đúng cái "chưa biết hiện thành 0" mà cả Cấp 8 dạy.
                tuongQuanCaoVoi:
                  cap8KiemTraKhop.tuong_quan_du_lieu && cap8KiemTraKhop.tuong_quan_canh_bao
                    ? cap8KiemTraKhop.tuong_quan
                    : null,
                tongRuiRoPct: cap8KiemTraKhop.tong_rui_ro_pct_sau,
                soViTheThieuCatLo: cap8KiemTraKhop.so_vi_the_thieu_cat_lo,
                danhMucCanhBao: cap8DanhMucCanhBao,
                hanhViCanhBao: cap8HanhViGui,
              }
            : {}),
        })
        // Reset the Kế hoạch form for the next order.
        setCap1LyDo(null)
        setCap1VungMuaOverride(undefined)
        setCap1Verdict(null)
        setCap1Snapshot(null)
        setCap1DocChiTiet(false)
        setCap2Method(null)
        setCap2CatLo(null)
        setCap2ChotLoi(null)
        setCap3MucTuTin(null)
        setCap3Cach(null)
        setCap3KhoiLuong(null)
        setCap3PctVon(null)
        setCap3VolumeTouched(false)
        // Cấp 4: the next order must be read + rated from scratch (and the AI
        // đối chiếu hidden again) — that IS the habit nhiệm vụ ③ measures.
        setCap4Doc5Lop({})
        setCap4Ai5Lop(null)
        // Cấp 6: lệnh sau phải đối chiếu lại từ đầu (bản chấm 5 lớp đã xoá ở
        // trên, nên khối Đối chiếu cũng tự ẩn tới khi có mâu thuẫn mới).
        setCap6LopQuyetDinh(null)
        setCap6LyDo("")
        resetCap6Kieu()
        // Cấp 7: lệnh sau phải đọc lại sổ từ đầu — sổ lệnh đổi từng giây, một
        // phần đọc còn sót lại từ lệnh trước sẽ là một con số đã cũ.
        resetCap7DocLuc()
        resetCap7HanhViCo()
        // Cấp 8: lệnh sau phải quyết lại trước cảnh báo của CHÍNH nó — danh mục
        // vừa đổi vì lệnh này, nên một lựa chọn còn sót lại đã nói về một danh
        // mục không còn tồn tại.
        setCap8HanhViState(null)
      }
      // Cấp 1 (spec §6 "Kết sổ mở khi user bán 1 lệnh Thực chiến") — a SELL
      // fill inside Cấp 1 notifies the bus too (no `lyDo`/`trangThaiLucDat`/
      // `vungMua` — those are BUY-time kế hoạch fields, undefined on sell
      // events per `Cap1OrderEvent`'s own doc). `Cap1TradingPage` matches
      // this against the tracked buy for the same symbol to open Kết sổ.
      //
      // Cấp 3 + Cấp 4 get their OWN sell event too (they used to piggyback on
      // Cấp 2's, so `KetsoModalCap3` opened off another cấp's bus) — each
      // cấp's Kết sổ now listens to its own. The `?.` calls are no-ops outside
      // each provider, so the `||` widening cannot regress Cấp 1/2.
      if (
        side === "sell" &&
        (isCap1Active ||
          isCap3Active ||
          isCap4Active ||
          isCap5Active ||
          isCap6Active ||
          isCap7Active ||
          isCap8Active)
      ) {
        const sellEvent = {
          symbol,
          side,
          quantity: order.quantity,
          price: order.price,
          orderId: order.id,
        }
        cap1Events.onOrderFilled?.(sellEvent)
        cap2Events.onOrderFilled?.(sellEvent)
        cap3Events.onOrderFilled?.(sellEvent)
        cap4Events.onOrderFilled?.(sellEvent)
        // Cấp 5's Kết sổ mở từ event của CHÍNH nó — cùng cách Cấp 3/Cấp 4 đã
        // sửa để không đi nhờ bus của cấp khác.
        cap5Events.onOrderFilled?.(sellEvent)
        // Cấp 6's Kết sổ (đối chiếu nhìn lại) — cùng lý do, bus của chính nó.
        cap6Events.onOrderFilled?.(sellEvent)
        // Cấp 7's Kết sổ (đối chiếu lực đã đọc vs diễn biến ngay sau) — bus của
        // chính nó, cùng lý do.
        cap7Events.onOrderFilled?.(sellEvent)
        // Cấp 8's Kết sổ (cảnh báo danh mục lúc mua vs cách xử lý) — bus của
        // chính nó, cùng lý do.
        cap8Events.onOrderFilled?.(sellEvent)
      }
      const totalStr = (order.total || order.price * order.quantity).toLocaleString("en-US")
      Message.success(
        `Đặt lệnh ${label} ${symbol} thành công — ${order.quantity} CP × ${order.price.toLocaleString("en-US")} = ${totalStr} VND${order.status === "PENDING" ? " (chờ khớp)" : ""}`,
      )
    } catch (err) {
      const msg = await getErrorMessage(err, `Đặt lệnh ${label} ${symbol} thất bại`)
      if (/premium|gói premium/i.test(msg)) {
        Message.error({
          content: msg,
          duration: 6000,
        })
        // ★★ KHÔNG tự điều hướng khi host đã nhận trách nhiệm: trong shell cấp,
        // một cú `navigate('/nang-cap')` ở đây là mất hành trình vì một lỗi
        // user không hề yêu cầu.
        if (onPremiumRequired) onPremiumRequired()
        else navigate("/nang-cap")
      } else {
        Message.error(msg)
      }
    }
  }

  return (
    // Có skin thì thẻ ngoài (`.op-panel`) đã lo padding + nhịp dọc, phần thân
    // chỉ cần trong suốt; không có skin thì giữ nguyên lớp cũ.
    <div className={skin ? undefined : "space-y-2 px-2 pb-3"}>
      {/* ★ Tabs MUA/BÁN + `StockHeader` + `AccountStrip` đã dời LÊN
          `GatedOrderEntry` (xem chú thích ở đó): chúng phải hiện KỂ CẢ khi
          cổng Premium chặn form, nếu không user không Premium trên /bieu-do
          và /co-phieu sẽ mất luôn giá và số dư. */}

      {/* Order method + Price — hidden until nhiệm vụ ⑤ while in Cấp 0
          (spec §8; `hidePriceAndType` is always false outside Cấp 0, so this
          renders exactly as before on /bieu-do & /co-phieu). */}
      {!hidePriceAndType && (
        <>
          {/* Order method */}
          <div className={skin ? "op-field" : undefined}>
            <Select value={method} onChange={(v) => setMethod(v)} size="small">
              <Select.Option value="market">Lệnh thị trường (MP)</Select.Option>
              <Select.Option value="limit">Lệnh giới hạn (LO)</Select.Option>
            </Select>
          </div>

          {/* Price */}
          <Tooltip
            content={
              isCap0Active && task1Done
                ? "Bạn vừa mở khóa ô Giá. Nãy giờ bạn dùng lệnh THỊ TRƯỜNG (MP) — mua ngay ở giá bên bán. Nhập giá cụ thể vào ô này là lệnh GIỚI HẠN (LO): 'tôi chỉ mua nếu giá về mức X' — máy chờ giúp bạn. Chủ động hơn, nhưng có thể không khớp."
                : ""
              }
            disabled={!(isCap0Active && task1Done)}
          >
            <div className={skin ? "op-field" : "space-y-1"}>
              <label
                className={skin ? "op-field-label" : "text-xs font-medium text-[var(--color-text-3)]"}
              >
                Giá
              </label>
              {/* `mode="button"` kẹp ô nhập giữa hai nút +/− to đùng; mockup vẽ
                  một ô trơn, nên trong skin dùng `mode="embed"` (mũi tên chỉ
                  hiện khi hover). Vẫn là `InputNumber` — `role="spinbutton"`,
                  phím mũi tên, `min`/`step` giữ nguyên. */}
              <InputNumber
                mode={skin ? "embed" : "button"}
                step={100}
                min={0}
                value={numPrice}
                onChange={(v) => setPrice(v ?? 0)}
                disabled={method === "market"}
                className="w-full"
              />
            </div>
          </Tooltip>
        </>
      )}

      {/* Volume + fee — merged under one `data-tour-id` (Bảng điện tour point
          ⑥, spec `IQX-Tour-BangDien.md`): real adjacent siblings already,
          just wrapped so the spotlight covers both blocks. */}
      <div data-tour-id="cap0-tour-volume-fee">
        {/* Volume */}
        <div className={skin ? "op-field" : "space-y-1"}>
          <div className={skin ? "op-field-row" : "flex items-center justify-between"}>
            <label
              className={skin ? "op-field-label" : "text-xs font-medium text-[var(--color-text-3)]"}
            >
              Khối lượng
            </label>
            {side === "sell" && positionQty > 0 && (
              <span className={skin ? "op-field-max" : "text-xs text-[var(--color-text-3)]"}>
                Tối đa: {positionQty.toLocaleString("en-US")}
              </span>
            )}
          </div>
          <InputNumber
            mode={skin ? "embed" : "button"}
            step={100}
            min={0}
            value={volume}
            onChange={(v) => {
              setVolume(v ?? 0)
              // Cấp 3: user sửa tay → thôi auto-fill (spec §6.3 "vẫn sửa tay
              // được"). No-op outside Cấp 3.
              if (isCap3Active) setCap3VolumeTouched(true)
            }}
            className="w-full"
          />
          {/* ★ ẨN THEO CẤP (spec v3.0 §8) — mockup `iqx-cap0-datlenh.html` chỉ
              vẽ ô Khối lượng. Cấp 0 mua đúng 100 CP VNM theo kịch bản, nên nút
              "% số dư" vừa thừa vừa dễ làm user đặt sai khối lượng. Giữ nguyên
              từ Cấp 1 và trên /bieu-do, /co-phieu — ở đó đây là công cụ thật. */}
          {!isCap0Active && (
            <Radio.Group
              type="button"
              size="mini"
              className={cn("w-full pt-1", skin && "op-pct")}
              onChange={(v) => handlePct(v)}
              options={[10, 25, 50, 100].map((p) => ({ label: `${p}%`, value: p }))}
            />
          )}
        </div>

        {/* Summary */}
        <div
          className={
            skin ? "op-fee" : "mt-2 space-y-1 rounded-md bg-[var(--color-fill-2)] p-2 text-xs"
          }
        >
          {/* ★ ẨN THEO CẤP — mockup Cấp 0 chỉ vẽ dòng phí. "Giá trị" và "Tổng"
              là cùng một con số nhìn từ hai phía, thừa với người đang mua lệnh
              đầu tiên. */}
          {!isCap0Active && (
            <div className={skin ? "op-fee-row" : "flex justify-between"}>
              <span className={skin ? undefined : "text-[var(--color-text-3)]"}>Giá trị</span>
              <span
                className={
                  skin ? "op-fee-v" : "font-medium tabular-nums text-[var(--color-text-1)]"
                }
              >
                {orderValue > 0 ? fmtVnd(orderValue) : "—"}
              </span>
            </div>
          )}
          <div className={skin ? "op-fee-row" : "flex justify-between"}>
            {/* Mockup `iqx-cap0-datlenh.html` `.op-fee` spells this out for a
                beginner; the shared terminal keeps the compact label so
                /bieu-do & /co-phieu are untouched. (Số en-US per project
                convention — the mockup's "0,15%" is vi-VN.) */}
            <span className={skin ? undefined : "text-[var(--color-text-3)]"}>
              {isCap0Active ? "Phí giao dịch (0.15%)" : "Phí GD (0.15%)"}
            </span>
            <span
              className={
                skin ? "op-fee-v" : "font-medium tabular-nums text-[var(--color-text-1)]"
              }
            >
              {fee > 0 ? fmtVnd(fee) : "—"}
            </span>
          </div>
          {!isCap0Active && (
            <>
              <Divider className="my-1" />
              <div
                className={
                  skin ? "op-fee-row op-fee-total" : "flex justify-between text-sm font-semibold"
                }
              >
                <span>Tổng</span>
                <span
                  className={
                    skin ? "op-fee-v" : "tabular-nums text-[rgb(var(--primary-6))]"
                  }
                >
                  {orderValue > 0 ? fmtVnd(orderValue + fee) : "—"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kế hoạch (spec v3.0 §4 THÊM MỚI) — buy-side only AND Cấp 0-only: the
          reason chips are a Cấp 0 onboarding aid and must have zero effect on
          normal trading outside Cấp 0 (`isCap0Active` false on /bieu-do &
          /co-phieu → this never renders there). v3.0 removed the block's
          cắt lỗ/chốt lời half entirely — both the pre-① read-only preset and
          the post-① typed inputs (and the "cổng chất lượng 1" keydown gate
          they carried), since Cấp 0 has neither concept any more (§4, §8,
          §13). The block's content no longer varies with task ①. */}
      {/* Kế hoạch + nút Đặt lệnh — merged under one `data-tour-id` (Bảng
          điện tour point ⑦, spec `IQX-Tour-BangDien.md`): real adjacent
          blocks (Kế hoạch renders only buy-side/Cấp 0; the Submit button
          always renders). */}
      <div data-tour-id="cap0-tour-plan-submit">
        {/* Cấp 0's 5-chip Kế hoạch block is hidden inside Cấp 1 (spec §0
            "ẨN THEO CẤP — Khối 5 chip lý do đời thường của Cấp 0 → ẨN, thay
            bằng Form Kế hoạch 2 trường") — the explicit `!isCap1Active` is
            belt-and-suspenders since the two providers shouldn't both wrap
            the page at once, but keeps this branch inert either way. */}
        {side === "buy" && isCap0Active && !isCap1Active && (
          <PlanBlock
            symbol={symbol}
            reason={reason}
            onReason={(r) => {
              setReason(r)
              cap0Events.onReasonPicked?.(r)
            }}
          />
        )}

        {/* Cấp 1 Form Kế hoạch 2 trường + AI Thanh tra (spec §4/§5, THÊM MỚI)
            — buy-side only AND Cấp 1-only (`isCap1Active` false outside a
            `Cap1Provider` → zero effect on Cấp 0 or normal trading). */}
        {side === "buy" && isCap1Active && (
          <>
            {/* Cấp 4 khối "Đọc 5 lớp" (spec §5, THÊM MỚI) — REPLACES Cấp 1's
                lý-do field (hidden via `hideLyDo` below) and Cấp 1's AI Thanh
                tra; Vùng mua + Cấp 2's SL/TP + Cấp 3's Quản lý vốn stay
                intact. Rendered FIRST, per the spec's panel order
                (1. Đọc 5 lớp → 2. Vùng mua → 3. Cắt lỗ/Chốt lời). Buy-side
                only AND Cấp 4-only. */}
            {isCap4Active && (
              <Doc5LopBlock
                symbol={symbol}
                currentPrice={currentPrice}
                doc5Lop={cap4Doc5Lop}
                onRate={(lop, nhanDinh) => {
                  setCap4Doc5Lop((prev) => ({ ...prev, [lop]: nhanDinh }))
                  cap4Events.onLopRated?.(lop, nhanDinh)
                }}
                onAi5Lop={setCap4Ai5Lop}
              />
            )}
            {/* Cấp 6 bước "Đối chiếu" (spec §4, THÊM MỚI) — NGAY DƯỚI khối Đọc 5
                lớp: nó đọc chính bản chấm đó, nên các mức phải có trước. Khối tự
                trả `null` khi 5 lớp KHÔNG mâu thuẫn → không khối, không request,
                không cổng cứng (đặt lệnh y như Cấp 5). Buy-side only AND Cấp
                6-only (`isCap6Active` false outside a `Cap6Provider` → zero
                effect on Cấp 0-5 or normal trading). KHÔNG chạm vào bất kỳ khối
                nào của Cấp 1-5. */}
            {isCap6Active && (
              <DoiChieuBlock
                symbol={symbol}
                doc5Lop={cap4Doc5Lop}
                lopQuyetDinh={cap6LopQuyetDinh}
                onLopQuyetDinh={setCap6LopQuyetDinh}
                lyDo={cap6LyDo}
                onLyDo={setCap6LyDo}
                kieuCoPhieu={cap6Kieu}
                onKieuCoPhieu={setCap6Kieu}
              />
            )}
            <PlanFormCap1
              symbol={symbol}
              hideLyDo={isCap4Active}
              lyDo={cap1LyDo}
              onLyDoChange={(l) => {
                setCap1LyDo(l)
                setCap1Verdict(null)
                setCap1Snapshot(null)
                setCap1DocChiTiet(false)
                cap1Events.onLyDoPicked?.(l)
              }}
              vungMua={cap1VungMua}
              onVungMuaChange={setCap1VungMuaOverride}
            />
            {/* Cấp 2 khối "Cắt lỗ / Chốt lời" (spec §5.1/§5.4, THÊM MỚI) —
                inserted NGAY SAU trường Vùng mua (i.e. right after
                `PlanFormCap1`, before AI Thanh tra) — buy-side only AND Cấp
                2-only (`isCap2Active` false outside a `Cap2Provider` → zero
                effect on Cấp 1-only or normal trading). Hiện LUÔN (not
                gated on `cap1LyDo` — spec §5.1 "không phải bấm nút mới hiện"). */}
            {isCap2Active && (
              <SlTpBlock
                symbol={symbol}
                giaVao={cap1VungMua ?? currentPrice}
                selected={cap2Method}
                onSelect={(m, catLo, chotLoi) => {
                  setCap2Method(m)
                  setCap2CatLo(catLo)
                  setCap2ChotLoi(chotLoi)
                  cap2Events.onSlTpPicked?.(m, catLo, chotLoi)
                }}
              />
            )}
            {/* Cấp 3 khối "Quản lý vốn" (spec §6, THÊM MỚI) — buy-side only AND
                Cấp 3-only. Khẩu vị phải đặt xong (`khau_vi`) mới tính được khối
                lượng; `KhauViModal` bên dưới lo phần đó. */}
            {isCap3Active && cap3Progress?.khau_vi && (
              <QuanLyVonBlock
                khauVi={cap3Progress.khau_vi}
                vonBanDau={cap3Progress.von_ban_dau}
                giaVao={cap1VungMua ?? currentPrice}
                mucTuTin={cap3MucTuTin}
                onMucTuTin={(m) => {
                  setCap3MucTuTin(m)
                  // Đổi mức tự tin = ý định mới → cho auto-fill ô Khối lượng lại.
                  setCap3VolumeTouched(false)
                }}
                cachKhoiLuong={cap3Cach}
                onCachKhoiLuong={(c) => {
                  setCap3Cach(c)
                  setCap3VolumeTouched(false)
                }}
                onKhoiLuong={(kl, pctVon) => {
                  setCap3KhoiLuong(kl)
                  setCap3PctVon(pctVon)
                  // Tự điền ô Khối lượng — trừ khi user đã sửa tay (spec §6.3).
                  if (!cap3VolumeTouched && kl > 0) setVolume(kl)
                }}
                onDoiKhauVi={() => setCap3KhauViOpen(true)}
              />
            )}
            {/* Chỉ instance ĐỔI khẩu vị (spec §5.2 "không khoá vĩnh viễn").
                Instance bắt buộc lần đầu do trang Cấp 3 mount (xem
                `KhauViModal`'s doc) — không nhân bản ở đây. */}
            {isCap3Active && cap3KhauViOpen && (
              <KhauViModal
                vonBanDau={cap3Progress?.von_ban_dau}
                forceOpen
                onClose={() => setCap3KhauViOpen(false)}
              />
            )}
            {/* Cấp 1's AI Thanh tra is HIDDEN inside Cấp 4 (spec §5: the khối
                "Đọc 5 lớp" replaces it — showing AI per-lớp before the user
                rates would be exactly the "nhìn bài" it forbids). `cap1LyDo`
                is always null in Cấp 4 anyway (no picker), so the explicit
                `!isCap4Active` is belt-and-suspenders. */}
            {cap1LyDo && !isCap4Active && (
              <AiThanhTra
                symbol={symbol}
                lyDo={cap1LyDo}
                currentPrice={currentPrice}
                onVerdict={(v, snapshot) => {
                  setCap1Verdict(v)
                  setCap1Snapshot(snapshot)
                }}
                onDocChiTiet={() => {
                  setCap1DocChiTiet(true)
                  cap1Events.onDocChiTietClicked?.(cap1LyDo)
                }}
                onChonLyDoKhac={() => {
                  setCap1LyDo(null)
                  setCap1Verdict(null)
                  setCap1Snapshot(null)
                }}
                // ★★ «Đọc chi tiết lớp này →» mở NGAY TRONG panel thay vì
                // `navigate('/co-phieu/:sym')`. `AiThanhTra` chỉ tồn tại bên
                // trong shell cấp, nên cú bấm cũ là 100% một cú ném-ra — và
                // form kế hoạch đang gõ dở (state của chính panel này) mất
                // trắng theo. Dùng lại đúng payload 6 lớp mà `AiThanhTra` vừa
                // fetch, không dựng nguồn dữ liệu mới.
                onOpenDetail={() => setChiTietMo(true)}
              />
            )}
          </>
        )}

        {/* Cấp 7 khối "Đọc sổ lệnh" (spec §4/§5, THÊM MỚI) — NGAY TRƯỚC nút MUA.
            Một LỚP PHỦ ĐỌC lên chính sổ bid/ask `OrderBookView` đang vẽ ở trên
            (spec §4: "thêm lớp phủ đọc… KHÔNG dựng lại sổ"): `data.bid`/
            `data.ask` truyền xuống làm prop, khối không tự gọi `usePrice`.
            Buy-side only AND Cấp 7-only (`isCap7Active` false outside a
            `Cap7Provider` → zero effect on Cấp 0-6 or normal trading).

            ★ KHÔNG nằm trong khối `isCap1Active` ở trên và KHÔNG có mặt trong
            chuỗi `disabled` bên dưới: Cấp 7 không thêm bất kỳ cổng cứng nào
            (spec §9) — bỏ qua bước này thì đặt lệnh y như Cấp 6. */}
        {side === "buy" && isCap7Active && (
          <DocSoLenhBlock
            symbol={symbol}
            bid={data?.bid ?? []}
            ask={data?.ask ?? []}
            docLuc={cap7DocLuc}
            onDocLuc={setCap7DocLuc}
            hanhViCo={cap7HanhViCo}
            onHanhViCo={setCap7HanhViCo}
          />
        )}

        {/* Cấp 8 bước "Kiểm tra danh mục" (spec §4, 🟢 THÊM MỚI) — NGAY TRƯỚC nút
            MUA, sau khối Đọc sổ lệnh của Cấp 7: nó là bước cuối trước khi xác
            nhận, và nó nói về CẢ DANH MỤC chứ không về riêng mã này. Buy-side
            only AND Cấp 8-only (`isCap8Active` false outside a `Cap8Provider` →
            zero effect on Cấp 0-7 or normal trading).

            ★ KHÔNG nằm trong khối `isCap1Active` ở trên và KHÔNG có mặt trong
            chuỗi `disabled` bên dưới: Cấp 8 không thêm bất kỳ cổng cứng nào
            (spec §9, §C8) — bỏ qua bước này thì đặt lệnh y như Cấp 7. */}
        {side === "buy" && isCap8Active && (
          <KiemTraDanhMucBlock
            symbol={symbol}
            khoiLuong={numVolume}
            gia={numPrice}
            catLo={cap2CatLo}
            hanhVi={cap8HanhVi}
            onHanhVi={setCap8HanhVi}
            onGiamKhoiLuong={() => {
              // Sửa CHÍNH ô Khối lượng của Cấp 3, giữ luật lô 100 (spec §6.3).
              setVolume((v) => giamKhoiLuong(v))
              // ★ Đây là một lần user sửa tay: nếu không đánh dấu, auto-fill của
              // Cấp 3 sẽ ghi đè lại con số vừa giảm ngay lần render sau — đúng
              // lúc user vừa chọn làm điều an toàn hơn.
              if (isCap3Active) setCap3VolumeTouched(true)
            }}
            onChonMaKhac={() => {
              // ★★ CỐ Ý KHÔNG LÀM GÌ Ở ĐÂY — và tuyệt đối KHÔNG `setSymbol("")`.
              //
              // Mã rỗng là một trạng thái KHÔNG TỒN TẠI ở bất kỳ chỗ nào khác
              // trong terminal dùng chung: `CenterPanel` → `TVChart` key toàn bộ
              // effect khởi tạo theo `symbol`, nên một cú bấm "Chọn mã khác" sẽ
              // huỷ và dựng lại widget TradingView trên một mã không phân giải
              // được (kèm một vòng `chartDrawingsApi.get("")`), rồi huỷ và dựng
              // lại lần nữa khi bước chọn mã trả mã về.
              //
              // Bước chọn mã được mở từ CHÍNH bus Cấp 8: `KiemTraDanhMucBlock` đã
              // bắn `cap8Events.onCheckHanhVi("chon_ma_khac")` trước khi gọi
              // callback này, và `Cap8Terminal` mở hộp chọn mã từ event đó — mã
              // đang xem không bao giờ phải đi qua trạng thái rỗng.
            }}
          />
        )}

        {/* Submit — Cấp 1's cổng cứng (spec §4) disables MUA until lý do +
            vùng mua are both set; Cấp 2's cổng cứng (spec §5.4) ALSO
            requires a cách cắt lỗ/chốt lời chosen (ON TOP OF Cấp 1's, since
            Cấp 2 keeps Cấp 1's form 100% intact). Both flags are always
            false outside their own cấp or on a SELL, so neither affects
            Cấp 0 or normal trading. */}
        <Tooltip
          content={
            cap1SubmitDisabled
              ? isCap4Active
                ? "Nhập vùng mua mới đặt được lệnh."
                : "Chọn lý do mua và vùng mua mới đặt được lệnh."
              : cap2SubmitDisabled
                ? "Chọn 1 trong 2 cách cắt lỗ/chốt lời mới đặt được lệnh."
                : cap3SubmitDisabled
                  ? "Chấm mức tự tin và chọn cách tính khối lượng mới đặt được lệnh."
                  : cap4SubmitDisabled
                    ? "Chấm đủ cả 5 lớp mới đặt được lệnh."
                    : cap6SubmitDisabled
                      ? "Chọn lớp bạn quyết định tin và ghi 1 dòng vì sao mới đặt được lệnh."
                      : ""
          }
          disabled={
            !(
              cap1SubmitDisabled ||
              cap2SubmitDisabled ||
              cap3SubmitDisabled ||
              cap4SubmitDisabled ||
              cap6SubmitDisabled
            )
          }
        >
          <div>
            <Button
              long
              loading={placeOrder.isPending}
              disabled={
                cap1SubmitDisabled ||
                cap2SubmitDisabled ||
                cap3SubmitDisabled ||
                cap4SubmitDisabled ||
                cap6SubmitDisabled
              }
              onClick={handleSubmit}
              className={
                // Giữ `Button` của Arco (còn `loading`, `disabled` và cái
                // `Tooltip` bọc ngoài phụ thuộc vào nó) — chỉ mặc lại vỏ. Luật
                // CSS neo dưới `.op-panel` nên đủ specificity thắng `.arco-btn`
                // mà không cần `!important`.
                skin
                  ? cn("op-btn", side === "sell" && "op-btn--sell")
                  : cn(
                      "mt-2 font-bold text-white",
                      side === "buy"
                        ? "!border-up !bg-up hover:!opacity-90"
                        : "!border-down !bg-down hover:!opacity-90",
                    )
              }
            >
              {side === "buy" ? "ĐẶT LỆNH MUA" : "ĐẶT LỆNH BÁN"}
            </Button>
          </div>
        </Tooltip>
      </div>

      {/* ★★ Đích của «Đọc chi tiết lớp này →»: bản đọc 6 lớp mở NGAY TRONG
          terminal. Trước đây nút đó `navigate('/co-phieu/:sym')` — rời cấp và
          xoá sạch form kế hoạch đang gõ dở ở ngay phía trên. */}
      <AiInsightDetailModal
        visible={chiTietMo === true}
        symbol={symbol}
        onClose={dongChiTiet}
      />
    </div>
  )
}

/* ── Account strip / activation ── */
function AccountStrip({
  positionQty,
  symbol,
  onPremiumRequired,
}: {
  positionQty: number
  symbol: string
  onPremiumRequired: OnPremiumRequired
}) {
  const { data: account, isLoading, isError } = useAccount()
  const activate = useActivateAccount()
  const navigate = useNavigate()
  // `isCap0Active` chỉ true bên trong `Cap0Provider` (tức `Cap0TradingPage`),
  // nên /bieu-do, /co-phieu và Cấp 1+ không đổi gì.
  const { isCap0Active } = useCap0Events()
  const skin = useMockupPanelSkin()

  const handleActivate = async () => {
    try {
      await activate.mutateAsync()
      Message.success("Kích hoạt Đấu trường ảo thành công! Bạn nhận 1 tỷ VND ảo.")
    } catch (err) {
      const msg = await getErrorMessage(err, "Kích hoạt thất bại")
      if (/premium|gói premium/i.test(msg)) {
        Message.error(msg)
        // ★★ Cùng lý do với `OrderEntry`: rất dễ chạm ở Cấp 0/1 vì nhiệm vụ
        // bảo user bấm ĐÚNG nút này — thấy lỗi thì được, bị đá khỏi cấp thì không.
        if (onPremiumRequired) onPremiumRequired()
        else navigate("/nang-cap")
      } else {
        Message.error(msg)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <IconLoading spin />
      </div>
    )
  }

  // No account yet (404 / error) → offer activation.
  if (isError || !account) {
    return (
      <div className="border-b border-[var(--color-border-2)] px-2 py-2">
        <Button
          long
          type="primary"
          size="small"
          icon={<IconThunderbolt />}
          loading={activate.isPending}
          onClick={handleActivate}
        >
          Kích hoạt Đấu trường ảo
        </Button>
      </div>
    )
  }

  // Mockup `.op-balance`: một dải nền `--bg3` bo 7px, nhãn trái / số phải.
  // Ở Cấp 0 nó là DÒNG DUY NHẤT (lãi/lỗ + WR + "đang giữ" đều ẩn theo cấp);
  // Cấp 1 vẫn có chúng nên chúng đi vào `.op-balance-extra` ngay dưới dải.
  if (skin) {
    return (
      <>
        <div className="op-balance">
          <span className="op-balance-l">
            <IconWallet />
            {isCap0Active ? "Số dư Sân tập" : "Số dư"}
          </span>
          <span className="op-balance-v">{fmtVnd(account.balance)}đ</span>
        </div>
        {!isCap0Active && (
          <div className="op-balance-extra">
            <span
              className={cn(
                "flex items-center gap-1 font-medium",
                account.pnl >= 0 ? "op-tone-up" : "op-tone-down",
              )}
            >
              {account.pnl >= 0 ? <IconArrowRise /> : <IconArrowFall />}
              {account.pnl >= 0 ? "+" : ""}
              {fmtVnd(account.pnl)}đ ({account.pnlPercent >= 0 ? "+" : ""}
              {account.pnlPercent}%)
            </span>
            <span className="flex items-center gap-1">
              <IconTrophy />
              WR: {account.winRate}%
            </span>
            {positionQty > 0 && (
              <span>
                Đang giữ {symbol}: {positionQty.toLocaleString("en-US")} CP
              </span>
            )}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-1 border-b border-[var(--color-border-2)] px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-3)]">
          <IconWallet />
          {isCap0Active ? "Số dư Sân tập" : "Số dư"}
        </span>
        <span className="text-xs font-bold tabular-nums text-[var(--color-text-1)]">
          {fmtVnd(account.balance)}đ
        </span>
      </div>
      {/* ★ ẨN THEO CẤP (spec v3.0 §8) — mockup `iqx-cap0-datlenh.html` chỉ vẽ
          Số dư. Lãi/lỗ luỹ kế + tỷ lệ thắng là ngôn ngữ của người đã giao dịch
          một thời gian; ở Cấp 0 user còn chưa đóng nổi một vòng lệnh nên hai
          con số đó chỉ gây nhiễu. Từ Cấp 1 trở lên và trên /bieu-do, /co-phieu
          giữ nguyên như cũ. */}
      {!isCap0Active && (
        <div className="flex gap-2">
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              account.pnl >= 0 ? "text-up" : "text-down",
            )}
          >
            {account.pnl >= 0 ? <IconArrowRise /> : <IconArrowFall />}
            {account.pnl >= 0 ? "+" : ""}
            {fmtVnd(account.pnl)}đ ({account.pnlPercent >= 0 ? "+" : ""}
            {account.pnlPercent}%)
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-3)]">
            <IconTrophy />
            WR: {account.winRate}%
          </span>
        </div>
      )}
      {!isCap0Active && positionQty > 0 && (
        <div className="flex items-center justify-between rounded bg-[var(--color-fill-2)] px-1.5 py-0.5 text-[10px]">
          <span className="text-[var(--color-text-3)]">Đang giữ {symbol}</span>
          <span className="font-semibold text-[var(--color-text-1)]">
            {positionQty.toLocaleString("en-US")} CP
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Stock header (search + price info) ── */
function StockHeader({
  symbol,
  data,
  isLoading,
  symbolLink,
}: {
  symbol: string
  data: PriceBoardData | null
  isLoading: boolean
  symbolLink: SymbolLink
}) {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal } = useAuth()
  const { isWatched, toggle, isPending } = useWatchlistToggle()
  const { data: info } = useSymbolInfo(symbol)
  const cap0Events = useCap0Events()
  const skin = useMockupPanelSkin()

  const handleToggle = async () => {
    if (!isAuthenticated) {
      Message.warning("Đăng nhập để theo dõi mã CK")
      setShowAuthModal(true)
      return
    }
    const wasWatched = isWatched(symbol)
    try {
      await toggle(symbol)
      const nowWatched = !wasWatched
      cap0Events.onStarToggled?.(symbol, nowWatched)
      Message.success(
        wasWatched ? `Đã bỏ theo dõi ${symbol}` : `Đã thêm ${symbol} vào danh sách`,
      )
    } catch (err) {
      Message.error(await getErrorMessage(err, `Không thể cập nhật ${symbol}`))
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center border-b border-[var(--color-border-2)] py-4">
        <Spin />
      </div>
    )
  }

  const watched = isWatched(data.symbol)
  const netForeign = data.foreignBuy - data.foreignSell

  /**
   * Cụm ticker + Trần/TC/Sàn theo mockup (`.op-ticker` · `.op-sub` · `.op-refs`).
   *
   * Khác bản thường ở BỐ CỤC chứ không chỉ ở màu: mockup xếp mã ★ bên trái và
   * giá bên phải TRÊN CÙNG một dòng (baseline chung), rồi tên công ty · sàn
   * xuống dòng dưới. Bản thường xếp thành ba tầng (mã | sàn / tên / giá).
   *
   * `data-tour-id` giữ y nguyên cả hai — tour Bảng điện nhắm vào chúng.
   */
  if (skin) {
    const refs: { label: string; value: string; tone?: string }[] = [
      { label: "Trần", value: fmtPrice(data.ceilingPrice), tone: "op-tone-ceil" },
      { label: "TC", value: fmtPrice(data.referencePrice), tone: "op-tone-ref" },
      { label: "Sàn", value: fmtPrice(data.floorPrice), tone: "op-tone-floor" },
    ]
    // ★ ẨN THEO CẤP không đổi: ba ô này vẫn chỉ ẩn ở Cấp 0 (spec v3.0 §8), ở
    // Cấp 1 chúng vẫn hiện — lưới 3 cột tự xuống hàng thứ hai, vẫn đúng hình.
    if (!cap0Events.isCap0Active) {
      refs.push(
        { label: "KL", value: fmtCompact(data.totalVolume) },
        {
          label: "NN",
          value: `${netForeign >= 0 ? "+" : ""}${fmtCompact(netForeign)}`,
          tone: netForeign >= 0 ? "op-tone-up" : "op-tone-down",
        },
        { label: "GTGD", value: fmtCompact(data.totalValue) },
      )
    }

    return (
      <div data-tour-id="cap0-tour-stock-header">
        <div className="op-ticker">
          <div className="op-ticker-id">
            <StockLogo symbol={data.symbol} size={22} />
            {symbolLink === "none" ? (
              // Trong shell cấp: mã là NHÃN, không phải lối ra. Không còn
              // `<button>` nghĩa là không còn cả bàn phím lẫn chuột dẫn ra.
              <span className="op-ticker-code">{data.symbol}</span>
            ) : (
              <button
                type="button"
                className="op-ticker-code"
                onClick={() => navigate(`/co-phieu/${data.symbol}`)}
              >
                {data.symbol}
              </button>
            )}
            <button
              type="button"
              onClick={handleToggle}
              disabled={isPending}
              className={cn("op-ticker-star", watched && "op-ticker-star--on")}
              aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
            >
              {watched ? <IconStarFill /> : <IconStar />}
            </button>
          </div>
          <div
            className={cn(
              "op-ticker-price",
              priceToneClass(
                data.closePrice,
                data.referencePrice,
                data.ceilingPrice,
                data.floorPrice,
              ),
            )}
          >
            {fmtPrice(data.closePrice)}
            <span
              className={cn(
                "op-ticker-chg",
                data.priceChange >= 0 ? "op-tone-up" : "op-tone-down",
              )}
            >
              {data.percentChange >= 0 ? "+" : ""}
              {data.percentChange?.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="op-sub">
          {[info?.shortName, data.exchange].filter(Boolean).join(" · ")}
        </div>

        <div data-tour-id="cap0-tour-price-bands" className="op-refs">
          {refs.map((r) => (
            <div key={r.label} className="op-ref">
              <div className="op-ref-l">{r.label}</div>
              <div className={cn("op-ref-v", r.tone)}>{r.value}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      data-tour-id="cap0-tour-stock-header"
      className="space-y-1 border-b border-[var(--color-border-2)] px-3 py-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StockLogo symbol={data.symbol} size={28} />
          {/* ★ Nhánh KHÔNG skin — chính là nhánh Cấp 2→8 render (skin chỉ bật
              ở Cấp 0 và Cấp 1-không-Cấp-2). Phải vá CÙNG LÚC với nhánh skin ở
              trên, nếu không tắt skin là lỗ hổng mở lại nguyên vẹn. */}
          {symbolLink === "none" ? (
            <span className="text-sm font-bold text-[var(--color-text-1)]">{data.symbol}</span>
          ) : (
            <button
              type="button"
              className="text-sm font-bold text-[var(--color-text-1)] hover:text-[rgb(var(--primary-6))]"
              onClick={() => navigate(`/co-phieu/${data.symbol}`)}
            >
              {data.symbol}
            </button>
          )}
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={cn(
              watched ? "text-[rgb(var(--orange-6))]" : "text-[var(--color-text-3)]",
              "hover:opacity-70",
            )}
            aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
          >
            {watched ? <IconStarFill /> : <IconStar />}
          </button>
        </div>
        <Tag size="small">{data.exchange}</Tag>
      </div>

      {info?.shortName && (
        <p className="truncate text-[10px] text-[var(--color-text-3)]">{info.shortName}</p>
      )}

      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-black tabular-nums tracking-tight",
            priceColorClass(data.closePrice, data.referencePrice, data.ceilingPrice, data.floorPrice),
          )}
        >
          {fmtPrice(data.closePrice)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-semibold",
            data.priceChange >= 0 ? "text-up" : "text-down",
          )}
        >
          {data.priceChange > 0 ? (
            <IconArrowRise />
          ) : data.priceChange < 0 ? (
            <IconArrowFall />
          ) : (
            <IconMinus />
          )}
          {data.priceChange >= 0 ? "+" : ""}
          {fmtPrice(data.priceChange)} ({data.percentChange >= 0 ? "+" : ""}
          {data.percentChange?.toFixed(2)}%)
        </span>
      </div>

      {/* Mini stats */}
      <div
        data-tour-id="cap0-tour-price-bands"
        className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px]"
      >
        <Stat label="Trần" value={fmtPrice(data.ceilingPrice)} className="text-ceiling" />
        <Stat label="TC" value={fmtPrice(data.referencePrice)} className="text-reference" />
        <Stat label="Sàn" value={fmtPrice(data.floorPrice)} className="text-floor" />
        {/* ★ ẨN THEO CẤP (spec v3.0 §8) — mockup `iqx-cap0-datlenh.html` chỉ vẽ
            hàng Trần/TC/Sàn. KL / NN (khối ngoại) / GTGD là ba khái niệm Cấp 0
            chưa dạy; NN đến tận Cấp 4 mới có nghĩa. Giữ nguyên `data-tour-id`
            ở lưới bên ngoài để bước tour Bảng điện vẫn có target. */}
        {!cap0Events.isCap0Active && (
          <>
            <Stat label="KL" value={fmtCompact(data.totalVolume)} />
            <Stat
              label="NN"
              value={`${data.foreignBuy - data.foreignSell >= 0 ? "+" : ""}${fmtCompact(data.foreignBuy - data.foreignSell)}`}
              className={data.foreignBuy - data.foreignSell >= 0 ? "text-up" : "text-down"}
            />
            <Stat label="GTGD" value={fmtCompact(data.totalValue)} />
          </>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-text-3)]">{label}</span>
      <span className={cn("font-medium tabular-nums text-[var(--color-text-1)]", className)}>
        {value}
      </span>
    </div>
  )
}

/* ── Premium-only order entry wrapper ── */
function GatedOrderEntry(props: {
  symbol: string
  data: PriceBoardData | null
  balance: number
  positionQty: number
  priceLoading: boolean
  hideHeader: boolean
  symbolLink: SymbolLink
  onPremiumRequired: OnPremiumRequired
}) {
  const { isPremium, isLoading } = usePremiumStatus()
  const { isCap0Active } = useCap0Events()
  const navigate = useNavigate()
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const skin = useMockupPanelSkin()

  /** Vỏ thẻ — mockup `.order-panel` khi có skin, còn lại giữ nguyên như cũ. */
  const shell = skin
    ? cn("op-panel", skin === "cap1" && "op-panel--cap1")
    : "space-y-2 px-2 pb-3"

  /**
   * ★ Vỏ thẻ theo mockup `iqx-cap0-datlenh.html` / `iqx-cap1-datlenh.html`:
   * MUA/BÁN → ticker + Trần/TC/Sàn → Số dư, rồi mới tới phần form. Trước đây
   * `StockHeader`/`AccountStrip` là hai khối rời NẰM TRÊN tabs ở `TradingPanel`,
   * nên panel đọc ngược mockup.
   *
   * Cụm này render TRƯỚC mọi nhánh cổng bên dưới — đó là điểm mấu chốt: nếu
   * đặt nó trong `OrderEntry` thì user không Premium ngoài Cấp 0 (thấy lời mời
   * nâng cấp thay cho form) sẽ mất luôn giá và số dư trên /bieu-do, /co-phieu.
   *
   * `data-tour-id` giữ nguyên cho tour Bảng điện điểm ⑤ (MUA/BÁN + Số dư) —
   * và giờ hai thứ đó cuối cùng cũng là DOM sibling thật, đúng như bước tour
   * đó luôn muốn.
   */
  /**
   * Tabs MUA/BÁN. Có skin thì đây là segmented control của mockup (`.op-tabs`)
   * — Arco `Tabs` dựng header + ink bar + content pane, muốn ra hình này phải
   * gỡ gần hết nên thay hẳn bằng 2 `<button>` thật. Button gốc giữ nguyên focus
   * bằng Tab và kích hoạt bằng Enter/Space, thêm `role="tab"`/`aria-selected`
   * để screen reader vẫn đọc ra đây là một cặp tab.
   *
   * KHÔNG có skin thì Arco `Tabs` y nguyên — /bieu-do, /co-phieu và Cấp 2→8
   * không đổi một pixel nào.
   */
  const tabs = skin ? (
    <div className="op-tabs" role="tablist" aria-label="Chiều lệnh">
      {(["buy", "sell"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={side === v}
          onClick={() => setSide(v)}
          className={cn(
            "op-tab",
            side === v && (v === "buy" ? "op-tab--on-buy" : "op-tab--on-sell"),
          )}
        >
          {v === "buy" ? "MUA" : "BÁN"}
        </button>
      ))}
    </div>
  ) : (
    <Tabs
      activeTab={side}
      onChange={(v) => setSide(v as "buy" | "sell")}
      className="mt-2 [&_.arco-tabs-content]:hidden"
    >
      <Tabs.TabPane key="buy" title={<span className="font-semibold">MUA</span>} />
      <Tabs.TabPane key="sell" title={<span className="font-semibold">BÁN</span>} />
    </Tabs>
  )

  const cardHead = (
    <div data-tour-id="cap0-tour-buysell-balance">
      {tabs}
      {!props.hideHeader && (
        <StockHeader
          symbol={props.symbol}
          data={props.data}
          isLoading={props.priceLoading}
          symbolLink={props.symbolLink}
        />
      )}
      <AccountStrip
        positionQty={props.positionQty}
        symbol={props.symbol}
        onPremiumRequired={props.onPremiumRequired}
      />
    </div>
  )

  if (isLoading) {
    return (
      <div className={shell}>
        {cardHead}
        <div className="flex justify-center py-4">
          <Spin />
        </div>
      </div>
    )
  }

  // Cấp 0 «Sân tập» practice trading ungates the order form without a
  // premium plan (spec §2) — `isCap0Active` is only ever true inside a
  // `Cap0Provider` (i.e. `Cap0TradingPage`), so /bieu-do & /co-phieu (no
  // provider there) keep the premium gate exactly as before.
  if (!isPremium && !isCap0Active) {
    return (
      <div className={shell}>
        {cardHead}
        <div className="space-y-2 px-2 py-4 text-center">
          <p className="text-xs text-[var(--color-text-3)]">
            Đặt lệnh Đấu trường ảo yêu cầu gói Premium.
          </p>
          <Button type="primary" size="small" icon={<IconThunderbolt />} onClick={() => navigate("/nang-cap")}>
            Nâng cấp Premium
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={shell}>
      {cardHead}
      <OrderEntry {...props} side={side} />
    </div>
  )
}

/* ── Main panel ── */
export interface TradingPanelProps {
  hideHeader?: boolean
  /** Xem `SymbolLink`. Mặc định `"navigate"` = /bieu-do & /co-phieu như cũ. */
  symbolLink?: SymbolLink
  /** Xem `OnPremiumRequired`. Bỏ trống = /bieu-do & /co-phieu như cũ. */
  onPremiumRequired?: () => void
}

export function TradingPanel({
  hideHeader = false,
  symbolLink = "navigate",
  onPremiumRequired,
}: TradingPanelProps = {}) {
  const { symbol } = useSymbol()
  const { data, isLoading } = usePrice(symbol)
  const { data: account } = useAccount()
  const { data: portfolio } = usePortfolio()
  const { isCap0Active } = useCap0Events()
  const { isCap1Active } = useCap1Events()
  const { isCap2Active } = useCap2Events()
  const skin = useMockupPanelSkin()
  // Hide-by-level — sổ lệnh bid/ask is hidden for the WHOLE of Cấp 0 and Cấp
  // 1 and opens at Cấp 2. Cấp 0 spec v3.0 §8 and Cấp 1 spec §0 say the same
  // thing from their own side ("Lên Cấp 2 (không hiện ở Cấp 0 và Cấp 1)" /
  // "Sổ lệnh bid/ask vẫn ẨN (chỉ mở ở Cấp 2)"); v2.2 wrongly unlocked it on
  // Cấp 0's nhiệm vụ ② (tour bảng điện), so `cap0Visibility().orderBook` is
  // now a constant `false` and the Cấp 0 clause below reduces to `isCap0Active`.
  // Cấp 2 spec §C9: "Sổ lệnh bid/ask MỞ ở Cấp 2" — `isCap2Active` short-
  // circuits BOTH level-hides back to visible (a Cấp 2 session also has
  // `isCap1Active` true, since Cấp 2 reuses Cấp 1's Form Kế hoạch — without
  // this short-circuit the `|| isCap1Active` clause would still hide it).
  // `useCap0Progress(isCap0Active)` only queries inside Cấp 0.
  const { data: cap0Progress } = useCap0Progress(isCap0Active)
  const hideOrderBook =
    !isCap2Active && ((isCap0Active && !cap0Visibility(cap0Progress).orderBook) || isCap1Active)

  const positionQty = useMemo(() => {
    const pos = portfolio?.positions.find(
      (p) => p.symbol === symbol.toUpperCase(),
    )
    return pos?.quantity ?? 0
  }, [portfolio, symbol])

  return (
    <aside
      className={cn(
        "flex h-full w-full shrink-0 flex-col",
        // ★ Ngoài Cấp 0/1 giữ nền Arco như cũ. TRONG Cấp 0/1 phải bỏ nó đi:
        // `--color-bg-2` đi theo theme sáng/tối của app, nên ở chế độ sáng
        // panel là một mảng TRẮNG nằm giữa trang tối — đây là lý do panel
        // "không giống mockup" rõ nhất, trước cả chuyện bo góc hay font.
        skin ? "op-shell" : "bg-[var(--color-bg-2)]",
      )}
    >
      {/* ★ `StockHeader` và `AccountStrip` KHÔNG còn đứng riêng ở đây nữa —
          chúng đã dời vào trong `OrderEntry`, ngay sau tabs MUA/BÁN, để cả
          panel là MỘT thẻ đúng thứ tự mockup. Sổ lệnh bid/ask vẫn ở trên cùng
          (mockup Cấp 0/1 không vẽ nó vì nó bị ẩn tới tận Cấp 2). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {data && !hideOrderBook && <OrderBookView data={data} />}
        <GatedOrderEntry
          symbol={symbol}
          data={data}
          balance={account?.balance ?? 0}
          positionQty={positionQty}
          priceLoading={isLoading}
          hideHeader={hideHeader}
          symbolLink={symbolLink}
          onPremiumRequired={onPremiumRequired}
        />
      </div>
    </aside>
  )
}
