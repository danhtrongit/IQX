import { useEffect, useState } from "react"

import { world } from "../bridge"
import { floorSocket, type FloorSocketStatus } from "../net/socket"
import { postsApi } from "./api"
import { vnDateKey } from "./format"
import { applyPostEvent, type PostEvent } from "./today-reducer"

/** Thời gian dòng/khung của bài mới được tô vàng nhạt. */
export const FRESH_MS = 2200
const DAY_CHECK_MS = 30_000

/**
 * Giữ `world.posts` (nhận định hôm nay, mới nhất ở trên) khớp máy chủ: tải khi mở khu giao
 * dịch, tải lại khi qua ngày VN, sau khi socket nối lại, hoặc khi lần tải trước lỗi; áp các
 * sự kiện `post:*`. Trả về tập id bài vừa đăng để bảng và danh sách tô sáng.
 */
export function useTodayPosts(): ReadonlySet<string> {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let disposed = false
    let loadedDate: string | null = null
    let failed = false
    let controller: AbortController | null = null
    const timers = new Set<ReturnType<typeof setTimeout>>()

    const load = async () => {
      controller?.abort()
      const current = new AbortController()
      controller = current
      try {
        const result = await postsApi.today(current.signal)
        if (disposed || current.signal.aborted) return
        loadedDate = result.date
        failed = false
        world.posts.set(result.items)
      } catch {
        if (disposed || current.signal.aborted) return
        failed = true
      }
    }

    const flash = (id: string) => {
      setFresh((previous) => new Set(previous).add(id))
      const timer = setTimeout(() => {
        timers.delete(timer)
        setFresh((previous) => {
          const next = new Set(previous)
          next.delete(id)
          return next
        })
      }, FRESH_MS)
      timers.add(timer)
    }

    const apply = (event: PostEvent) =>
      world.posts.update((list) => applyPostEvent(list, event))

    void load()
    let lastStatus: FloorSocketStatus = floorSocket.status.get()
    const offs = [
      floorSocket.on("post:new", (message) => {
        // Bài của ngày khác ngày đang hiện: danh sách đã cũ, tải lại cả ngày mới.
        if (loadedDate && vnDateKey(message.post.publishedAt) !== loadedDate) {
          void load()
          return
        }
        apply(message)
        flash(message.post.id)
      }),
      floorSocket.on("post:hidden", apply),
      floorSocket.on("post:heart", apply),
      floorSocket.on("post:comment", apply),
      floorSocket.status.subscribe((status) => {
        if (status === "online" && lastStatus === "reconnecting") void load()
        lastStatus = status
      }),
    ]
    const dayTimer = setInterval(() => {
      if (failed || (loadedDate && vnDateKey(Date.now()) !== loadedDate))
        void load()
    }, DAY_CHECK_MS)

    return () => {
      disposed = true
      controller?.abort()
      clearInterval(dayTimer)
      for (const timer of timers) clearTimeout(timer)
      for (const off of offs) off()
    }
  }, [])

  return fresh
}
