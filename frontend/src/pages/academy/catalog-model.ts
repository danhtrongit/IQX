import type { CatalogItem, CatalogResponse } from "./content-types"

/** Required lessons of the published chapters (spec v3.2); shown while the catalog is still loading. */
export const REQUIRED_TOTAL_FALLBACK = 43

/** Item id → catalog item, over the published chapters. */
export function catalogItems(catalog: CatalogResponse | undefined): ReadonlyMap<string, CatalogItem> {
  return new Map(catalog?.chapters.flatMap((chapter) => chapter.items.map((item) => [item.id, item] as const)) ?? [])
}
