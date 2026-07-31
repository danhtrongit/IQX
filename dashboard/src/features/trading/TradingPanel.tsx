import { useEffect, useMemo, useRef, useState } from "react"
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
import { useAuth } from "@/features/auth"
import { usePremiumStatus } from "@/features/premium"
import { PlanBlock, useCap0Events, useCap0Progress, useCompleteTask, cap0Visibility } from "@/features/cap0"
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
  type Lop5Partial,
} from "@/features/cap4"
import { DungNgoaiButton, useCap5Events } from "@/features/cap5"
import { getErrorMessage } from "@/shared/http/client"
import { cn } from "@/shared/lib/cn"
import { StockLogo } from "@/features/navigation/StockLogo"
import { IconWallet } from "@/features/watchlist/icons"
import {
  useWatchlistToggle,
  useSymbolInfo,
} from "@/features/watchlist"
import { useAccount, usePortfolio, usePlaceOrder, useActivateAccount } from "./hooks"

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

/** Kế hoạch preset SL/TP (spec §4 "−5%/+10% điền sẵn") — nearest 100 VND tick. */
function roundToStep(n: number, step = 100): number {
  return Math.round(n / step) * step
}

function priceColorClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
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
}: {
  symbol: string
  data: PriceBoardData | null
  balance: number
  positionQty: number
}) {
  const navigate = useNavigate()
  const placeOrder = usePlaceOrder()
  const cap0Events = useCap0Events()
  // `isCap0Active` is the SAME signal `GatedOrderEntry` uses to ungate the
  // form (false outside a `Cap0Provider`, i.e. on /bieu-do & /co-phieu) — the
  // Kế hoạch block + its reason-gate below are scoped to it too, so neither
  // has any effect on normal trading outside Cấp 0.
  const { isCap0Active } = cap0Events
  // Hide-by-level (spec §8) — `useCap0Progress(isCap0Active)` only queries
  // when actually inside Cấp 0 (the `enabled` param), so this has zero
  // effect — no extra request, no hiding — outside a `Cap0Provider`.
  const { data: cap0Progress } = useCap0Progress(isCap0Active)
  const completeTask5 = useCompleteTask()
  const cap1Events = useCap1Events()
  // `isCap1Active` mirrors `isCap0Active` above — false outside a
  // `Cap1Provider`, so the Form Kế hoạch + AI Thanh tra + hard gate below
  // have zero effect on Cấp 0 or normal (non-cap) trading.
  const { isCap1Active } = cap1Events
  const recordKehoach = useRecordKehoach()
  const [cap1LyDo, setCap1LyDo] = useState<LyDo | null>(null)
  // "Vùng mua" default = giá hiện tại (spec §4) — same "computed, not
  // stored" convention as `presetSl`/`presetTp` below: only an explicit user
  // edit is kept in state, the effective value is computed each render.
  // `undefined` = "untouched, follow the current-price default"; `null` =
  // "user explicitly cleared the field" (must NOT silently fall back to the
  // default — the hard gate needs to see this as genuinely missing).
  const [cap1VungMuaOverride, setCap1VungMuaOverride] = useState<number | null | undefined>(
    undefined,
  )
  const [cap1Verdict, setCap1Verdict] = useState<Verdict | null>(null)
  const [cap1Snapshot, setCap1Snapshot] = useState<Record<string, unknown> | null>(null)
  const [cap1DocChiTiet, setCap1DocChiTiet] = useState(false)
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
  // `Cap5Provider`. Cấp 5 is PURELY ADDITIVE to this panel (spec §0): it adds
  // NO state, NO khối, NO cổng cứng and changes NOTHING about Cấp 0-4's blocks,
  // the cổng cứng chain or Cấp 3's volume auto-fill. The only thing it adds is
  // the "Đứng ngoài có chủ đích" affordance below (a decision NOT to buy) plus
  // its own copy of the order-filled event.
  const { isCap5Active } = cap5Events
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [method, setMethod] = useState<"market" | "limit">("market")
  const [price, setPrice] = useState<number | undefined>(undefined)
  const [volume, setVolume] = useState<number>(100)
  const [reason, setReason] = useState<string | null>(null)
  // Nhiệm vụ ⑤ (spec §4 Chặng 3) — manual, user-typed SL/TP once task ① is
  // done (replaces the nhiệm vụ ① preset). Kept separate from `presetSl`/
  // `presetTp` below so switching modes never shows a stale preset value.
  const [slManual, setSlManual] = useState<number | null>(null)
  const [tpManual, setTpManual] = useState<number | null>(null)
  // Cổng chất lượng 1 fires on the FIRST keydown only (not on every
  // keystroke while typing a multi-digit number) — reset per mount, which is
  // fine: `task5_sl_typed` server-side is the authoritative "already gated"
  // guard below, this ref just avoids redundant mutations within one mount.
  const slGateFiredRef = useRef(false)

  const task1Done = !!cap0Progress?.task_1_done_at
  const cap0Vis = cap0Visibility(cap0Progress)
  // Ô Giá + dropdown loại lệnh ẩn cho đến nhiệm vụ ⑤ (spec §8) — ONLY inside
  // Cấp 0; outside it (`isCap0Active` false) this is always visible, exactly
  // as today.
  const hidePriceAndType = isCap0Active && !cap0Vis.priceField

  const handleSlKeydown = () => {
    if (!isCap0Active || !task1Done) return
    // Notify the gbar INSTANTLY (spec §6 "Bước 1/2 → 2/2") off the raw
    // keydown — not gated by `task5_sl_typed`/`slGateFiredRef` below, which
    // exist only to avoid a REDUNDANT PATCH, not to throttle the local UI
    // update (a user retyping after those flags are already true should
    // still see the gbar reflect "đã gõ").
    cap0Events.onSlTyped?.()
    if (cap0Progress?.task5_sl_typed || slGateFiredRef.current) return
    slGateFiredRef.current = true
    completeTask5.mutate({ taskNo: 5, gate: "sl_typed" })
  }

  const currentPrice = data?.closePrice ? data.closePrice * 1000 : 0
  const numPrice = price ?? currentPrice
  const numVolume = volume || 0
  const orderValue = numPrice * numVolume
  const fee = Math.round(orderValue * 0.0015)

  // Kế hoạch preset SL/TP (spec §4, THÊM MỚI) — display-only, never sent to
  // the order backend (spec: "KHÔNG ghi vào backend đặt lệnh của web hiện tại").
  // Only shown pre-⑤ (nhiệm vụ ⑤ switches `PlanBlock` to manual, user-typed
  // values below).
  const presetSl = currentPrice > 0 ? roundToStep(currentPrice * 0.95) : null
  const presetTp = currentPrice > 0 ? roundToStep(currentPrice * 1.1) : null

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
      // BUY fills also carry the Kế hoạch SL/TP shown/typed at order time
      // (preset pre-⑤, manually-typed from ⑤ on) — the trading backend never
      // persists these, so nhiệm vụ ⑥'s later debrief needs them off the bus.
      const effectiveSl = task1Done ? (slManual ?? undefined) : (presetSl ?? undefined)
      const effectiveTp = task1Done ? (tpManual ?? undefined) : (presetTp ?? undefined)
      cap0Events.onOrderFilled?.({
        symbol,
        side,
        quantity: order.quantity,
        price: order.price,
        ...(side === "buy" ? { sl: effectiveSl, tp: effectiveTp } : {}),
      })
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
        if (cap2Ready || cap4Ready) {
          await recordKehoach.mutateAsync(kehoachPayload)
          if (isCap2Active && cap2Method && cap2CatLo && cap2ChotLoi) {
            await recordKehoachCap2.mutateAsync({
              order_id: order.id,
              phuong_phap_sl_tp: cap2Method,
              cat_lo: cap2CatLo,
              chot_loi: cap2ChotLoi,
            })
          }
          // Cấp 3 (spec §6 "Ghi hồ sơ") — same chained-await reason as Cấp 2:
          // `/cap3/kehoach` extends the SAME `order_kehoach` row, so it must
          // fire only AFTER Cấp 1's (and Cấp 2's) POST has created/updated it.
          if (
            isCap3Active &&
            cap3Progress?.khau_vi &&
            cap3MucTuTin &&
            cap3Cach &&
            cap3KhoiLuong != null &&
            cap3PctVon != null
          ) {
            await recordKehoachCap3.mutateAsync({
              order_id: order.id,
              khau_vi: cap3Progress.khau_vi,
              muc_tu_tin: cap3MucTuTin,
              cach_khoi_luong: cap3Cach,
              khoi_luong: cap3KhoiLuong,
              pct_von: cap3PctVon,
            })
          }
          // Cấp 4 (spec §8 "Dữ liệu cần ghi") — LAST in the chain, same single
          // `order_kehoach` row. BOTH JSON blobs go up: without `ai_5_lop` the
          // backend leaves `so_lop_dong_thuan` NULL and the order never counts
          // toward nhiệm vụ ③ (đồng thuận cao). `so_lop_dong_thuan`/
          // `so_lop_khac_ai` are advisory — the server re-derives them.
          if (cap4Ready) {
            await recordKehoachCap4.mutateAsync({
              order_id: order.id,
              doc_5_lop: cap4Doc5Lop,
              ai_5_lop: cap4Ai5Lop,
              so_lop_dong_thuan: countDongThuan(cap4Ai5Lop),
              so_lop_khac_ai: countKhacAi(cap4Doc5Lop, cap4Ai5Lop),
            })
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
        (isCap1Active || isCap3Active || isCap4Active || isCap5Active)
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
        // Cấp 5's Kết sổ (phân loại 4 ô) mở từ event của CHÍNH nó — cùng cách
        // Cấp 3/Cấp 4 đã sửa để không đi nhờ bus của cấp khác.
        cap5Events.onOrderFilled?.(sellEvent)
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
        navigate("/nang-cap")
      } else {
        Message.error(msg)
      }
    }
  }

  return (
    <div className="space-y-2 px-2 pb-3">
      {/* Buy / Sell — wrapped for the Bảng điện tour's point ⑤ (MUA/BÁN +
          Số dư, spec `IQX-Tour-BangDien.md`); Số dư itself lives in
          `AccountStrip` just above (not a DOM sibling here without a
          bigger restructure) and is covered in that step's copy instead. */}
      <div data-tour-id="cap0-tour-buysell-balance">
        <Tabs
          activeTab={side}
          onChange={(v) => setSide(v as "buy" | "sell")}
          className="mt-2 [&_.arco-tabs-content]:hidden"
        >
          <Tabs.TabPane key="buy" title={<span className="font-semibold">MUA</span>} />
          <Tabs.TabPane key="sell" title={<span className="font-semibold">BÁN</span>} />
        </Tabs>
      </div>

      {/* Order method + Price — hidden until nhiệm vụ ⑤ while in Cấp 0
          (spec §8; `hidePriceAndType` is always false outside Cấp 0, so this
          renders exactly as before on /bieu-do & /co-phieu). */}
      {!hidePriceAndType && (
        <>
          {/* Order method */}
          <Select value={method} onChange={(v) => setMethod(v)} size="small">
            <Select.Option value="market">Lệnh thị trường (MP)</Select.Option>
            <Select.Option value="limit">Lệnh giới hạn (LO)</Select.Option>
          </Select>

          {/* Price */}
          <Tooltip
            content={
              isCap0Active && task1Done
                ? "Bạn vừa mở khóa ô Giá. Nãy giờ bạn dùng lệnh THỊ TRƯỜNG (MP) — mua ngay ở giá bên bán. Nhập giá cụ thể vào ô này là lệnh GIỚI HẠN (LO): 'tôi chỉ mua nếu giá về mức X' — máy chờ giúp bạn. Chủ động hơn, nhưng có thể không khớp."
                : ""
              }
            disabled={!(isCap0Active && task1Done)}
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-3)]">Giá</label>
              <InputNumber
                mode="button"
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
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-text-3)]">Khối lượng</label>
            {side === "sell" && positionQty > 0 && (
              <span className="text-xs text-[var(--color-text-3)]">
                Tối đa: {positionQty.toLocaleString("en-US")}
              </span>
            )}
          </div>
          <InputNumber
            mode="button"
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
          <Radio.Group
            type="button"
            size="mini"
            className="w-full pt-1"
            onChange={(v) => handlePct(v)}
            options={[10, 25, 50, 100].map((p) => ({ label: `${p}%`, value: p }))}
          />
        </div>

        {/* Summary */}
        <div className="mt-2 space-y-1 rounded-md bg-[var(--color-fill-2)] p-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-3)]">Giá trị</span>
            <span className="font-medium tabular-nums text-[var(--color-text-1)]">
              {orderValue > 0 ? fmtVnd(orderValue) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-3)]">Phí GD (0.15%)</span>
            <span className="font-medium tabular-nums text-[var(--color-text-1)]">
              {fee > 0 ? fmtVnd(fee) : "—"}
            </span>
          </div>
          <Divider className="my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Tổng</span>
            <span className="tabular-nums text-[rgb(var(--primary-6))]">
              {orderValue > 0 ? fmtVnd(orderValue + fee) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Kế hoạch (spec §4 THÊM MỚI) — buy-side only AND Cấp 0-only:
          the reason chips + SL/TP preset are a Cấp 0 onboarding aid and must
          have zero effect on normal trading outside Cấp 0 (`isCap0Active`
          false on /bieu-do & /co-phieu → this never renders there).
          Nhiệm vụ ⑤ (spec §4 Chặng 3): once task ① is done, switches to
          `presetMode="manual"` — SL/TP are no longer pre-filled, the user
          types them, and the FIRST `keydown` into the SL field (not a click
          on any auto-fill button — cổng chất lượng 1) marks the gate. */}
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
          <Tooltip
            content={
              task1Done
                ? "Lần này bạn tự quyết: nếu sai, bạn chấp nhận dừng ở giá nào? Gõ con số của bạn — nó là lời hứa với chính mình, không phải ô phải điền cho qua."
                : ""
            }
            disabled={!task1Done}
          >
            <div>
              <PlanBlock
                symbol={symbol}
                presetMode={task1Done ? "manual" : "filled"}
                reason={reason}
                onReason={(r) => {
                  setReason(r)
                  cap0Events.onReasonPicked?.(r)
                }}
                sl={task1Done ? slManual : presetSl}
                tp={task1Done ? tpManual : presetTp}
                onSlChange={task1Done ? setSlManual : undefined}
                onTpChange={task1Done ? setTpManual : undefined}
                onSlKeydown={task1Done ? handleSlKeydown : undefined}
              />
            </div>
          </Tooltip>
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
              />
            )}
          </>
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
                    : ""
          }
          disabled={
            !(
              cap1SubmitDisabled ||
              cap2SubmitDisabled ||
              cap3SubmitDisabled ||
              cap4SubmitDisabled
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
                cap4SubmitDisabled
              }
              onClick={handleSubmit}
              className={cn(
                "mt-2 font-bold text-white",
                side === "buy"
                  ? "!border-up !bg-up hover:!opacity-90"
                  : "!border-down !bg-down hover:!opacity-90",
              )}
            >
              {side === "buy" ? "ĐẶT LỆNH MUA" : "ĐẶT LỆNH BÁN"}
            </Button>
          </div>
        </Tooltip>
      </div>

      {/* Cấp 5 "Đứng ngoài có chủ đích" (spec §5, THÊM MỚI) — buy-side only AND
          Cấp 5-only (`isCap5Active` false outside a `Cap5Provider` → zero effect
          on Cấp 0-4 or normal trading). Đặt NGAY DƯỚI nút đặt lệnh, NGOÀI khối
          `cap0-tour-plan-submit` (không đổi vùng spotlight của tour Bảng điện)
          và KHÔNG chạm vào bất kỳ khối/cổng nào ở trên: nó là lối ghi lại một
          quyết định KHÔNG MUA, không phải một bước của luồng mua. */}
      {side === "buy" && isCap5Active && <DungNgoaiButton symbol={symbol} />}
    </div>
  )
}

