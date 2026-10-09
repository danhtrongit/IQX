/** Display name of the buy source (the universe) a position was opened from or a session ran with. */
export function sourceText(kind: string | null | undefined, name: string | null | undefined, revision?: number | null): string {
  if (kind === "vn30") return "VN30"
  if (kind === "custom") {
    const title = name?.trim() || "Danh mục riêng"
    return revision ? `${title} · bản ${revision}` : title
  }
  return "—"
}

/** The `entry_source_snapshot` the server froze when a position was opened; `null` for legacy lots. */
export function snapshotSourceText(snapshot: Readonly<Record<string, unknown>> | null | undefined): string {
  if (!snapshot) return "—"
  const kind = typeof snapshot.kind === "string" ? snapshot.kind : null
  const name = typeof snapshot.name === "string" ? snapshot.name : null
  const revision = typeof snapshot.revision === "number" ? snapshot.revision : null
  return sourceText(kind, name, revision)
}
