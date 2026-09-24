import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, test } from "vitest"

function PingButton() {
  const [status, setStatus] = useState("idle")

  async function ping() {
    const response = await fetch("/api/test-harness/ping")
    const payload = (await response.json()) as { ok: boolean }
    setStatus(payload.ok ? "ok" : "failed")
  }

  return (
    <>
      <button onClick={() => void ping()}>Ping API</button>
      <output aria-label="request status" role="status">
        {status}
      </output>
    </>
  )
}

test("renders React and handles user interaction in jsdom", async () => {
  const user = userEvent.setup()
  render(<PingButton />)

  await user.click(screen.getByRole("button", { name: "Ping API" }))

  const status = await screen.findByRole("status", { name: "request status" })
  expect(status.textContent).toBe("ok")
})
