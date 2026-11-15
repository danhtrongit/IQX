/**
 * REST + React Query của thư viện Thần Tài (chỉ quản trị viên), dưới
 * `/api/v2/trading-floor/manage/than-tai`. Hợp đồng: `backend/docs/than-tai/CONTRACT.md`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, errorMessage } from "@/lib/api"
import type {
  AdminLa,
  AdminLaPatch,
  AdminQue,
  AdminQuePatch,
  Hanh,
  HanhConfig,
  HanhConfigPatch,
} from "@/pages/trading-floor/net/types"

const BASE = "/trading-floor/manage/than-tai"
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) })

export function fetchLaList(signal?: AbortSignal): Promise<{ items: AdminLa[] }> {
  return api<{ items: AdminLa[] }>(`${BASE}/la`, { signal })
}

export function saveLa(id: number, patch: AdminLaPatch): Promise<AdminLa> {
  return api<AdminLa>(`${BASE}/la/${id}`, put(patch))
}

export function saveQue(id: number, patch: AdminQuePatch): Promise<AdminQue> {
  return api<AdminQue>(`${BASE}/que/${id}`, put(patch))
}

export function fetchHanhList(signal?: AbortSignal): Promise<{ items: HanhConfig[] }> {
  return api<{ items: HanhConfig[] }>(`${BASE}/hanh`, { signal })
}

export function saveHanh(hanh: Hanh, patch: HanhConfigPatch): Promise<HanhConfig> {
  return api<HanhConfig>(`${BASE}/hanh/${hanh}`, put(patch))
}

export const thanTaiKeys = {
  all: ["admin", "than-tai"] as const,
  la: ["admin", "than-tai", "la"] as const,
  hanh: ["admin", "than-tai", "hanh"] as const,
}

export function useLaList() {
  return useQuery({
    queryKey: thanTaiKeys.la,
    queryFn: ({ signal }) => fetchLaList(signal),
    staleTime: 30_000,
  })
}

export function useHanhList() {
  return useQuery({
    queryKey: thanTaiKeys.hanh,
    queryFn: ({ signal }) => fetchHanhList(signal),
    staleTime: 30_000,
  })
}

/** Lưu một lá; cập nhật dòng đó trong danh sách ngay khi máy chủ trả về. */
export function useSaveLa() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AdminLaPatch }) => saveLa(id, patch),
    onSuccess: (row) => {
      client.setQueryData<{ items: AdminLa[] }>(thanTaiKeys.la, (old) =>
        old ? { items: old.items.map((item) => (item.id === row.id ? row : item)) } : old,
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}

/** Lưu phần chung của một quẻ: mọi lá của quẻ đó đổi theo. */
export function useSaveQue() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AdminQuePatch }) => saveQue(id, patch),
    onSuccess: (que) => {
      client.setQueryData<{ items: AdminLa[] }>(thanTaiKeys.la, (old) =>
        old
          ? {
              items: old.items.map((item) =>
                item.queId === que.id
                  ? {
                      ...item,
                      queTen: que.ten,
                      chuHan: que.chuHan,
                      tuong: que.tuong,
                      thoan: que.thoan,
                      thoanNghia: que.thoanNghia,
                    }
                  : item,
              ),
            }
          : old,
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}

export function useSaveHanh() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ hanh, patch }: { hanh: Hanh; patch: HanhConfigPatch }) => saveHanh(hanh, patch),
    onSuccess: (row) => {
      client.setQueryData<{ items: HanhConfig[] }>(thanTaiKeys.hanh, (old) =>
        old ? { items: old.items.map((item) => (item.hanh === row.hanh ? row : item)) } : old,
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}
