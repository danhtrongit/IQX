import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const post = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  unwrap: <T,>(response: T) => response,
}))

import { useGraduateCap7 } from "./hooks"
import { cap7Keys } from "./keys"

function withClient(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateQueries = vi.spyOn(client, "invalidateQueries")
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
  return invalidateQueries
}

beforeEach(() => post.mockReset())

describe("useGraduateCap7", () => {
  it("invalidates live progress and allocation after a rejected live-gate POST", async () => {
    post.mockReturnValue({ json: () => Promise.reject(new Error("409")) })
    function Harness() {
      const graduate = useGraduateCap7()
      return <button onClick={() => graduate.mutate()}>graduate</button>
    }

    const invalidateQueries = withClient(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "graduate" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap7/graduate"))
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: cap7Keys.progress() }),
    )
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: cap7Keys.portfolio() })
  })
})
