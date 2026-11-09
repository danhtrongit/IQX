import { beforeAll, describe, expect, it } from "vitest"

import { cdCard } from "@/lib/candle-dojo/cards"
import { CD_LESSONS } from "@/lib/candle-dojo/lessons"
import { ApiError } from "@/lib/api"
import { classifyCardPurchaseError } from "../candle-dojo-api"
import { loadLessonBank, type LessonBank } from "./lesson-data"
import {
  advanceStory,
  classifyHuntTap,
  GROW_FRAMES,
  growBar,
  INTRO_CONTEXT_BARS,
  introView,
  placePatternBars,
  resolveLessonContent,
  STORY_START,
  storyFrame,
  twinSides,
  volumeView,
  wrongTapInfo,
  type StoryState,
} from "./lesson-model"
import { purchaseFailureMessage, purchaseView } from "./purchase-model"

let bank: LessonBank
beforeAll(async () => {
  bank = await loadLessonBank()
})

describe("nội dung 27 bài", () => {
  it("mọi bài dựng được: bối cảnh đủ 6 nến, Đúng chỗ khớp số nến của thẻ, Săn nến vừa một khung", () => {
    for (const lesson of CD_LESSONS) {
      const content = resolveLessonContent(lesson.id, bank)
      expect(content, lesson.id).not.toBeNull()
      const { exercises, cards } = content!
      const { bars, contextCount } = introView(exercises.story, lesson.patternBars)
      expect(contextCount, lesson.id).toBe(INTRO_CONTEXT_BARS)
      expect(bars.length, lesson.id).toBe(INTRO_CONTEXT_BARS + lesson.patternBars)
      expect(exercises.hunt.bars.length, lesson.id).toBeLessThanOrEqual(52)
      expect(exercises.twins, lesson.id).toHaveLength(3)
      for (const item of exercises.place) {
        expect(placePatternBars(item.D), `${lesson.id}/${item.card} D`).toBe(cdCard(item.card)!.candles)
        expect(placePatternBars(item.T), `${lesson.id}/${item.card} T`).toBe(cdCard(item.card)!.candles)
      }
      expect(exercises.place.map((item) => item.card), lesson.id).toEqual(cards.map((card) => card.id).slice(0, exercises.place.length))
    }
  })

  it("Rồi sao?: bên khối lượng lớn đổi chỗ theo bài, hai bên luôn có đúng một lần đáng tin", () => {
    const sides = CD_LESSONS.map((lesson) => volumeView(resolveLessonContent(lesson.id, bank)!).sides)
    for (const pair of sides) expect(pair.filter((side) => side.trusted)).toHaveLength(1)
    expect(sides[0][0].trusted).toBe(true)
    expect(sides[1][1].trusted).toBe(true)
  })

  it("Rồi sao?: mẫu trung tính so cú bứt phá, các mẫu khác so hai lần cùng mẫu", () => {
    const doji = volumeView(resolveLessonContent("doji", bank)!)
    expect(doji.neutral).toBe(true)
    expect(doji.question).toBe("Sau Doji, cú bứt phá nào đáng tin hơn?")
    expect(doji.bandEnd).toBe(doji.bandStart + 1)
    const hammer = volumeView(resolveLessonContent("hammer", bank)!)
    expect(hammer.neutral).toBe(false)
    expect(hammer.question).toBe("Hai lần Hammer. Lần nào đáng tin hơn?")
    expect(hammer.cut).toBe(bank.hammer.vol.idx + 1)
  })

  it("Song sinh: bên có mẫu đúng theo goodSide", () => {
    for (const lesson of CD_LESSONS) {
      for (const twin of bank[lesson.id].twins) {
        const sides = twinSides(twin)
        expect(sides.map((side) => side.side)).toEqual(["a", "b"])
        expect(sides.find((side) => side.good)?.side).toBe(twin.goodSide)
      }
    }
  })
})

