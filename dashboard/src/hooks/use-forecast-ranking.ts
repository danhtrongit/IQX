import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export type ForecastHorizon = "3" | "5" | "10"

export interface ForecastItem {
  rank: number
  symbol: string
  /** Fractional return (0.04 = +4%). */
  expectedReturn: number
  /** Probability of an upward move (0..1) — may be null if missing. */
  upProbability: number | null
}

interface ForecastResponse {
  horizon: string
  horizonDays: number
  count: number
  items: ForecastItem[]
}

export function useForecastRanking(horizon: ForecastHorizon, limit = 30) {
  const [items, setItems] = useState<ForecastItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .get("ai/forecast/ranking", { searchParams: { horizon, limit } })
      .json<ForecastResponse>()
      .then((res) => {
        if (!cancelled) setItems(res.items || [])
      })
      .catch((e) => {
        if (!cancelled) {
          setItems([])
          setError("Không thể tải bảng xếp hạng mô hình AI")
          console.error(e)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [horizon, limit])

  return { items, loading, error }
}
