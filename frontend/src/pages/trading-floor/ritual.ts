/**
 * Rules of the Thần Tài ritual that the browser needs (the server scores the sessions).
 * Times are Vietnam time (UTC+7, no daylight saving).
 */
import { vnParts } from "./net/market/time.ts"

export const RITUAL_RULES = {
  /** Predictions for a session close at this time (before the 14:30–14:45 ATC auction). */
  cutoff: { hour: 14, minute: 30 },
  /** The server reads the VNINDEX close after this time and scores the session. */
  resolveAfter: { hour: 15, minute: 0 },
  /** Tickers each person prays for. */
  tickersToPray: 3,
  /** Tickers shown in the "most prayed" list. */
  topTickers: 5,
  /** A predicted close further than this from the last value is refused as a typo. */
  maxLevelDeviation: 0.1,
  /** Statues in the hall of fame. */
  statues: 3,
} as const

export type Direction = "up" | "down"

/** One lot of the quẻ cup. `luck` 1–5 drives the colour and the Thần Tài reaction. */
export interface Que {
  id: number
  name: string
  luck: 1 | 2 | 3 | 4 | 5
  verse: string
  advice: string
}

/** A light-hearted fortune: wording stays playful and never reads as investment advice. */
export const QUE_LIST: readonly Que[] = [
  {
    id: 1,
    name: "Đại Cát",
    luck: 5,
    verse: "Kim ngân mãn đường, lộc đến tận cửa.",
    advice: "Tâm vững, tay chắc, giữ kỷ luật như mọi ngày.",
  },
  {
    id: 2,
    name: "Thượng Cát",
    luck: 5,
    verse: "Gió thuận buồm căng, thuyền vàng ra khơi.",
    advice: "Thuận gió cũng nhớ đặt điểm dừng lỗ.",
  },
  {
    id: 3,
    name: "Trung Cát",
    luck: 4,
    verse: "Nước chảy đá mòn, kiên trì ắt thành.",
    advice: "Đi từng bước, chia nhỏ vị thế.",
  },
  {
    id: 4,
    name: "Tiểu Cát",
    luck: 4,
    verse: "Mầm non gặp mưa xuân, lộc nhỏ mà bền.",
    advice: "Lãi nhỏ đều tay hơn ván lớn may rủi.",
  },
  {
    id: 5,
    name: "Cát",
    luck: 4,
    verse: "Trăng tròn soi lối, quý nhân phù trợ.",
    advice: "Hỏi thêm SACO trước khi xuống tiền.",
  },
  {
    id: 6,
    name: "Bình Hòa",
    luck: 3,
    verse: "Mặt hồ phẳng lặng, chờ gió sẽ lên.",
    advice: "Thị trường đi ngang thì kiên nhẫn là lộc.",
  },
  {
    id: 7,
    name: "Bình An",
    luck: 3,
    verse: "Giữ gốc là giữ lộc, an cư mới lạc nghiệp.",
    advice: "Ưu tiên quản trị rủi ro hôm nay.",
  },
  {
    id: 8,
    name: "Trung Bình",
    luck: 3,
    verse: "Nửa nắng nửa mưa, cầm ô mà đi.",
    advice: "Cân bằng tiền mặt và cổ phiếu.",
  },
  {
    id: 9,
    name: "Tiểu Hung",
    luck: 2,
    verse: "Mây che đỉnh núi, chậm một nhịp chẳng sao.",
    advice: "Đừng đuổi giá, đợi điểm mua đẹp.",
  },
  {
    id: 10,
    name: "Cẩn Thận",
    luck: 2,
    verse: "Sông sâu chớ lội, đò đầy chớ sang.",
    advice: "Hạn chế margin, giữ tâm lý thoải mái.",
  },
  {
    id: 11,
    name: "Hồi Xuân",
    luck: 4,
    verse: "Đông qua xuân tới, cây khô đâm chồi.",
    advice: "Cơ hội đến với người đã chuẩn bị.",
  },
  {
    id: 12,
    name: "Phúc Lộc",
    luck: 5,
    verse: "Phúc đến lộc về, nhà nhà sung túc.",
    advice: "Chia sẻ niềm vui với đồng đội SACO.",
  },
]

export function queById(id: number): Que | undefined {
  return QUE_LIST.find((q) => q.id === id)
}

const pad = (n: number): string => String(n).padStart(2, "0")

/** `YYYY-MM-DD` of a Vietnam calendar day, `offsetDays` after the day of `epochMs`. */
export function vnDay(epochMs: number, offsetDays = 0): string {
  const p = vnParts(epochMs + offsetDays * 86_400_000)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export const TICKER_RE = /^[A-Z0-9]{3}$/

/** Three different well-formed codes, upper-cased, or null. */
export function normaliseTickers(input: readonly string[]): string[] | null {
  const list = [...new Set(input.map((s) => s.trim().toUpperCase()))]
  if (
    list.length !== RITUAL_RULES.tickersToPray ||
    !list.every((s) => TICKER_RE.test(s))
  )
    return null
  return list
}
