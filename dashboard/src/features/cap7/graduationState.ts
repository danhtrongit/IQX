import type { Cap7Progress } from "./types"

export function isGraduationReadyCap7(progress: Cap7Progress | null | undefined): boolean {
  return progress?.can_doi_ok === true && progress.graduated_at == null
}
