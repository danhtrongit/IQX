import type { CSSProperties, ReactNode } from "react"

import { CD_TIER_INFO, cdCard, type CdCardDef } from "@/lib/candle-dojo/cards"
import { cn } from "@/lib/utils"
import { cardFaceShape, tierStyle } from "./candle-card-style"

/**
 * Thẻ nến sưu tầm (spec v1.2 §3, bản mẫu `IQX-Candle-Dojo-Bo-The.html`): tỉ lệ 5:7, khung kim loại chuyển màu
 * theo bậc, hình mẫu nến chuẩn ở giữa, tên thẻ ở dưới. Cỡ chữ và lề tính theo chiều rộng thẻ (`cqw`) nên thẻ
 * co giãn theo ô chứa. Một component duy nhất cho Dojo, Shop và Flashback để thẻ luôn giống nhau.
 */

type Shape = NonNullable<CdCardDef["shape"]>

const UP = "#0B9A5A"
const DOWN = "#D63939"

/**
 * Vẽ các nến của một hình mẫu (mỗi nến [mở, cao, thấp, đóng] theo đơn vị tương đối) hoặc hình riêng của bốn
 * thẻ Việt Nam: khoá trần/khoá sàn là một vạch ngang dày, kéo trần/đập sàn là một nến liền thân.
 */
export function CandleShapeSvg({
  shape,
  vn,
  className,
}: {
  shape: CdCardDef["shape"]
  vn?: CdCardDef["vn"]
  className?: string
}) {
  const width = 100
  const height = 130
  if (vn === "lul" || vn === "ldl") {
    const up = vn === "lul"
    const y = up ? 14 : height - 14
    const color = up ? UP : DOWN
    return (
      <svg className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1="10" x2="90" y1={y} y2={y} stroke={color} strokeOpacity=".35" strokeDasharray="3 4" />
        <rect x="34" y={y - 3} width="32" height="6" rx="3" fill={color} />
      </svg>
    )
  }
  const bars: Shape = shape ?? (vn === "luc" ? [[0, 3, -0.3, 3]] : vn === "ldc" ? [[0, 0.3, -3, -3]] : [])
  if (bars.length === 0) return null
  const low = Math.min(...bars.map((bar) => bar[2]))
  const high = Math.max(...bars.map((bar) => bar[1]))
  const span = high - low || 1
  const count = bars.length
  const slot = width / count
  const bodyWidth = Math.min(slot * 0.55, 30)
  const y = (value: number) => 8 + ((high - value) / span) * (height - 16)
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {bars.map(([open, hi, lo, close], index) => {
        const x = slot * index + slot / 2
        const color = close >= open ? UP : DOWN
        return (
          <g key={index}>
            <line
              x1={x}
              x2={x}
              y1={y(hi)}
              y2={y(lo)}
              stroke={color}
              strokeWidth={count > 3 ? 2.4 : 3.2}
              strokeLinecap="round"
            />
            <rect
              x={x - bodyWidth / 2}
              y={y(Math.max(open, close))}
              width={bodyWidth}
              height={Math.max(3, Math.abs(y(open) - y(close)))}
              rx="2"
              fill={color}
            />
          </g>
        )
      })}
    </svg>
  )
}

export interface CandleCardProps {
  /** Mã thẻ (ví dụ `doji`) hoặc định nghĩa thẻ. */
  card: string | CdCardDef
  /** Chiều rộng cố định (px); bỏ trống để thẻ lấp đầy ô chứa. */
  width?: number
  /** Úp thẻ: mặt sau tối, dấu "?", màu bậc nhạt đi (thẻ chưa mở). */
  faceDown?: boolean
  /** Thẻ chưa sở hữu: làm mờ để phân biệt với thẻ đã có (Shop, Bộ sưu tập). */
  dimmed?: boolean
  /** Lật thẻ khi hiện (ví dụ vừa mua hoặc vừa nhận ở Flashback). */
  reveal?: boolean
  className?: string
  /** Dấu nhỏ ở góc thẻ (ví dụ "Mới"). */
  badge?: ReactNode
}

/** Một thẻ nến. Trả null nếu mã thẻ không có trong danh mục. */
export function CandleCard({ card, width, faceDown, dimmed, reveal, className, badge }: CandleCardProps) {
  const def = typeof card === "string" ? cdCard(card) : card
  if (!def) return null
  const info = CD_TIER_INFO[def.tier]
  const style: CSSProperties = {
    ...tierStyle(def.tier),
    width: width ? `${width}px` : "100%",
    aspectRatio: "5 / 7",
    borderRadius: 16,
    padding: 5,
    position: "relative",
    containerType: "inline-size",
    background:
      "linear-gradient(140deg,var(--c2) 0%,var(--c1) 30%,var(--c3) 52%,var(--c1) 70%,var(--c2) 100%)",
    boxShadow: "0 14px 28px -12px rgba(10,14,30,.55),0 0 0 1px rgba(0,0,0,.08)",
    filter: faceDown ? "saturate(.55)" : dimmed ? "grayscale(.85) opacity(.62)" : undefined,
  }
  return (
    <div
      className={cn("cd-card", faceDown && "cd-card-back", reveal && "cd-reveal", className)}
      style={style}
      role="img"
      aria-label={faceDown ? "Thẻ nến chưa mở" : `${def.name}, thẻ ${info.label.toLowerCase()}`}
      data-card-id={def.id}
      data-tier={def.tier}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 12,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: faceDown ? "center" : "space-between",
          padding: "12cqw 8cqw 10cqw",
          background: faceDown ? "#1A2034" : "#FFFFFF",
        }}
      >
        {faceDown ? (
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "26cqw",
              color: "var(--c2)",
              opacity: 0.7,
            }}
          >
            ?
          </span>
        ) : (
          <>
            <CandleShapeSvg shape={cardFaceShape(def)} vn={def.vn} className="h-auto w-[62cqw] flex-1" />
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                color: "#1A1410",
                fontSize: "10.5cqw",
                letterSpacing: ".01em",
                textAlign: "center",
                lineHeight: 1.1,
              }}
            >
              {def.name}
            </span>
          </>
        )}
      </div>
      {badge ? <div className="absolute -top-2 -right-1 z-[2]">{badge}</div> : null}
    </div>
  )
}
