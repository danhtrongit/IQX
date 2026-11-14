import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"

/** Phần cần cho cổng quản trị trong `GET /trading-floor/me`: tài khoản có đang là SACO không. */
export type FloorMeSacoFlag = { saco: { id: string; name?: string; active: boolean } | null }

export const sacoSelfKey = (userId: string | null | undefined) => ["trading-floor", userId ?? "guest", "me"] as const

/**
 * Hỏi máy chủ tài khoản đang đăng nhập có là SACO còn hoạt động không. Chỉ bật cho vai trò
 * không phải admin hay trưởng nhóm (họ đã có phạm vi riêng). Kết quả giữ lâu vì quyền SACO
 * hiếm khi đổi; máy chủ vẫn kiểm tra quyền ở mọi API.
 */
export function useSacoSelf(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: sacoSelfKey(user?.id),
    queryFn: ({ signal }) => api<FloorMeSacoFlag>("/trading-floor/me", { signal }),
    enabled: enabled && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
