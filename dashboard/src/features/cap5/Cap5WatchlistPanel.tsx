import { useMemo, useState } from "react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { usePrices } from "@/features/market-data"
import { useCap5Events } from "./Cap5Context"
import { useCap5Watchlist } from "./sanMaHooks"
import {
  CAP5_WATCH_STATUS_LABEL,
  cap5WatchStatus,
  countWatchTabs,
  describeConsensus,
  describeConsensusTrend,
  describeHuntSource,
  lopIconRow,
  NOTABLE_MIN_LOP,
  TONG_SO_LOP,
  type Cap5WatchlistItem,
  type Cap5WatchStatus,
} from "./watchlistTypes"
import "./cap5-sanma.css"

/**
 * WATCHLIST Cấp 5 (spec §6, mockup `iqx-cap5-watchlist.html`) — panel
 * `"cap5-watchlist"` của sidebar-phải.
 *
 * ★★ **VÌ SAO ĐÂY LÀ PANEL RIÊNG, KHÔNG PHẢI BẢN NÂNG CỦA
 * `features/watchlist/WatchlistPanel.tsx`** (luật số 4):
 * panel "Danh mục" kia là component DÙNG CHUNG — `/bieu-do` và `/co-phieu` render
 * nó, nhiệm vụ ③ của Cấp 0 («Xem tab Theo dõi») bắn `onPortfolioTabOpen` từ chính
 * nó, và `data-tour-id` của tour Bảng điện cũng nằm trong nó. Nhồi điểm đồng
 * thuận + trạng thái "Đáng chú ý" vào đó thì hoặc rò sang hai trang kia, hoặc
 * biến file đó thành một mê cung `if (isCap5Active)`. Watchlist Cấp 5 vì thế là
 * MỘT panel riêng, chỉ tồn tại trong shell Cấp 5 — Cấp 0-4 và hai trang kia giữ
 * NGUYÊN hành vi cũ (có bài canh cả hai chiều: file test cạnh đây +
 * `features/watchlist/WatchlistPanel.cap5Gate.test.tsx`).
 *
 * ★★ LUẬT SỐ 1 — bốn chỗ dễ bịa số, cả bốn đều được chặn:
 *   · điểm đồng thuận `null` → "—/5" kèm "Chưa chấm 5 lớp", KHÔNG in "0/5";
 *   · vùng CHƯA KẾT LUẬN (còn lớp chưa chấm, vẫn có thể tới 4) là trạng thái
 *     RIÊNG — không gọi là "Đang quan sát" (xem `watchlistTypes.ts`);
 *   · thiếu giá realtime → "—", không phải `0`;
 *   · lỗi/đang tải → bộ đếm tab hiện "—", không phải "(0)".
 *
 * ★ LUẬT SỐ 5 — không rời shell cấp: mọi lối đi chỉ đổi `activePanel`
 * (+ `setSymbol`), không `navigate` đi đâu.
 */
