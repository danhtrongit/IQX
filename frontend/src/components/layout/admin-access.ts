export type AdminAccessState = "loading" | "session-error" | "unauthenticated" | "forbidden" | "authorized"

export function getAdminAccessState(auth: {
  isLoading: boolean
  sessionError: unknown
  user: { role?: string } | null | undefined
}): AdminAccessState {
  if (auth.isLoading) return "loading"
  if (auth.sessionError) return "session-error"
  if (!auth.user) return "unauthenticated"
  return auth.user.role === "admin" ? "authorized" : "forbidden"
}
