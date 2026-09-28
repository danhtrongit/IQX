import { useState } from "react"

import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog"

/**
 * State holder for `ConfirmDialog`. The caller's `run` owns its own error
 * reporting: a throw keeps the dialog open (and the pending flag cleared) so the
 * admin can retry or cancel.
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!request) return
    setPending(true)
    try {
      await request.run()
      setRequest(null)
    } catch {
      // Reported by `run` itself; the dialog stays open.
    } finally {
      setPending(false)
    }
  }

  return {
    ask: setRequest,
    element: (
      <ConfirmDialog
        request={request}
        pending={pending}
        onOpenChange={(open) => {
          if (!open && !pending) setRequest(null)
        }}
        onConfirm={() => void confirm()}
      />
    ),
  }
}