export function Cap5WatchlistPanel() {
  const { isCap5Active } = useCap5Events()
  const { setActivePanel } = useSidebar()
  const { setSymbol } = useSymbol()
  const { data: items, isLoading, isError } = useCap5Watchlist(isCap5Active)
  const [tab, setTab] = useState<"all" | "notable">("all")

  const rows: Cap5WatchlistItem[] = items ?? []
  const symbols = useMemo(() => rows.map((i) => i.symbol.toUpperCase()), [rows])
  const { priceMap } = usePrices(symbols)

  // ★ Bộ đếm tab chỉ có nghĩa khi ĐÃ tải được danh sách. Chưa tải/lỗi ⇒ "—":
  // "(0)" ở đây là lời khẳng định "watchlist của bạn trống", điều ta chưa biết.
  const daBiet = !isLoading && !isError && items != null
  const counts = countWatchTabs(rows)

  const shown = tab === "notable" ? rows.filter((i) => cap5WatchStatus(i) === "notable") : rows

  const goSanMa = () => setActivePanel("cap5-sanma")

  /**
   * Lối vào lệnh / xem 5 lớp. Cả hai đều mở panel "Đặt lệnh" — ở Cấp 4/5 khối
   * «Đọc 5 lớp» nằm NGAY TRONG panel đó (spec §0: panel đặt lệnh = Cấp 4 giữ
   * nguyên), nên "Xem 5 lớp" không cần một màn thứ ba. Nhãn khác nhau vì ý định
   * khác nhau (spec §6.2), và mã chưa chín KHÔNG được mời "Đặt lệnh".
   */
  const openTrading = (symbol: string) => {
    setSymbol(symbol.toUpperCase())
    setActivePanel("trading")
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap5-sm">
          <div className="cap5-sm-title">Watchlist</div>
          <div className="cap5-sm-sub">
            Các mã bạn đã săn, đang quan sát. Mã lên ≥{NOTABLE_MIN_LOP}/{TONG_SO_LOP} lớp ủng hộ sẽ
            được đánh dấu “Đáng chú ý”.
          </div>

          <div className="cap5-wl-head">
            <div className="cap5-wl-tabs">
              <button
                type="button"
                className={"cap5-wl-tab" + (tab === "all" ? " on" : "")}
                data-testid="cap5-wl-tab-all"
                onClick={() => setTab("all")}
              >
                Tất cả ({daBiet ? counts.tatCa.toLocaleString("en-US") : "—"})
              </button>
              <button
                type="button"
                className={"cap5-wl-tab" + (tab === "notable" ? " on" : "")}
                data-testid="cap5-wl-tab-notable"
                onClick={() => setTab("notable")}
              >
                Đáng chú ý ({daBiet ? counts.dangChuY.toLocaleString("en-US") : "—"})
              </button>
            </div>
            <button type="button" className="cap5-wl-add" data-testid="cap5-wl-add" onClick={goSanMa}>
              + Săn thêm
            </button>
          </div>

          {isLoading && (
            <div className="cap5-hm-empty" data-testid="cap5-wl-loading">
              Đang tải Watchlist…
            </div>
          )}

          {!isLoading && isError && (
            <div className="cap5-hm-empty" data-testid="cap5-wl-error">
              Chưa lấy được Watchlist từ máy chủ — chưa rõ bạn đang theo dõi những mã nào.
            </div>
          )}

          {daBiet &&
            shown.map((it) => (
              <WatchCard
                key={it.symbol}
                item={it}
                price={priceMap[it.symbol.toUpperCase()] ?? null}
                onGo={() => openTrading(it.symbol)}
              />
            ))}

          {daBiet && shown.length === 0 && (
            <div className="cap5-hm-empty" data-testid="cap5-wl-empty">
              {tab === "notable" ? (
                <>
                  Chưa mã nào lên ≥{NOTABLE_MIN_LOP}/{TONG_SO_LOP} lớp ủng hộ. Chờ mã chín — không
                  cần mua khi chưa có gì đáng mua.
                </>
              ) : (
                <>
                  Chưa có mã nào trong Watchlist. Sang màn <b>Săn mã</b> để tìm mã đáng chú ý.
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Class trạng thái theo mockup (`.ready` vàng · `.watch` xám · `.unknown` cam). */
const STATUS_CLASS: Record<Cap5WatchStatus, string> = {
  notable: "ready",
  watching: "watch",
  chua_ket_luan: "unknown",
  chua_cham: "unknown",
}

/**
 * Giá + % của một mã. `null` khi chưa có tick nào — hiện "—", KHÔNG phải 0
 * (`closePrice` của bảng giá tính theo NGHÌN đồng, xem `PriceBoardData`).
 */
function PriceCell({
  symbol,
  price,
}: {
  symbol: string
  price: { closePrice: number; percentChange: number } | null
}) {
  const co = price != null && price.closePrice > 0
  const pct = price?.percentChange ?? 0
  const tone = !co ? "" : pct > 0 ? "cap5-up" : pct < 0 ? "cap5-down" : ""
  return (
    <span className={"cap5-wl-price " + tone} data-testid={`cap5-wl-price-${symbol}`}>
      {co ? (
        <>
          {Math.round(price.closePrice * 1000).toLocaleString("en-US")}{" "}
          {pct > 0 ? "+" : ""}
          {pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%
        </>
      ) : (
        "—"
      )}
    </span>
  )
}

function WatchCard({
  item,
  price,
  onGo,
}: {
  item: Cap5WatchlistItem
  price: { closePrice: number; percentChange: number } | null
  onGo: () => void
}) {
  const sym = item.symbol.toUpperCase()
  const status = cap5WatchStatus(item)
  const notable = status === "notable"
  const consensus = describeConsensus(item)
  const trend = describeConsensusTrend(item)
  const icons = lopIconRow(item)

  return (
    <div
      className={"cap5-wl-card" + (notable ? " ready" : "")}
      data-testid={`cap5-wl-card-${sym}`}
    >
      <div className="cap5-wl-top">
        <span className="cap5-wl-code">{sym}</span>
        <PriceCell symbol={sym} price={price} />
        <span
          className={`cap5-wl-status ${STATUS_CLASS[status]}`}
          data-testid={`cap5-wl-status-${sym}`}
        >
          {CAP5_WATCH_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="cap5-wl-mid">
        <span className="cap5-wl-cs-icons" data-testid={`cap5-wl-lop-${sym}`}>
          {icons.map((l) => `${l.icon}${l.mark}`).join(" ")}
        </span>
        <span className={"cap5-wl-cs-score " + (notable ? "hi" : "lo")}>{consensus.text}</span>
        <span
          className={
            "cap5-wl-trend" + (trend.tone === "up" ? " up" : trend.tone === "down" ? " down" : "")
          }
          data-testid={`cap5-wl-trend-${sym}`}
        >
          {trend.text}
        </span>
      </div>

      {/* ★ "X/5" một mình là lời nói dối ngầm khi còn lớp chưa chấm — dòng này
          nói ra mẫu số thật. */}
      {consensus.canhBao && (
        <div className="cap5-wl-warn" data-testid={`cap5-wl-warn-${sym}`}>
          ⚠ {consensus.canhBao}
        </div>
      )}

      <div className="cap5-wl-foot">
        <span className="cap5-wl-note">{describeHuntSource(item)}</span>
        <button
          type="button"
          className={"cap5-wl-act " + (notable ? "buy" : "view")}
          data-testid={`cap5-wl-act-${sym}`}
          onClick={onGo}
        >
          {notable ? "Đặt lệnh →" : "Xem 5 lớp →"}
        </button>
      </div>

      {/* spec §6.1 — câu nhắc CHỈ dành cho mã đã đủ lớp, và luôn kết bằng
          "Quyết định mua vẫn là của bạn" (spec §4.3: không hứa hẹn giá). */}
      {notable && (
        <div className="cap5-wl-hint" data-testid={`cap5-wl-hint-${sym}`}>
          {/* ★ Câu nhắc của MÁY CHỦ thắng (`Cap5WatchlistItemOut.nhac`) — server
              chỉ gửi nó cho mã ★ Đáng chú ý, nên nó luôn khớp trạng thái thật.
              Vắng ⇒ câu mặc định của spec §6.1. */}
          {item.nhac ? (
            <>💡 {item.nhac}</>
          ) : (
            <>
              💡 <b>{consensus.text} lớp đang ủng hộ</b> — đáng để bạn xem kỹ. Quyết định mua vẫn
              là của bạn.
            </>
          )}
        </div>
      )}
    </div>
  )
}