/* ── Account strip / activation ── */
function AccountStrip({
  positionQty,
  symbol,
}: {
  positionQty: number
  symbol: string
}) {
  const { data: account, isLoading, isError } = useAccount()
  const activate = useActivateAccount()
  const navigate = useNavigate()

  const handleActivate = async () => {
    try {
      await activate.mutateAsync()
      Message.success("Kích hoạt Đấu trường ảo thành công! Bạn nhận 1 tỷ VND ảo.")
    } catch (err) {
      const msg = await getErrorMessage(err, "Kích hoạt thất bại")
      if (/premium|gói premium/i.test(msg)) {
        Message.error(msg)
        navigate("/nang-cap")
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

  return (
    <div className="space-y-1 border-b border-[var(--color-border-2)] px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-3)]">
          <IconWallet />
          Số dư
        </span>
        <span className="text-xs font-bold tabular-nums text-[var(--color-text-1)]">
          {fmtVnd(account.balance)}đ
        </span>
      </div>
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
      {positionQty > 0 && (
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
}: {
  symbol: string
  data: PriceBoardData | null
  isLoading: boolean
}) {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal } = useAuth()
  const { isWatched, toggle, isPending } = useWatchlistToggle()
  const { data: info } = useSymbolInfo(symbol)
  const cap0Events = useCap0Events()

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

  return (
    <div
      data-tour-id="cap0-tour-stock-header"
      className="space-y-1 border-b border-[var(--color-border-2)] px-3 py-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StockLogo symbol={data.symbol} size={28} />
          <button
            type="button"
            className="text-sm font-bold text-[var(--color-text-1)] hover:text-[rgb(var(--primary-6))]"
            onClick={() => navigate(`/co-phieu/${data.symbol}`)}
          >
            {data.symbol}
          </button>
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
        <Stat label="KL" value={fmtCompact(data.totalVolume)} />
        <Stat
          label="NN"
          value={`${data.foreignBuy - data.foreignSell >= 0 ? "+" : ""}${fmtCompact(data.foreignBuy - data.foreignSell)}`}
          className={data.foreignBuy - data.foreignSell >= 0 ? "text-up" : "text-down"}
        />
        <Stat label="GTGD" value={fmtCompact(data.totalValue)} />
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
}) {
  const { isPremium, isLoading } = usePremiumStatus()
  const { isCap0Active } = useCap0Events()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spin />
      </div>
    )
  }

  // Cấp 0 «Sân tập» practice trading ungates the order form without a
  // premium plan (spec §2) — `isCap0Active` is only ever true inside a
  // `Cap0Provider` (i.e. `Cap0TradingPage`), so /bieu-do & /co-phieu (no
  // provider there) keep the premium gate exactly as before.
  if (!isPremium && !isCap0Active) {
    return (
      <div className="space-y-2 px-2 py-4 text-center">
        <p className="text-xs text-[var(--color-text-3)]">
          Đặt lệnh Đấu trường ảo yêu cầu gói Premium.
        </p>
        <Button type="primary" size="small" icon={<IconThunderbolt />} onClick={() => navigate("/nang-cap")}>
          Nâng cấp Premium
        </Button>
      </div>
    )
  }

  return <OrderEntry {...props} />
}

/* ── Main panel ── */
export function TradingPanel({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { symbol } = useSymbol()
  const { data, isLoading } = usePrice(symbol)
  const { data: account } = useAccount()
  const { data: portfolio } = usePortfolio()
  const { isCap0Active } = useCap0Events()
  const { isCap1Active } = useCap1Events()
  const { isCap2Active } = useCap2Events()
  // Hide-by-level (spec §8) — sổ lệnh bid/ask ẩn cho đến nhiệm vụ ② (tour
  // bảng điện, not built this delivery — Chặng 2 is 3 locked slots, so this
  // stays hidden for this delivery's whole Cấp 0 run, as intended).
  // `useCap0Progress(isCap0Active)` only queries inside Cấp 0.
  const { data: cap0Progress } = useCap0Progress(isCap0Active)
  // Cấp 1 spec §0: "Sổ lệnh bid/ask vẫn ẨN (chỉ mở ở Cấp 2)" — stays hidden
  // for the whole Cấp 1 run too (unconditionally, no task gates it yet).
  // Cấp 2 spec §C9: "Sổ lệnh bid/ask MỞ ở Cấp 2" — `isCap2Active` short-
  // circuits both the Cấp 0 task-gate AND the Cấp 1 unconditional-hide back
  // to visible (a Cấp 2 session also has `isCap1Active` true, since Cấp 2
  // reuses Cấp 1's Form Kế hoạch — without this short-circuit the `|| isCap1Active`
  // clause above would still hide it).
  const hideOrderBook =
    !isCap2Active && ((isCap0Active && !cap0Visibility(cap0Progress).orderBook) || isCap1Active)

  const positionQty = useMemo(() => {
    const pos = portfolio?.positions.find(
      (p) => p.symbol === symbol.toUpperCase(),
    )
    return pos?.quantity ?? 0
  }, [portfolio, symbol])

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--color-bg-2)]">
      {!hideHeader && <StockHeader symbol={symbol} data={data} isLoading={isLoading} />}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {data && !hideOrderBook && <OrderBookView data={data} />}
        <Divider className="my-1" />
        <AccountStrip positionQty={positionQty} symbol={symbol} />
        <GatedOrderEntry
          symbol={symbol}
          data={data}
          balance={account?.balance ?? 0}
          positionQty={positionQty}
        />
      </div>
    </aside>
  )
}
