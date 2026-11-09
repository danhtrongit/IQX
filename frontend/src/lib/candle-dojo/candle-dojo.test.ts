import { describe, expect, it } from "vitest"

import exercisesFile from "./content/exercises.json"
import { CD_CARDS, CD_CARD_COUNT, CD_TIER_INFO } from "./cards"
import { DETECTOR_CARD_IDS, prep, rawMatches, type CdBar } from "./detector"
import { CD_LESSONS, CD_REWARD_XU } from "./lessons"
import { gradeExam, gradeHunt, gradeTwins, lessonStars, type CdLessonExercises } from "./grading"

// Bản sao chung với backend (giống từng byte, backend có test đối chiếu): ở đây chỉ kiểm bản sao dùng được
// trong frontend, không phụ thuộc đường dẫn backend.
const exercises = (exercisesFile as unknown as { lessons: Record<string, CdLessonExercises> }).lessons

describe("danh mục thẻ và bài", () => {
  it("47 thẻ, 27 bài, bộ nhận diện dùng đúng cùng tập mã thẻ", () => {
    expect(CD_CARDS).toHaveLength(CD_CARD_COUNT)
    expect(CD_CARD_COUNT).toBe(47)
    expect(CD_LESSONS).toHaveLength(27)
    expect([...DETECTOR_CARD_IDS].sort()).toEqual(CD_CARDS.map((card) => card.id).sort())
    expect(Object.values(CD_TIER_INFO).map((tier) => tier.priceXu)).toEqual([300, 600, 1000, 2000, 3000])
    expect(CD_REWARD_XU).toMatchObject({ intro: 100, lesson: 100, belt: 300 })
  })

  it("mọi bài có bộ bài tập và mỗi thẻ thuộc đúng một bài", () => {
    for (const lesson of CD_LESSONS) expect(exercises[lesson.id], lesson.id).toBeDefined()
    const owners = new Map<string, number>()
    for (const lesson of CD_LESSONS) for (const card of lesson.cards) owners.set(card, (owners.get(card) ?? 0) + 1)
    expect(owners.size).toBe(47)
    expect([...owners.values()].every((count) => count === 1)).toBe(true)
  })
})

describe("bộ nhận diện", () => {
  it("nhận ra Doji ở các nến mẫu của bài Doji", () => {
    const { hunt } = exercises["doji"]!
    const series = prep(hunt.bars)
    for (const [, end] of hunt.targets) {
      expect(rawMatches(series, end).map((match) => match.id)).toContain("doji")
    }
  })

  it("chuỗi rỗng không lỗi", () => {
    const empty: readonly CdBar[] = []
    expect(() => prep(empty)).not.toThrow()
  })
})

describe("chấm bài (cùng luật với server)", () => {
  const hunt = exercises["doji"]!.hunt

  it("Săn nến: đủ mẫu và nhầm tối đa 1 lần thì được sao; chạm lại mẫu đã tìm không tính nhầm", () => {
    const taps = hunt.targets.map((target) => target[0])
    expect(gradeHunt(hunt, taps).star).toBe(true)
    expect(gradeHunt(hunt, [...taps, taps[0]!]).miss).toBe(0)
    const decoy = hunt.decoys[0]![0]
    expect(gradeHunt(hunt, [...taps, decoy]).star).toBe(true)
    expect(gradeHunt(hunt, [...taps, decoy, decoy + 4]).star).toBe(false)
    expect(gradeHunt(hunt, taps.slice(1)).star).toBe(false)
  })

  it("Song sinh: đúng từ 2/3 thì được sao; thiếu câu là sai", () => {
    const twins = exercises["doji"]!.twins
    const right = twins.map((twin) => twin.goodSide)
    expect(gradeTwins(twins, right).star).toBe(true)
    expect(gradeTwins(twins, [right[0], right[1], null]).star).toBe(true)
    expect(gradeTwins(twins, [right[0], null, null]).star).toBe(false)
  })

  it("sao của một bài: 1 + Săn nến + Song sinh", () => {
    expect(lessonStars(false, false).stars).toBe(1)
    expect(lessonStars(true, false).stars).toBe(2)
    expect(lessonStars(true, true).stars).toBe(3)
  })

  it("thi đai: đếm số câu đúng, thiếu câu là sai", () => {
    expect(gradeExam(["a", "b", "c"], ["a", "x", null]).score).toBe(1)
  })
})
