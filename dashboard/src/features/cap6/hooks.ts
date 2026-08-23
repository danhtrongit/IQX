import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { cap6Api } from "./api"
import { cap6Keys } from "./keys"
import type {
  KehoachMauThuanInput,
  MauThuanCap6,
  PhanTichCap6,
  SkipCap6Input,
} from "./mauThuanTypes"
import type {
  Cap6Progress,
  GoiYCap6,
  KehoachDetailCap6,
  KehoachInputCap6,
  OrderKehoachCap6,
  ThachThucCap6,
} from "./types"

/**
 * Current user's Cấp 6 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (mirrors `cap5/hooks.ts`). `data` is `null` when the
 * user hasn't entered Cấp 6 yet. `enabled` lets callers outside the Cấp 6 shell
 * pass their own `isCap6Active` so this never fires elsewhere.
 */
export function useCap6Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap6Progress | null>({
    queryKey: cap6Keys.progress(),
    queryFn: cap6Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 6 query — used by every mutation. */
function useInvalidateCap6() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap6Keys.all })
}

/** POST /cap6/enter — enter Cấp 6 (idempotent; requires Cấp 5 graduated). */
export function useEnterCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, void>({
    mutationFn: cap6Api.enter,
    onSuccess: invalidate,
  })
}

/** PATCH /cap6/task — idempotent recompute of the 3 nhiệm vụ. */
export function useCompleteCap6Task() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, number>({
    mutationFn: (taskNo) => cap6Api.markTask(taskNo),
    onSuccess: invalidate,
  })
}

/**
 * GET /cap6/goi-y?symbol= — the kiểu cổ phiếu + its trọng số gợi ý + the "vì
 * sao" (spec §4/§5). `enabled` is how `DoiChieuBlock` avoids requesting a
 * suggestion for a symbol whose lớp do NOT conflict (no bước Đối chiếu → no
 * request). `retry: false` so the 404 "chưa vào Cấp 6" surfaces immediately and
 * the block can degrade instead of hanging.
 */
export function useGoiYCap6(symbol: string | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<GoiYCap6>({
    queryKey: cap6Keys.goiY(symbol ?? "none"),
    queryFn: () => cap6Api.getGoiY(symbol as string),
    enabled: isAuthenticated && enabled && !!symbol,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap6/kehoach — records the bước Đối chiếu for a BUY fill. */
export function useRecordKehoachCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<OrderKehoachCap6, unknown, KehoachInputCap6>({
    mutationFn: cap6Api.recordKehoach,
    onSuccess: invalidate,
  })
}

/**
 * GET /cap6/kehoach/{order_id} — the Đối chiếu block RECORDED on one order, for
 * the Kết sổ to show real khớp/lệch instead of "chưa phân loại".
 *
 * ★ `enabled` is NOT optional in practice: the endpoint **404s for a user
 * without a Cấp 6 progress row**, so callers must pass their own `isCap6Active`.
 * `retry: false` so that 404 (and any other failure) surfaces at once and the
 * caller can fall back to what it already had — the Kết sổ modal is
 * `closable={false}`, so it must never depend on this call succeeding.
 */
export function useKehoachCap6(orderId: string | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<KehoachDetailCap6>({
    queryKey: cap6Keys.kehoach(orderId ?? "none"),
    queryFn: () => cap6Api.getKehoach(orderId as string),
    enabled: isAuthenticated && enabled && !!orderId,
    staleTime: 0,
    retry: false,
  })
}

/** GET /cap6/thach-thuc — the 3 sub-conditions of nhiệm vụ ③ (§C12c). */
export function useThachThucCap6(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<ThachThucCap6>({
    queryKey: cap6Keys.thachThuc(),
    queryFn: cap6Api.getThachThuc,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap6/graduate — graduate to Cấp 7 (only when 3/3 nhiệm vụ done). */
export function useGraduateCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, void>({
    mutationFn: cap6Api.graduate,
    onSuccess: invalidate,
  })
}

// ── CẤP 6 «BẬC THẦY» (spec đợt 7) ───────────────────────────────────────────

/**
 * `GET /cap6/mau-thuan/{symbol}` — bức tranh 5 lớp chia phe của một mã (spec §5).
 *
 * `retry: false` để 404 "chưa vào Cấp 6" nổi lên ngay và khối tự degrade thay vì
 * treo. `enabled` cho caller ngoài shell Cấp 6 truyền `isCap6Active` của mình.
 */
export function useMauThuanCap6(symbol: string | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<MauThuanCap6>({
    queryKey: cap6Keys.mauThuan(symbol ?? "none"),
    queryFn: () => cap6Api.getMauThuan(symbol as string),
    enabled: isAuthenticated && enabled && !!symbol,
    staleTime: 0,
    retry: false,
  })
}

/**
 * `POST /cap6/kehoach {order_id, conflict_level}` — ghi mức nhận định của một
 * lệnh mua đã khớp (spec §6).
 *
 * ★★ Caller BẮT BUỘC bọc `ghiKehoachKhongChiMang`: mọi `POST /capN/kehoach` chạy
 * SAU khi lệnh khớp, nên một exception thoát ra sẽ nuốt cả chuỗi `onOrderFilled`
 * và KHÔNG cấp nào mở được Kết sổ.
 */
export function useRecordKehoachMauThuanCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<unknown, unknown, KehoachMauThuanInput>({
    mutationFn: cap6Api.recordKehoachMauThuan,
    onSuccess: invalidate,
  })
}

/** `POST /cap6/skip` — ghi nhận "Không mua lần này" (spec §7). */
export function useSkipCap6() {
  const invalidate = useInvalidateCap6()
  return useMutation<unknown, unknown, SkipCap6Input>({
    mutationFn: cap6Api.skip,
    onSuccess: invalidate,
  })
}

/** `GET /cap6/phan-tich` — khối ⑭ + ⑮ của Phân tích danh mục (spec §9). */
export function usePhanTichCap6(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<PhanTichCap6>({
    queryKey: cap6Keys.phanTich(),
    queryFn: cap6Api.getPhanTich,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** `POST /cap6/tour-mauthuan` — chỉ gọi khi user ĐI HẾT tour (không phải "Bỏ qua"). */
export function useMarkTourMauThuan() {
  const invalidate = useInvalidateCap6()
  return useMutation<Cap6Progress, unknown, void>({
    mutationFn: cap6Api.markTourMauThuan,
    onSuccess: invalidate,
  })
}
