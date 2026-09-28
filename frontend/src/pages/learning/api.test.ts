import { describe, expect, it } from "vitest"

import { adaptCourseDetail, adaptEpisodeContent } from "./api"

describe("learning v2 adapters", () => {
  it("treats an absent course as absent instead of inventing a record", () => {
    expect(adaptCourseDetail(null)).toBeNull()
  })

  it("preserves nullable course and episode fields and an empty episode list", () => {
    expect(
      adaptCourseDetail({
        id: "course-1",
        slug: "intro",
        title: "Nhập môn",
        description: null,
        thumbnail_url: null,
        level: "beginner",
        category: "basics",
        is_premium: false,
        total_episodes: 0,
        total_duration_seconds: 0,
        episodes: [],
      }),
    ).toMatchObject({ description: null, thumbnailUrl: null, isPremium: false, episodes: [] })
  })

  it("keeps the server signed media URL intact for browser range requests", () => {
    const signed = "/api/v2/media/signed-token"
    expect(
      adaptEpisodeContent({
        id: "episode-1",
        course_id: "course-1",
        title: "Video",
        description: null,
        content_type: "video",
        file_url: signed,
        markdown_body: null,
        duration_seconds: null,
        sort_order: 1,
      }),
    ).toMatchObject({ fileUrl: signed, contentType: "video" })
  })
})
