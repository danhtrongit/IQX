/**
 * React Query của Quản lý SACO (`["admin", userId, "saco", …]`) và Bài của tôi
 * (`["saco", userId, "posts", …]`). Mọi thao tác ghi làm mới phần bị ảnh hưởng; không cập
 * nhật lạc quan cho thao tác quản trị.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { manageApi, myPostsApi, type AssignSacoInput } from "./api"

const manageRoot = (userId: string | null | undefined) => ["admin", userId ?? "guest", "saco"] as const
const myRoot = (userId: string | null | undefined) => ["saco", userId ?? "guest", "posts"] as const

export const sacoKeys = {
  manage: manageRoot,
  sacos: (userId: string | null | undefined) => [...manageRoot(userId), "sacos"] as const,
  candidates: (userId: string | null | undefined, q: string) => [...manageRoot(userId), "candidates", q] as const,
  invites: (userId: string | null | undefined) => [...manageRoot(userId), "invites"] as const,
  convs: (userId: string | null | undefined) => [...manageRoot(userId), "convs"] as const,
  conv: (userId: string | null | undefined, convId: string) => [...manageRoot(userId), "convs", convId] as const,
  posts: (userId: string | null | undefined) => [...manageRoot(userId), "posts"] as const,
  post: (userId: string | null | undefined, postId: string) => [...manageRoot(userId), "posts", postId] as const,
  reports: (userId: string | null | undefined) => [...manageRoot(userId), "comment-reports"] as const,
  my: myRoot,
  myList: (userId: string | null | undefined) => [...myRoot(userId), "list"] as const,
  myPost: (userId: string | null | undefined, postId: string) => [...myRoot(userId), "detail", postId] as const,
  myReports: (userId: string | null | undefined) => [...myRoot(userId), "comment-reports"] as const,
}

function useUserId() {
  return useAuth().user?.id
}

// ---------- Quản lý SACO ----------

export function useManageSacos() {
  const userId = useUserId()
  return useQuery({ queryKey: sacoKeys.sacos(userId), enabled: !!userId, queryFn: ({ signal }) => manageApi.sacos(signal) })
}

export function useSacoCandidates(q: string, enabled: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: sacoKeys.candidates(userId, q),
    enabled: !!userId && enabled,
    queryFn: ({ signal }) => manageApi.candidates(q, signal),
    staleTime: 15_000,
  })
}

export function useInviteLog() {
  const userId = useUserId()
  return useQuery({ queryKey: sacoKeys.invites(userId), enabled: !!userId, queryFn: ({ signal }) => manageApi.invites(200, signal) })
}

export function useManageConvs() {
  const userId = useUserId()
  return useQuery({ queryKey: sacoKeys.convs(userId), enabled: !!userId, queryFn: ({ signal }) => manageApi.convs(signal) })
}

export function useManageConv(convId: string | null) {
  const userId = useUserId()
  return useQuery({
    queryKey: sacoKeys.conv(userId, convId ?? ""),
    enabled: !!userId && !!convId,
    queryFn: ({ signal }) => manageApi.conv(convId ?? "", signal),
  })
}

export function useManagePosts() {
  const userId = useUserId()
  return useQuery({ queryKey: sacoKeys.posts(userId), enabled: !!userId, queryFn: ({ signal }) => manageApi.posts(signal) })
}

export function useManagePost(postId: string | null) {
  const userId = useUserId()
  return useQuery({
    queryKey: sacoKeys.post(userId, postId ?? ""),
    enabled: !!userId && !!postId,
    queryFn: ({ signal }) => manageApi.post(postId ?? "", signal),
  })
}

export function useCommentReports() {
  const userId = useUserId()
  return useQuery({ queryKey: sacoKeys.reports(userId), enabled: !!userId, queryFn: ({ signal }) => manageApi.commentReports(signal) })
}

/** Mọi thao tác quản lý SACO làm mới cả nhánh `["admin", userId, "saco"]`. */
function useManageMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const userId = useUserId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sacoKeys.manage(userId) }),
  })
}

export const useAssignSaco = () => useManageMutation((input: AssignSacoInput) => manageApi.assign(input))
export const useUpdateSaco = () =>
  useManageMutation(({ sacoId, ...input }: { sacoId: string; displayName?: string; leadUserId?: string }) => manageApi.update(sacoId, input))
export const useMoveSaco = () => useManageMutation(({ sacoId, dir }: { sacoId: string; dir: "up" | "down" }) => manageApi.move(sacoId, dir))
export const useRemoveSaco = () => useManageMutation((sacoId: string) => manageApi.remove(sacoId))
export const useHidePost = () => useManageMutation((postId: string) => manageApi.hidePost(postId))
export const useUnhidePost = () => useManageMutation((postId: string) => manageApi.unhidePost(postId))
export const useHideReportedComment = () => useManageMutation((commentId: string) => manageApi.hideComment(commentId))

// ---------- Bài của tôi ----------

export function useMyPosts() {
  const userId = useUserId()
  return useQuery({ queryKey: sacoKeys.myList(userId), enabled: !!userId, queryFn: ({ signal }) => myPostsApi.list(signal) })
}

export function useMyPost(postId: string | null) {
  const userId = useUserId()
  return useQuery({
    queryKey: sacoKeys.myPost(userId, postId ?? ""),
    enabled: !!userId && !!postId,
    queryFn: ({ signal }) => myPostsApi.get(postId ?? "", signal),
    // Trình soạn tự giữ bản đang sửa: không tải lại ngầm đè lên chữ đang gõ.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
}

export function useMyCommentReports(enabled: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: sacoKeys.myReports(userId),
    enabled: !!userId && enabled,
    queryFn: ({ signal }) => myPostsApi.commentReports(signal),
  })
}

export function useInvalidateMyPosts() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: sacoKeys.my(userId) })
}

export function useCreateDraft() {
  const invalidate = useInvalidateMyPosts()
  return useMutation({ mutationFn: () => myPostsApi.create(), onSettled: invalidate })
}

export function useDeleteDraft() {
  const invalidate = useInvalidateMyPosts()
  return useMutation({ mutationFn: (postId: string) => myPostsApi.remove(postId), onSettled: invalidate })
}
