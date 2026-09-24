/**
 * React Query hooks cho khu quản trị giao dịch ảo.
 *
 * - Khoá truy vấn có tiền tố miền `["admin", "vt", …]` và **gắn người dùng hiện
 *   tại** (`user.id`) vì đây là dữ liệu riêng của từng tài khoản quản trị; đăng
 *   nhập/đăng xuất xoá sạch cache qua AuthProvider.
 * - Mọi thao tác ghi đều invalidate đúng nhánh dữ liệu mà backend thực sự đổi
 *   (ví dụ điều chỉnh tiền ⇒ tài khoản + danh sách + sổ cái, không đụng vị thế).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import {
  adjustCash,
  fetchAccount,
  fetchAccountStats,
  fetchConfig,
  freezeAccount,
  listAccounts,
  listLedger,
  listOrders,
  listPositions,
  listSettlements,
  listTrades,
  resetAccountForUser,
  resetAllAccounts,
  unfreezeAccount,
  updateConfig,
  type VtAccountFilters,
  type VtConfigPatch,
  type VtLedgerFilters,
  type VtOrderFilters,
  type VtSettlementFilters,
  type VtTradeFilters,
} from "./api"

export const vtKeys = {
  root: ["admin", "vt"] as const,
  accounts: (userId: string | undefined, filters: VtAccountFilters) =>
    [...vtKeys.root, "accounts", userId, filters] as const,
  account: (userId: string | undefined, accountId: string) => [...vtKeys.root, "account", userId, accountId] as const,
  stats: (userId: string | undefined, accountId: string) => [...vtKeys.root, "stats", userId, accountId] as const,
  positions: (userId: string | undefined, accountId: string) =>
    [...vtKeys.root, "positions", userId, accountId] as const,
  orders: (userId: string | undefined, accountId: string, filters: VtOrderFilters) =>
    [...vtKeys.root, "orders", userId, accountId, filters] as const,
  trades: (userId: string | undefined, accountId: string, filters: VtTradeFilters) =>
    [...vtKeys.root, "trades", userId, accountId, filters] as const,
  ledger: (userId: string | undefined, accountId: string, filters: VtLedgerFilters) =>
    [...vtKeys.root, "ledger", userId, accountId, filters] as const,
  settlements: (userId: string | undefined, accountId: string, filters: VtSettlementFilters) =>
    [...vtKeys.root, "settlements", userId, accountId, filters] as const,
  config: (userId: string | undefined) => [...vtKeys.root, "config", userId] as const,
}

/* ── Đọc ─────────────────────────────────────────────────────────────────── */

export function useVtAccounts(filters: VtAccountFilters) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.accounts(user?.id, filters),
    enabled: !!user,
    queryFn: ({ signal }) => listAccounts(filters, signal),
  })
}

export function useVtAccount(accountId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.account(user?.id, accountId),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => fetchAccount(accountId, signal),
  })
}

export function useVtAccountStats(accountId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.stats(user?.id, accountId),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => fetchAccountStats(accountId, signal),
  })
}

export function useVtPositions(accountId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.positions(user?.id, accountId),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => listPositions(accountId, signal),
  })
}

export function useVtOrders(accountId: string, filters: VtOrderFilters) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.orders(user?.id, accountId, filters),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => listOrders(accountId, filters, signal),
  })
}

export function useVtTrades(accountId: string, filters: VtTradeFilters) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.trades(user?.id, accountId, filters),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => listTrades(accountId, filters, signal),
  })
}

export function useVtLedger(accountId: string, filters: VtLedgerFilters) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.ledger(user?.id, accountId, filters),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => listLedger(accountId, filters, signal),
  })
}

export function useVtSettlements(accountId: string, filters: VtSettlementFilters) {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.settlements(user?.id, accountId, filters),
    enabled: !!user && !!accountId,
    queryFn: ({ signal }) => listSettlements(accountId, filters, signal),
  })
}

export function useVtConfig() {
  const { user } = useAuth()
  return useQuery({
    queryKey: vtKeys.config(user?.id),
    enabled: !!user,
    queryFn: ({ signal }) => fetchConfig(signal),
  })
}

/* ── Ghi ─────────────────────────────────────────────────────────────────── */

/**
 * Làm mới toàn bộ nhánh `["admin", "vt"]`. React Query chỉ refetch những truy vấn
 * đang có observer, nên quét cả nhánh vẫn rẻ mà không bỏ sót màn nào (ví dụ đặt
 * lại tài khoản đổi đồng thời vị thế, lệnh, sổ cái và thống kê).
 */
function useInvalidateVt() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: vtKeys.root })
}

export function useFreezeVtAccount(accountId: string) {
  const invalidate = useInvalidateVt()
  return useMutation({
    mutationFn: (reason: string) => freezeAccount(accountId, reason),
    onSuccess: invalidate,
  })
}

export function useUnfreezeVtAccount(accountId: string) {
  const invalidate = useInvalidateVt()
  return useMutation({
    mutationFn: (reason?: string) => unfreezeAccount(accountId, reason),
    onSuccess: invalidate,
  })
}

export function useAdjustVtCash(accountId: string) {
  const invalidate = useInvalidateVt()
  return useMutation({
    mutationFn: (input: { amountVnd: number; reason: string }) => adjustCash(accountId, input.amountVnd, input.reason),
    onSuccess: invalidate,
  })
}

export function useResetVtAccount() {
  const invalidate = useInvalidateVt()
  return useMutation({
    mutationFn: (userId: string) => resetAccountForUser(userId),
    onSuccess: invalidate,
  })
}


export function useResetAllVtAccounts() {
  const invalidate = useInvalidateVt()
  return useMutation({
    mutationFn: () => resetAllAccounts(),
    onSuccess: invalidate,
  })
}

export function useUpdateVtConfig() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: VtConfigPatch) => updateConfig(patch),
    onSuccess: () => void client.invalidateQueries({ queryKey: [...vtKeys.root, "config"] }),
  })
}
