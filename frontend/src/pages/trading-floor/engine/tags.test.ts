import { describe, expect, it } from "vitest"

import { liftTags, type TagBox } from "./tags.ts"

const box = (x: number, y: number, w = 80, h = 20): TagBox => ({ x, y, w, h })

const overlap = (a: TagBox, b: TagBox): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe("liftTags", () => {
  it("leaves tags that do not touch where they are", () => {
    expect(liftTags([box(0, 100), box(200, 100), box(0, 60)], 2, 4)).toEqual([
      0, 0, 0,
    ])
  })

  it("raises the tag behind just clear of the one in front", () => {
    const front = box(0, 100)
    const behind = box(30, 92)
    const [a, b] = liftTags([front, behind], 2, 4)
    expect(a).toBe(0)
    // Bottom of the raised tag sits `gap` above the top of the front one.
    expect(behind.y - b + behind.h).toBe(front.y - 2)
  })

  it("stacks a cluster so no two tags overlap", () => {
    const boxes = [box(0, 100), box(10, 98), box(20, 96), box(30, 94)]
    const lifts = liftTags(boxes, 2, 4)
    const placed = boxes.map((b, i) => ({ ...b, y: b.y - lifts[i] }))
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(overlap(placed[i], placed[j]), `${i} vs ${j}`).toBe(false)
  })

  it("stops climbing after maxSteps", () => {
    const boxes = [box(0, 100), box(0, 100), box(0, 100), box(0, 100)]
    const lifts = liftTags(boxes, 2, 2)
    expect(lifts[0]).toBe(0)
    expect(lifts[1]).toBe(22)
    expect(lifts[2]).toBe(44)
    // The fourth tag has no step left: it stays on the third level.
    expect(lifts[3]).toBe(44)
  })
})
