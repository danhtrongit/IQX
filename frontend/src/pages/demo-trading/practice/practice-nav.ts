import { useCallback } from "react"
import { useSearchParams } from "react-router"

/** "Về Bot": drops `practice=` and keeps the rest of the workspace URL (view=bot, symbol, ...). */
export function useExitPractice(): () => void {
  const [params, setParams] = useSearchParams()
  return useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete("practice")
    setParams(next, { replace: true })
  }, [params, setParams])
}
