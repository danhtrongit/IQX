import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

export const handlers = [
  http.get("/api/test-harness/ping", () => HttpResponse.json({ ok: true })),
]

export const server = setupServer(...handlers)
