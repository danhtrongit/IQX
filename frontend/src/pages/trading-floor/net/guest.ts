/**
 * Guest identity of the trading floor (update 15-11): visitors who are not signed in only pick a name
 * and a character. The server hands back a random token, kept here in localStorage and sent as the
 * `x-floor-guest` header (REST) or the `guest` field of the WebSocket `auth` message.
 */

const KEY = "iqx.floor.guest"

export const GUEST_HEADER = "x-floor-guest"

/** Used when localStorage is blocked, so the guest still keeps their character until the tab closes. */
let memoryToken: string | null = null

export function getGuestToken(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memoryToken
  } catch {
    return memoryToken
  }
}

export function setGuestToken(token: string | null): void {
  memoryToken = token
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: the guest lives for this tab only.
  }
}

/** Header bag with the guest token, empty when there is none. */
export function guestHeaders(): Record<string, string> {
  const token = getGuestToken()
  return token ? { [GUEST_HEADER]: token } : {}
}
