export type BctcAi = { memo: string; modules: Record<string, string> }

export function moduleNote(ai: BctcAi | null | undefined, id: string): string {
  return ai?.modules?.[id] ?? ""
}

export function hasAnyAi(ai: BctcAi | null | undefined): boolean {
  if (!ai) return false
  return Boolean(ai.memo?.trim()) || Object.values(ai.modules ?? {}).some((n) => n?.trim())
}
