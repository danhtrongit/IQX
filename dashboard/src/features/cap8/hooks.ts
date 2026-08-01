import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap8Api } from "./api"
import { cap8Keys } from "./keys"
import type {
  Cap8Progress,
  KehoachInputCap8,
  KiemTraCap8,
  KiemTraInputCap8,
  OrderKehoachCap8,
  ThachThucCap8,
} from "./types"

/**
 * Current user's Cấp 8 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (mirrors `cap7/hooks.ts`). `data` is `null` when the
 * user hasn't entered Cấp 8 yet. `enabled` lets callers outside the Cấp 8 shell
 * pass their own `isCap8Active` so this never fires elsewhere.
 *
 * ★ `don_nganh_max_pct` / `tong_rui_ro_pct` on this payload are a SNAPSHOT of
 * the last `/kiem-tra` or `/thach-thuc` and are `null` until one has run — this
 * endpoint deliberately does not re-price the portfolio. Render that `null` as
 * "chưa tính được"; rendering it as `0` would tell a user their portfolio is
 * perfectly safe when nothing has been computed at all.
 */
export function useCap8Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap8Progress | null>({
    queryKey: cap8Keys.progress(),
    queryFn: cap8Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 8 query — used by every mutation. */
function useInvalidateCap8() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap8Keys.all })
}

/** POST /cap8/enter — enter Cấp 8 (idempotent; requires Cấp 7 graduated). */
export function useEnterCap8() {
  const invalidate = useInvalidateCap8()
  return useMutation<Cap8Progress, unknown, void>({
    mutationFn: cap8Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap8/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap8Task() {
  const invalidate = useInvalidateCap8()
  return useMutation<Cap8Progress, unknown, number>({
    mutationFn: (taskNo) => cap8Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/**
 * How long the check waits for the user to stop editing before it re-runs.
 *
 * ★ It exists because `GET /cap8/kiem-tra` is the most expensive read in the
 * level (a price lookup per position plus a bounded O(n²) set of correlation
 * history fetches) and it hangs off Cấp 3's volume field, which fires on every
 * keystroke. 400 ms is long enough to swallow a multi-digit number and short
 * enough that the answer feels attached to the edit.
 */
export const KIEM_TRA_DEBOUNCE_MS = 400

/**
 * `GET /cap8/kiem-tra` — the whole pre-trade check, DEBOUNCED.
 *
 * The debounce lives on the query KEY: rapid edits would otherwise mint a new
 * key (and a new request) per keystroke. The first value is queried
 * immediately — the panel opening should show a result — and only subsequent
 * changes wait out `delayMs`.
 *
 * `retry: false` so a failure surfaces at once and `KiemTraDanhMucBlock` can
 * degrade OPEN (an honest note + the order still goes through) instead of
 * hanging over a buy it is not allowed to block.
 */
export function useKiemTraCap8(
  input: KiemTraInputCap8,
  enabled = true,
  delayMs = KIEM_TRA_DEBOUNCE_MS,
) {
  const { isAuthenticated } = useAuth()
  const [settled, setSettled] = useState<KiemTraInputCap8>(input)

  // Depends on the SERIALIZED inputs, not the object identity: the caller
  // rebuilds this object every render, and an identity-keyed effect would reset
  // the timer forever and never fire.
  const serialized = `${input.symbol}|${input.khoiLuong}|${input.gia}|${input.catLo ?? ""}`
  useEffect(() => {
    const timer = setTimeout(() => setSettled(input), delayMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, delayMs])

  const hopLe = !!settled.symbol && settled.khoiLuong > 0 && settled.gia > 0

  return useQuery<KiemTraCap8>({
    queryKey: cap8Keys.kiemTra(
      settled.symbol,
      settled.khoiLuong,
      settled.gia,
      settled.catLo,
    ),
    queryFn: () => cap8Api.getKiemTra(settled),
    enabled: isAuthenticated && enabled && hopLe,
    staleTime: 30_000,
    retry: false,
  })
}

/**
 * POST /cap8/kehoach — records the bước Kiểm tra danh mục for a BUY fill.
 *
 * ★ The caller MUST treat a rejection as non-fatal. This runs after the order
 * has already filled, and the server legitimately 400s when the portfolio moved
 * between the pre-trade check and its own post-fill re-derivation. An error here
 * must never abort the shared order-filled event chain — if it did, no cấp's
 * Kết sổ would open at all.
 */
export function useRecordKehoachCap8() {
  const invalidate = useInvalidateCap8()
  return useMutation<OrderKehoachCap8, unknown, KehoachInputCap8>({
    mutationFn: cap8Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/** GET /cap8/thach-thuc — the 3 sub-conditions of nhiệm vụ ③ (§C12c). */
export function useThachThucCap8(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap8>({
    queryKey: cap8Keys.thachThuc(),
    queryFn: cap8Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/**
 * POST /cap8/graduate — closes the 0-8 arc (only when 3/3 nhiệm vụ done).
 * ★ There is no next level to enter after this one.
 */
export function useGraduateCap8() {
  const invalidate = useInvalidateCap8()
  return useMutation<Cap8Progress, unknown, void>({
    mutationFn: cap8Api.graduate,
    onSuccess: invalidate,
  })
}
