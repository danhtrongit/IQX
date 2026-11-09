import { describe, expect, it } from "vitest"

import { CD_LESSONS } from "@/lib/candle-dojo/lessons"
import { avatarInitial, beltAdjective, beltColor, buildHomeModel, pickDrillLesson } from "./candle-dojo-model"
import { makeState, starsForDojos } from "./dojo-test-support"

describe("Candle Dojo home model", () => {
  it("follows the server for locks, stars and the lesson to learn next", () => {
    const model = buildHomeModel(makeState({ belt: 0, stars: { marubozu: 3 } }), false)
    expect(model.dojos.map((dojo) => dojo.unlocked)).toEqual([true, false, false, false, false])
    const dojo1 = model.dojos[0]
    expect(dojo1.lessons.map((row) => row.open)).toEqual([true, true, false, false, false, false])
    expect(dojo1.lessons.map((row) => row.current)).toEqual([false, true, false, false, false, false])
    expect(dojo1.lessons[0].stars).toBe(3)
    expect(dojo1.lessonsDone).toBe(1)
    expect(dojo1.examReady).toBe(false)
  })

  it("preview opens every Dojo and lesson and leaves the server's exam readiness and drill pool honest about the data", () => {
    const state = makeState({ belt: -1 })
    const model = buildHomeModel(state, true)
    expect(model.dojos.every((dojo) => dojo.unlocked && dojo.lessons.every((row) => row.open))).toBe(true)
    expect(model.dojos.every((dojo) => !dojo.examReady && !dojo.passed)).toBe(true)
    expect(model.drill.unlocked).toBe(true)
    expect(model.drill.poolSize).toBe(CD_LESSONS.length)
    expect(buildHomeModel(state, false).drill).toMatchObject({ unlocked: false, poolSize: 0 })
    // Belt, balance and card count are always the server's, preview or not.
    expect(model).toMatchObject({ belt: -1, balance: 1500, cardsOwned: 0, cardsTotal: 47 })
  })

  it("picks the drill lesson among studied lessons only, and none when there is nothing studied", () => {
    const state = makeState({ belt: 1, stars: starsForDojos(1) })
    const dojo1 = CD_LESSONS.filter((lesson) => lesson.dojo === 1)
    expect(pickDrillLesson(state, false, () => 0)).toBe(dojo1[0].id)
    expect(pickDrillLesson(state, false, () => 0.9999)).toBe(dojo1[dojo1.length - 1].id)
    expect(pickDrillLesson(makeState({ belt: 0 }), false)).toBeNull()
    expect(pickDrillLesson(makeState({ belt: 0 }), true, () => 0.9999)).toBe(CD_LESSONS[CD_LESSONS.length - 1].id)
  })

  it("names belts and avatars", () => {
    expect(beltColor(-1)).toBeNull()
    expect(beltColor(0)).toBe("#F2F2F2")
    expect(beltAdjective(5)).toBe("đen")
    expect(beltAdjective(-1)).toBe("")
    expect(avatarInitial({ full_name: "  đặng An", username: "an" })).toBe("Đ")
    expect(avatarInitial({ full_name: null, username: "an" })).toBe("A")
    expect(avatarInitial(null)).toBe("B")
  })
})
