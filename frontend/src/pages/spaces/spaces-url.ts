/**
 * Canonical single-route URL helpers for Khu giao dịch & Khu Văn phòng.
 * Both spaces share `/khu-giao-dich`; `?phong=van-phong` selects the Office workspace.
 */

export const SPACES_PATH = "/khu-giao-dich"
export const LEGACY_OFFICE_PATH = "/van-phong"
export const LEGACY_VIRTUAL_OFFICE_PATH = "/van-phong-ao"

export const SPACE_ROOM_PARAM = "phong"
export const OFFICE_ROOM_VALUE = "van-phong"

export type SpaceRoom = "floor" | "office"

/** Resolves the active room from a URL search string or URLSearchParams. */
export function resolveSpaceRoom(
  search: string | URLSearchParams
): SpaceRoom {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search
  return params.get(SPACE_ROOM_PARAM) === OFFICE_ROOM_VALUE
    ? "office"
    : "floor"
}

/**
 * Builds the canonical `/khu-giao-dich` URL for `room`.
 * - `"floor"`: removes `phong` and `modal` (office-only modal param).
 * - `"office"`: puts `phong=van-phong` first, preserving all other query params.
 */
export function buildSpaceUrl(
  room: SpaceRoom,
  existingSearch?: string | URLSearchParams,
  hash = ""
): string {
  const incoming = existingSearch
    ? typeof existingSearch === "string"
      ? new URLSearchParams(existingSearch)
      : new URLSearchParams(existingSearch.toString())
    : new URLSearchParams()

  const next = new URLSearchParams()
  if (room === "office") {
    next.set(SPACE_ROOM_PARAM, OFFICE_ROOM_VALUE)
  }

  for (const [key, value] of incoming.entries()) {
    if (key === SPACE_ROOM_PARAM) continue
    if (room === "floor" && key === "modal") continue
    next.append(key, value)
  }

  const query = next.toString()
  return `${SPACES_PATH}${query ? `?${query}` : ""}${hash}`
}

/** Builds the canonical redirect URL for legacy `/van-phong?...` links, preserving all query params & hash. */
export function redirectLegacyOfficeUrl(search = "", hash = ""): string {
  return buildSpaceUrl("office", search, hash)
}

/** Builds the canonical redirect URL for legacy `/van-phong-ao?...` links, preserving all query params & hash. */
export function redirectLegacyVirtualOfficeUrl(
  search = "",
  hash = ""
): string {
  const params = new URLSearchParams(search)
  const query = params.toString()
  return `${SPACES_PATH}${query ? `?${query}` : ""}${hash}`
}

/**
 * Rewrites legacy `/van-phong` or `/van-phong-ao` notification/internal links directly
 * to the canonical `/khu-giao-dich` URL while leaving every other link untouched.
 */
export function normalizeSpaceLink(rawLink: string): string {
  const trimmed = rawLink.trim()
  if (!trimmed) return ""

  // Preserve external URLs untouched
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed

  const hashIdx = trimmed.indexOf("#")
  const beforeHash = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx) : ""

  const queryIdx = beforeHash.indexOf("?")
  const pathname = queryIdx >= 0 ? beforeHash.slice(0, queryIdx) : beforeHash
  const search = queryIdx >= 0 ? beforeHash.slice(queryIdx) : ""

  if (pathname === LEGACY_OFFICE_PATH || pathname === `${LEGACY_OFFICE_PATH}/`) {
    return redirectLegacyOfficeUrl(search, hash)
  }
  if (
    pathname === LEGACY_VIRTUAL_OFFICE_PATH ||
    pathname === `${LEGACY_VIRTUAL_OFFICE_PATH}/`
  ) {
    return redirectLegacyVirtualOfficeUrl(search, hash)
  }
  return trimmed
}
