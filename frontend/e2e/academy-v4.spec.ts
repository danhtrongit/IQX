/**
 * Học viện v4 against the real backend (design §9). Skips unless E2E_REAL_BACKEND=1.
 * Setup: backend on :3001 (or E2E_API_BASE_URL) with migrations applied (0037 included) and ACADEMY_ENABLED=true.
 * A fresh user is registered per run. Correct answers come from the private banks read on the Node
 * side and are matched by their stable option ids; the browser never sees them before submit.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import type { APIRequestContext, Page } from "@playwright/test"
import { test, expect } from "./fixtures"

const API = (process.env.E2E_API_BASE_URL?.trim() || "http://127.0.0.1:3001/api/v2").replace(/\/$/, "")
const PASSWORD = process.env.E2E_TEST_PASSWORD || "Academy32!Passw0rd"
const BANKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend/src/modules/academy/content/v4/questions")

type Bank = { questions: { id: string; correct_option_id: string }[] }
type Session = { access_token: string; refresh_token: string }

const correctOf = (itemId: string): Map<string, string> => {
  const bank = JSON.parse(readFileSync(path.join(BANKS, `${itemId}.private.json`), "utf8")) as Bank
  return new Map(bank.questions.map((question) => [question.id, question.correct_option_id]))
}

const unwrap = <T>(payload: unknown): T =>
  payload && typeof payload === "object" && "data" in payload ? (payload as { data: T }).data : (payload as T)

async function register(request: APIRequestContext): Promise<Session> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const email = `academy4.${stamp}@example.com`
  const created = await request.post(`${API}/auth/register`, {
    data: { email, password: PASSWORD, full_name: "Học viên e2e", username: `hv4_${stamp}`, phone_number: `09${String(Date.now()).slice(-8)}` },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const login = await request.post(`${API}/auth/login`, { data: { identifier: email, password: PASSWORD } })
  expect(login.ok(), await login.text()).toBeTruthy()
  return unwrap<Session>(await login.json())
}

function client(request: APIRequestContext, session: Session) {
  const headers = { authorization: `Bearer ${session.access_token}` }
  return {
    get: async <T>(route: string) => {
      const response = await request.get(`${API}${route}`, { headers })
      return { status: response.status(), body: unwrap<T>(await response.json()) }
    },
    post: async <T>(route: string, data: unknown) => {
      const response = await request.post(`${API}${route}`, { headers, data })
      return { status: response.status(), body: unwrap<T>(await response.json()) }
    },
  }
}

type Api = ReturnType<typeof client>
type Catalog = { catalog_version: string; chapters: { items: { id: string; optional: boolean; has_scenario: boolean }[] }[] }
type Attempt = { attempt_id: string; questions: { id: string }[] }

/** Passes one item through the API with the bank's answers (choosing the scenario first when needed). */
async function passViaApi(api: Api, catalogVersion: string, itemId: string, hasScenario: boolean) {
  if (hasScenario) expect((await api.post(`/academy/lessons/${itemId}/scenario`, { choice: 0 })).status).toBe(200)
  const created = await api.post<Attempt>("/academy/attempts", { lesson_id: itemId, catalog_version: catalogVersion, idempotency_key: `e2e-${itemId}-${Date.now()}` })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const correct = correctOf(itemId)
  const answers = created.body.questions.map((question) => ({ question_id: question.id, option_id: correct.get(question.id) as string }))
  const submitted = await api.post<{ passed: boolean }>(`/academy/attempts/${created.body.attempt_id}/submit`, { answers })
  expect(submitted.body.passed).toBe(true)
}

async function signIn(page: Page, session: Session) {
  await page.addInitScript((tokens) => {
    sessionStorage.setItem("iqx.v2.access_token", tokens.access_token)
    sessionStorage.setItem("iqx.v2.refresh_token", tokens.refresh_token)
    localStorage.setItem("iqx.v2.remember", "false")
  }, session)
}

/** Answers the open quiz in the browser with the bank's correct options and submits. */
async function answerQuiz(page: Page, itemId: string) {
  const correct = correctOf(itemId)
  for (let index = 0; index < correct.size; index += 1) {
    const radio = page.locator('input[type="radio"]').first()
    await expect(radio).toBeVisible()
    const questionId = (await radio.getAttribute("name"))!.replace(/^quiz-/, "")
    await page.locator(`input[type="radio"][value="${correct.get(questionId)}"]`).check()
    await page.getByRole("button", { name: index < correct.size - 1 ? "Câu tiếp theo" : "Nộp bài" }).click()
  }
}