describe("hoạt cảnh câu chuyện", () => {
  it("nến hình thành từ giá mở, đủ cao thấp ở khung cuối và khối lượng lớn dần", () => {
    const target = { o: 100, h: 130, l: 90, c: 120, v: 2 }
    const first = growBar(target, 0)
    expect(first).toMatchObject({ o: 100, h: 100, l: 100, c: 100 })
    expect(growBar(target, GROW_FRAMES)).toBe(target)
    let previousVolume = 0
    for (let frame = 0; frame < GROW_FRAMES; frame += 1) {
      const bar = growBar(target, frame)
      expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c))
      expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c))
      expect(bar.h).toBeLessThanOrEqual(target.h)
      expect(bar.l).toBeGreaterThanOrEqual(target.l)
      expect(bar.v!).toBeGreaterThanOrEqual(previousVolume)
      previousVolume = bar.v!
    }
    // Nến tăng đi xuống đáy trước rồi lên đỉnh rồi về giá đóng.
    expect(growBar(target, 6).l).toBe(90)
  })

  it("chạy hết: bối cảnh 120 ms mỗi nến, từng nến của mẫu, rồi dừng ở trạng thái xong", () => {
    const story = bank.engulfing.story
    const patternBars = 2
    const contextCount = story.length - patternBars
    let state: StoryState = STORY_START
    let elapsed = 0
    let steps = 0
    for (;;) {
      const step = advanceStory(state, contextCount, patternBars)
      if (!step) break
      if (state.stage === "context" && state.shown < contextCount) expect(step.delay).toBe(120)
      elapsed += step.delay
      state = step.next
      steps += 1
      expect(steps).toBeLessThan(500)
    }
    expect(state.stage).toBe("done")
    expect(storyFrame(story, patternBars, state)).toMatchObject({ caption: Number.POSITIVE_INFINITY })
    expect(storyFrame(story, patternBars, state).bars).toHaveLength(story.length)
    expect(elapsed).toBeGreaterThan((contextCount - 1) * 120)
    // Giữa nến thứ hai của mẫu: có đủ bối cảnh, nến thứ nhất của mẫu và nến đang hình thành.
    const middle = storyFrame(story, patternBars, { stage: "grow", index: 1, frame: 5 })
    expect(middle.bars).toHaveLength(contextCount + 2)
    expect(middle.caption).toBe(2)
  })
})

describe("chạm trong Săn nến", () => {
  it("phân loại chạm trúng, chạm nhầm và chạm lại mẫu đã tìm", () => {
    const spec = bank.hammer.hunt
    expect(classifyHuntTap(spec, [], 3)).toBe("found")
    expect(classifyHuntTap(spec, [], 4)).toBe("found")
    expect(classifyHuntTap(spec, [3], 3)).toBe("repeat")
    expect(classifyHuntTap(spec, [3], 20)).toBe("wrong")
  })

  it("chạm nhầm vào mồi nhử thì tô cả mồi và lấy tên bộ nhận diện gọi", () => {
    const spec = bank.hammer.hunt
    expect(wrongTapInfo(spec, 47)).toEqual({ start: 47, end: 47, name: "Hanging Man" })
    expect(wrongTapInfo(spec, 25)).toEqual({ start: 25, end: 25, name: null })
    expect(wrongTapInfo(spec, 44)).toEqual({ start: 44, end: 44, name: "Bullish Marubozu" })
  })
})

describe("mua thẻ", () => {
  const item = { owned: false, unlocked: true, price_xu: 300 }

  it("chọn trạng thái nút theo số dư, sở hữu và mở khoá", () => {
    expect(purchaseView(item, 300, false)).toEqual({ kind: "ready", price: 300 })
    expect(purchaseView(item, 120, false)).toEqual({ kind: "short", price: 300, shortfall: 180 })
    expect(purchaseView({ ...item, owned: true }, 0, false)).toEqual({ kind: "owned" })
    expect(purchaseView({ ...item, unlocked: false }, 999, false)).toEqual({ kind: "locked" })
    expect(purchaseView({ ...item, unlocked: false }, 999, true)).toEqual({ kind: "ready", price: 300 })
  })

  it("lời báo lỗi bằng tiếng Việt cho từng mã lỗi của server", () => {
    const failure = (code: string, details?: unknown[]) => classifyCardPurchaseError(new ApiError("x", 409, { code, details }))
    expect(purchaseFailureMessage(failure("CARD_OWNED"))).toBe("Bạn đã có thẻ này. Không trừ thêm xu.")
    expect(purchaseFailureMessage(failure("CARD_LOCKED"))).toContain("Hoàn thành bài học")
    expect(purchaseFailureMessage(failure("PRICE_CHANGED"))).toContain("Giá thẻ vừa thay đổi")
    expect(purchaseFailureMessage(failure("CATALOG_CHANGED"))).toContain("Bộ thẻ vừa được cập nhật")
    expect(purchaseFailureMessage(failure("INSUFFICIENT_XU", [{ balance_xu: 120, price_xu: 300 }]))).toBe("Chưa đủ xu: cần 300 xu, bạn có 120 xu.")
  })
})
