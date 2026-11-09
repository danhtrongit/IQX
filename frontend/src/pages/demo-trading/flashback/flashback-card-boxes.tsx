/**
 * Khung và nhãn mẫu nến trên biểu đồ Flashback (Candle Dojo spec v1.2 §9.2).
 *
 * Lớp phủ DOM đặt tuyệt đối lên biểu đồ, không nhận con trỏ nên không chặn công cụ vẽ, Mua, Bán hay kéo biểu đồ. Cả biểu đồ IQLine
 * (toạ độ lấy từ khung hình của thư viện, đổi theo zoom, kéo, kích thước) và biểu đồ SVG cũ (`?iqline=0`) đưa vào cùng một `projection`.
 * Mỗi thẻ đã gặp có một khung bao đúng các nến của mẫu, viền và nền mờ theo màu bậc, giữ suốt ván; hai mẫu chồng nhau thì hai khung chồng
 * nhau. Ba thẻ gần nhất có nhãn tên phía trên khung, thẻ cũ hơn là chấm tròn ở đỉnh khung. Khung của thẻ đang được nhấn mạnh (thẻ vừa bật
 * lên hoặc vừa bấm trong khay) đậm hơn.
 */
import { memo, useMemo } from "react"

import {
  BOX_BORDER,
  BOX_FILL_ALPHA,
  LABEL_BACKGROUND,
  TIER_LABEL_COLOR,
  cardBox,
  layoutLabels,
  tierColor,
  withAlpha,
  type CardBar,
  type CardBox,
  type CardProjection,
  type LabelPlacement,
  type MetCard,
} from "./flashback-cards-model"

export type FlashbackCardOverlayProps = {
  cards: readonly MetCard[]
  /** Nến đã hiện (các phiên xem rồi các phiên đã chơi). */
  bars: readonly CardBar[]
  viewBars: number
  projection: CardProjection
  /** Phiên của thẻ đang được nhấn mạnh; null là không có. */
  highlight: number | null
}

export const FlashbackCardOverlay = memo(function FlashbackCardOverlay({ cards, bars, viewBars, projection, highlight }: FlashbackCardOverlayProps) {
  const boxes = useMemo(
    () => cards.map((card) => cardBox(card, bars, viewBars, projection)).filter((box): box is CardBox => box !== null),
    [cards, bars, viewBars, projection],
  )
  const labels = useMemo(() => layoutLabels(boxes, projection.plot), [boxes, projection.plot])
  if (boxes.length === 0) return null

  const { plot } = projection
  const byIdx = new Map(boxes.map((box) => [box.playIdx, box]))
  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{ left: plot.left, top: plot.top, width: Math.max(0, plot.right - plot.left), height: Math.max(0, plot.bottom - plot.top) }}
      data-testid="flashback-card-overlay"
    >
      {boxes.map((box) => {
        const focused = highlight === box.playIdx
        const color = tierColor(box.tier)
        return (
          <div
            key={box.playIdx}
            data-card-box={box.playIdx}
            data-card-id={box.cardId}
            data-tier={box.tier}
            data-highlighted={focused}
            className="absolute rounded-[4px] transition-[background-color,border-width] duration-200"
            style={{
              left: box.left - plot.left,
              top: box.top - plot.top,
              width: box.right - box.left,
              height: box.bottom - box.top,
              boxSizing: "border-box",
              borderStyle: "solid",
              borderColor: color,
              borderWidth: focused ? BOX_BORDER.focus : BOX_BORDER.normal,
              backgroundColor: withAlpha(color, focused ? BOX_FILL_ALPHA.focus : BOX_FILL_ALPHA.normal),
            }}
          />
        )
      })}
      {labels.map((label) => (
        <LabelMark key={label.playIdx} label={label} plotLeft={plot.left} plotTop={plot.top} box={byIdx.get(label.playIdx)} />
      ))}
    </div>
  )
})

function LabelMark({ label, plotLeft, plotTop, box }: { label: LabelPlacement; plotLeft: number; plotTop: number; box: CardBox | undefined }) {
  const color = tierColor(label.tier)
  if (label.kind === "dot") {
    return (
      <span
        data-card-dot={label.playIdx}
        className="absolute rounded-full"
        style={{
          left: label.x - plotLeft - label.radius,
          top: label.y - plotTop - label.radius,
          width: label.radius * 2,
          height: label.radius * 2,
          backgroundColor: color,
          boxShadow: `0 0 0 1.2px ${LABEL_BACKGROUND}`,
        }}
        title={box?.name}
      />
    )
  }
  return (
    <>
      {label.connector ? (
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: label.connector.x - plotLeft,
            top: label.connector.top - plotTop,
            width: 1,
            height: label.connector.bottom - label.connector.top,
            backgroundColor: withAlpha(color, 0.7),
          }}
        />
      ) : null}
      <span
        data-card-label={label.playIdx}
        className="absolute flex items-center gap-1.5 overflow-hidden rounded-full pl-2 text-[11.5px] leading-none font-bold whitespace-nowrap"
        style={{
          left: label.x - plotLeft,
          top: label.y - plotTop,
          width: label.width,
          height: label.height,
          boxSizing: "border-box",
          backgroundColor: LABEL_BACKGROUND,
          border: `1.6px solid ${color}`,
          color: TIER_LABEL_COLOR[label.tier],
        }}
      >
        <i aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label.text}</span>
      </span>
    </>
  )
}
