const RESET_PHRASE = "ĐẶT LẠI"

export function isResetConfirmation(value: string): boolean {
  return value.trim().toUpperCase() === RESET_PHRASE
}
