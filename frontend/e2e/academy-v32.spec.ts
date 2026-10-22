/**
 * Học viện v3.3 against the real backend (design §9). Skips unless E2E_REAL_BACKEND=1.
 * Setup: backend on :3001 (or E2E_API_BASE_URL) with migrations applied and ACADEMY_ENABLED=true.
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
const BANKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend/src/modules/academy/content/v3/questions")

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
  const email = `academy32.${stamp}@example.com`
  const created = await request.post(`${API}/auth/register`, {
    data: { email, password: PASSWORD, full_name: "Học viên e2e", username: `hv32_${stamp}`, phone_number: `09${String(Date.now()).slice(-8)}` },
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

/** Passes every required item before `untilId` in chain order. */
async function passUntil(api: Api, untilId: string) {
  const catalog = (await api.get<Catalog>("/academy/catalog")).body
  for (const item of catalog.chapters.flatMap((chapter) => chapter.items)) {
    if (item.id === untilId) return
    if (!item.optional) await passViaApi(api, catalog.catalog_version, item.id, item.has_scenario)
  }
}

async function signIn(page: Page, session: Session) {
  await page.addInitScript((tokens) => {
    sessionStorage.setItem("iqx.v2.access_token", tokens.access_token)
    sessionStorage.setItem("iqx.v2.refresh_token", tokens.refresh_token)
    localStorage.setItem("iqx.v2.remember", "false")
  }, session)
}

test.describe("Học viện v3.3 on the real backend", () => {
  test.skip(process.env.E2E_REAL_BACKEND !== "1", "Set E2E_REAL_BACKEND=1 with a migrated backend and ACADEMY_ENABLED=true")
  test.setTimeout(120_000)

  test("a new user can open only chapter 1 lesson 1, and passing its quiz opens lesson 2", async ({ page, request }) => {
    const session = await register(request)
    const api = client(request, session)
    const progress = (await api.get<{ items: { id: string; state: string }[]; course_total: number }>("/academy/progress")).body
    expect(progress.course_total).toBe(87)
    expect(progress.items.filter((item) => item.state === "open").map((item) => item.id)).toEqual(["ch01-l01"])
    expect((await api.post("/academy/attempts", { lesson_id: "ch01-l02", catalog_version: "iqx-academy-v3.3-13ch-87lessons", idempotency_key: `e2e-locked-${Date.now()}` })).status).toBe(403)

    await signIn(page, session)
    await page.goto("/demo-trading?view=academy&lesson=ch01-l01")
    const panel = page.getByRole("complementary")
    await expect(panel.getByText("87 bài học")).toBeVisible()
    await expect(panel.locator('[data-academy-row="ch01-l02"]').getByText("Chưa mở")).toBeVisible()

    await page.getByRole("button", { name: "Làm bài kiểm tra" }).click()
    const correct = correctOf("ch01-l01")
    for (let index = 0; index < 3; index += 1) {
      const radio = page.locator('input[type="radio"]').first()
      await expect(radio).toBeVisible()
      const questionId = (await radio.getAttribute("name"))!.replace(/^quiz-/, "")
      await page.locator(`input[type="radio"][value="${correct.get(questionId)}"]`).check()
      await page.getByRole("button", { name: index < 2 ? "Câu tiếp theo" : "Nộp bài" }).click()
    }
    await expect(page.getByLabel("Điểm 3 trên 3")).toBeVisible()
    await expect(page.getByText("Đạt", { exact: true })).toBeVisible()
    await expect(panel.locator('[data-academy-row="ch01-l02"]').getByRole("button", { name: /Học bài/ })).toBeVisible()
  })

  test("chapter 2 needs a scenario choice: 403 before, gate opens after choosing in the UI", async ({ page, request }) => {
    const session = await register(request)
    const api = client(request, session)
    await passUntil(api, "ch02-l01")
    const refused = await api.post<{ error?: { code?: string } }>("/academy/attempts", {
      lesson_id: "ch02-l01",
      catalog_version: "iqx-academy-v3.3-13ch-87lessons",
      idempotency_key: `e2e-scenario-${Date.now()}`,
    })
    expect(refused.status).toBe(403)

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
    await passUntil(client(request, session), "ch04-l04")
    await signIn(page, session)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/demo-trading?view=academy&lesson=ch04-l04")
    await expect(page.getByRole("heading", { level: 2, name: "Khối lượng" })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
