import type { CSSProperties } from "react"

import type { CdCardDef, CdTier } from "@/lib/candle-dojo/cards"

/** Ba sắc độ của khung theo bậc (sáng, chính, tối) và ánh sáng quanh thẻ. */
export const CD_TIER_PALETTE: Readonly<
  Record<CdTier, { c1: string; c2: string; c3: string; glow: string; glow2: string; tint: string }>
> = {
  1: { c1: "#2F7BF5", c2: "#CFE3FF", c3: "#14408F", glow: "rgba(47,123,245,.55)", glow2: "rgba(80,150,255,.8)", tint: "rgba(47,123,245,.16)" },
  2: { c1: "#8B4DF0", c2: "#E6D6FF", c3: "#4B1C9C", glow: "rgba(139,77,240,.55)", glow2: "rgba(170,120,255,.8)", tint: "rgba(139,77,240,.16)" },
  3: { c1: "#E0459B", c2: "#FFD3EA", c3: "#8C1659", glow: "rgba(224,69,155,.55)", glow2: "rgba(255,110,190,.8)", tint: "rgba(224,69,155,.16)" },
  4: { c1: "#E0A100", c2: "#FFF0B8", c3: "#8A5A00", glow: "rgba(224,161,0,.6)", glow2: "rgba(255,200,60,.85)", tint: "rgba(224,161,0,.2)" },
  5: { c1: "#E5352B", c2: "#FFD0C2", c3: "#7E0F0A", glow: "rgba(229,53,43,.6)", glow2: "rgba(255,90,60,.85)", tint: "rgba(229,53,43,.16)" },
}

/** Biến CSS của một bậc, dùng cho khung thẻ và các chi tiết cùng màu bậc (nhãn, viền, vệt sáng). */
export function tierStyle(tier: CdTier): CSSProperties {
  const palette = CD_TIER_PALETTE[tier]
  return {
    "--c1": palette.c1,
    "--c2": palette.c2,
    "--c3": palette.c3,
    "--glow": palette.glow,
    "--glow2": palette.glow2,
    "--tint": palette.tint,
  } as CSSProperties
}

type Shape = NonNullable<CdCardDef["shape"]>

/**
 * Mặt thẻ vẽ Hanging Man và Shooting Star bằng thân đỏ (thẻ giảm, bản mẫu Bộ thẻ); hình mẫu trong bài học giữ
 * thân xanh vì bộ nhận diện chỉ xét hình dáng, không xét màu thân.
 */
const FACE_SHAPE_OVERRIDES: Readonly<Record<string, Shape>> = {
  treo_co: [[0.3, 0.35, -2.5, 0]],
  sao_bang: [[0.3, 2.8, -0.05, 0]],
}

/** Hình mẫu dùng để vẽ mặt thẻ. */
export function cardFaceShape(card: CdCardDef): CdCardDef["shape"] {
  return FACE_SHAPE_OVERRIDES[card.id] ?? card.shape
}

