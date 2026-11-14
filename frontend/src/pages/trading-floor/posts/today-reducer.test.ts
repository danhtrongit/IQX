import { describe, expect, it } from "vitest"

import type { PostCard } from "../net/types"
import { timeAgo, vnDateKey } from "./format"
import { applyPostEvent, setHeart } from "./today-reducer"

const card = (
  id: string,
  publishedAt: number,
  extra: Partial<PostCard> = {}
): PostCard => ({
  id,
  sacoId: `saco-${id}`,
  sacoName: `SACO ${id}`,
  headline: `Câu tiêu điểm ${id}`,
  publishedAt,
  hearts: 0,
  comments: 0,
  hearted: false,
  ...extra,
})

describe("applyPostEvent", () => {
  const today = [
    card("b", 2_000, { hearts: 3, hearted: true }),
    card("a", 1_000),
  ]

  it("prepends a new post, newest first, without duplicates", () => {
    const next = applyPostEvent(today, {
      type: "post:new",
      post: card("c", 3_000),
    })
    expect(next.map((post) => post.id)).toEqual(["c", "b", "a"])
    const again = applyPostEvent(next, {
      type: "post:new",
      post: card("c", 3_000, { hearts: 1 }),
    })
    expect(again.map((post) => post.id)).toEqual(["c", "b", "a"])
    expect(again[0].hearts).toBe(1)
  })

  it("keeps the viewer's own heart when a known post is re-announced (unhide)", () => {
    const next = applyPostEvent(today, {
      type: "post:new",
      post: card("b", 2_000, { hearts: 5, hearted: false }),
    })
    expect(next[0]).toMatchObject({ id: "b", hearts: 5, hearted: true })
  })

  it("removes a hidden post and ignores unknown ids", () => {
    expect(
      applyPostEvent(today, { type: "post:hidden", id: "b" }).map(
        (post) => post.id
      )
    ).toEqual(["a"])
    expect(applyPostEvent(today, { type: "post:hidden", id: "zzz" })).toBe(
      today
    )
  })

  it("updates heart and comment counts", () => {
    const hearts = applyPostEvent(today, {
      type: "post:heart",
      id: "a",
      hearts: 7,
    })
    expect(hearts[1].hearts).toBe(7)
    expect(hearts[0]).toBe(today[0])
    const comments = applyPostEvent(hearts, {
      type: "post:comment",
      postId: "b",
      comments: 4,
    })
    expect(comments[0].comments).toBe(4)
    expect(
      applyPostEvent(comments, {
        type: "post:comment",
        postId: "b",
        comments: 4,
      })
    ).toBe(comments)
    expect(
      applyPostEvent(today, { type: "post:heart", id: "nope", hearts: 1 })
    ).toBe(today)
  })

  it("sets the viewer's heart", () => {
    const next = setHeart(today, "a", true, 1)
    expect(next[1]).toMatchObject({ hearted: true, hearts: 1 })
    expect(setHeart(next, "a", true, 1)).toBe(next)
  })
})

describe("VN day helpers", () => {
  it("uses the Vietnam calendar day", () => {
    // 2026-11-13 17:30 UTC is 2026-11-14 00:30 in Vietnam.
    expect(vnDateKey(Date.UTC(2026, 10, 13, 17, 30))).toBe("2026-11-14")
    expect(vnDateKey(Date.UTC(2026, 10, 13, 16, 59))).toBe("2026-11-13")
  })

  it("formats relative comment times", () => {
    const now = Date.UTC(2026, 10, 14, 5, 0)
    expect(timeAgo(now - 20_000, now)).toBe("vừa xong")
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 phút trước")
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 giờ trước")
  })
})