test.describe("Học viện v4 on the real backend", () => {
  test.skip(process.env.E2E_REAL_BACKEND !== "1", "Set E2E_REAL_BACKEND=1 with a migrated backend and ACADEMY_ENABLED=true")
  test.setTimeout(120_000)

  test("learning is free: a new user finds every item open, and passing lesson 1 marks only that lesson", async ({ page, request }) => {
    const session = await register(request)
    const api = client(request, session)
    const progress = (await api.get<{ items: { id: string; state: string }[]; course_total: number; access_mode: string }>("/academy/progress")).body
    expect(progress.course_total).toBe(116)
    expect(progress.access_mode).toBe("free")
    expect(progress.items).toHaveLength(129)
    expect(progress.items.every((item) => item.state === "open")).toBe(true)
    // A late exam and a late lesson answer 201, never 403 ACADEMY_ITEM_LOCKED.
    const catalog = (await api.get<Catalog>("/academy/catalog")).body
    for (const itemId of ["ch12-exam", "ch10-l05"]) {
      const created = await api.post("/academy/attempts", { lesson_id: itemId, catalog_version: catalog.catalog_version, idempotency_key: `e2e-free-${itemId}-${Date.now()}` })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
    }

    await signIn(page, session)
    await page.goto("/demo-trading?view=academy&lesson=ch01-l01")
    const panel = page.getByRole("complementary")
    await expect(panel.getByText("116 bài học")).toBeVisible()
    await expect(panel.locator('[data-academy-row="ch01-l02"]').getByRole("button", { name: /Học bài/ })).toBeVisible()
    await expect(panel.getByText("Chưa mở")).toHaveCount(0)

    await page.getByRole("button", { name: "Làm bài kiểm tra" }).click()
    await answerQuiz(page, "ch01-l01")
    await expect(page.getByLabel("Điểm 3 trên 3")).toBeVisible()
    await expect(page.getByText("Đạt", { exact: true })).toBeVisible()
    // No "Đã mở chỉ báo X" label any more (spec v4 §3).
    await expect(page.getByText(/Đã mở chỉ/)).toHaveCount(0)
    await expect(panel.locator('[data-academy-row="ch01-l01"]').getByRole("button", { name: /Xem lại/ })).toBeVisible()
    await expect(panel.locator('[data-academy-row="ch01-l02"]').getByRole("button", { name: /Học bài/ })).toBeVisible()
  })

  test("chapter 2 still needs a scenario choice: 403 before, gate opens after choosing in the UI", async ({ page, request }) => {
    const session = await register(request)
    const api = client(request, session)
    const catalog = (await api.get<Catalog>("/academy/catalog")).body
    const refused = await api.post<{ error?: { code?: string } }>("/academy/attempts", {
      lesson_id: "ch02-l01",
      catalog_version: catalog.catalog_version,
      idempotency_key: `e2e-scenario-${Date.now()}`,
    })
    expect(refused.status).toBe(403)
    expect(refused.body.error?.code).toBe("ACADEMY_SCENARIO_REQUIRED")

    await signIn(page, session)
    await page.goto("/demo-trading?view=academy&lesson=ch02-l01")
    await expect(page.getByRole("button", { name: "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra" })).toBeDisabled()
    await page.locator("[data-academy-scenario]").getByRole("button").first().click()
    await expect(page.getByRole("button", { name: "Làm bài kiểm tra" })).toBeEnabled()
    await page.reload()
    await expect(page.getByRole("button", { name: "Làm bài kiểm tra" })).toBeEnabled()
  })

  test("a chapter 4 lesson with charts has no horizontal scroll at 390px", async ({ page, request }) => {
    const session = await register(request)
    await signIn(page, session)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/demo-trading?view=academy&lesson=ch04-l04")
    await expect(page.getByRole("heading", { level: 2, name: "Khối lượng" })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("no tool waits for a lesson, and passing an indicator or metric lesson announces nothing opened", async ({ page, request }) => {
    const session = await register(request)
    const api = client(request, session)
    const hasIndicator = async (id: string) =>
      (await api.get<{ indicators: { id: string }[] }>("/flashback/indicators")).body.indicators.some((indicator) => indicator.id === id)
    const roe = async () =>
      (await api.get<{ id: string; learned: boolean }[]>("/strategy/screener/metrics")).body.find((metric) => metric.id === "roe")

    // Before any lesson: EMA is listed, and ROE (and the 41 other metrics) are usable in the screener.
    expect(await hasIndicator("ema")).toBe(true)
    expect((await roe())?.learned).toBe(true)

    await signIn(page, session)
    await page.goto("/demo-trading?view=academy&lesson=ch06-l01")
    await page.getByRole("button", { name: "Làm bài kiểm tra" }).click()
    await answerQuiz(page, "ch06-l01")
    await expect(page.getByLabel(/^Điểm \d+ trên \d+$/)).toBeVisible()
    await expect(page.getByText(/Đã mở chỉ/)).toHaveCount(0)

    // The ROE lesson is ch08-l11 now; passing it by API changes nothing for the screener.
    const catalog = (await api.get<Catalog>("/academy/catalog")).body
    await passViaApi(api, catalog.catalog_version, "ch08-l11", false)
    expect((await roe())?.learned).toBe(true)
  })

  test("deep links open the lesson of a metric: by key, by name, from the query, and the current lesson on a miss", async ({ page, request }) => {
    const session = await register(request)
    const api = client(request, session)
    const byKey = (await api.get<{ found: boolean; item_id: string; matched_by: string; url: string }>("/academy/link?metric=NIM")).body
    expect(byKey).toMatchObject({ found: true, item_id: "ch10-l01", matched_by: "metric_key", url: "/hoc-vien/ch10-l01" })

    await signIn(page, session)
    await page.goto("/hoc-vien/bai/NIM")
    await expect(page).toHaveURL(/lesson=ch10-l01/)
    await expect(page).not.toHaveURL(/metric=/)
    await expect(page.getByRole("heading", { level: 2, name: /^NIM/ })).toBeVisible()

    // A name with accents, spaces and a slash, in the query form; the tool switches lesson at once.
    await page.goto(`/hoc-vien?metric=${encodeURIComponent("Tỷ lệ dự phòng / Dư nợ")}`)
    await expect(page).toHaveURL(/lesson=ch10-l07/)
    await expect(page.getByRole("heading", { level: 2, name: /^Tỷ lệ dự phòng/ })).toBeVisible()

    // Nothing matches: the lesson learned last opens (ch10-l07 was opened last), with no error shown.
    await page.goto(`/hoc-vien/bai/${encodeURIComponent("khong-co-chi-tieu-nay")}`)
    await expect(page).toHaveURL(/lesson=ch10-l07/)
    await expect(page.getByRole("alert")).toHaveCount(0)
  })
})
