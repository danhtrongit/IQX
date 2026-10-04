import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { server } from "@/lib/test-harness/server"

import { createAttempt, getCurriculum, getLesson, isAcademyDisabled, submitAttempt } from "./api"
import { attemptFixture, curriculumFixture, lessonFixture, passedResultFixture } from "./test-fixtures"

describe("academy api", () => {
  it("reads curriculum and lessons from /academy, unwrapping the {data} envelope", async () => {
    server.use(
      http.get("*/api/v2/academy/curriculum", ({ request }) => {
        expect(new URL(request.url).searchParams.get("content_version")).toBe("2.0.0")
        return HttpResponse.json({ data: curriculumFixture() })
      }),
      http.get("*/api/v2/academy/lessons/:id", ({ params }) => HttpResponse.json(lessonFixture(String(params.id)))),
    )
    expect((await getCurriculum("2.0.0")).chapters).toHaveLength(18)
    expect((await getLesson("ch01-l02")).name).toBe("MACD")
  })

  it("posts attempts and submits answers with their idempotency keys", async () => {
    const bodies: unknown[] = []
    server.use(
      http.post("*/api/v2/academy/attempts", async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(attemptFixture(), { status: 201 })
      }),
      http.post("*/api/v2/academy/attempts/:id/submit", async ({ request, params }) => {
        expect(params.id).toBe("attempt-1")
        bodies.push(await request.json())
        return HttpResponse.json({ data: passedResultFixture() })
      }),
    )
    const attempt = await createAttempt({ lesson_id: "ch01-l01", content_version: "2.0.0", idempotency_key: "key-12345678" })
    expect(attempt.questions).toHaveLength(8)
    const result = await submitAttempt("attempt-1", [{ question_id: "q1", option_id: "q1-a" }], "submit-12345678")
    expect(result.passed).toBe(true)
    expect(bodies).toEqual([
      { lesson_id: "ch01-l01", content_version: "2.0.0", idempotency_key: "key-12345678" },
      { answers: [{ question_id: "q1", option_id: "q1-a" }], idempotency_key: "submit-12345678" },
    ])
  })

  it("recognises the ACADEMY_ENABLED=false 404", async () => {
    server.use(http.get("*/api/v2/academy/curriculum", () =>
      HttpResponse.json({ error: { code: "FEATURE_DISABLED", message: "Tắt" } }, { status: 404 })))
    const error = await getCurriculum().catch((caught: unknown) => caught)
    expect(isAcademyDisabled(error)).toBe(true)
  })
})
