/**
 * Which tab of the «Thẻ nến» section is showing, shared by the main area and the panel. They are separate
 * trees under the workspace frame (no common parent in the shop folder), so the state lives in this small
 * external store. `showOwnedCandleCards()` is the panel's "Xem kho thẻ →": it switches to "Đã sở hữu" and bumps
 * `focusToken` so the section scrolls itself into view, even when that tab was already selected.
 */
import { useSyncExternalStore } from "react"

import type { CardsView } from "./candle-cards-model"

type Snapshot = { view: CardsView; focusToken: number }

const INITIAL: Snapshot = { view: "store", focusToken: 0 }
let snapshot: Snapshot = INITIAL
/** Last focus request the section has already scrolled to (a request made before it mounted still counts). */
let handledToken = 0
const listeners = new Set<() => void>()

function publish(next: Snapshot) {
  snapshot = next
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const readView = () => snapshot.view
const readToken = () => snapshot.focusToken

export function useCandleCardsView(): CardsView {
  return useSyncExternalStore(subscribe, readView, readView)
}

export function useCandleCardsFocusToken(): number {
  return useSyncExternalStore(subscribe, readToken, readToken)
}

export function setCandleCardsView(view: CardsView) {
  if (snapshot.view !== view) publish({ ...snapshot, view })
}

/** Opens the owned tab and asks the section to scroll into view. */
export function showOwnedCandleCards() {
  publish({ view: "owned", focusToken: snapshot.focusToken + 1 })
}

/**
 * Candle Dojo's "Mở Shop › Thẻ nến": the Shop is not mounted yet, so remember the request; the section scrolls
 * itself into view on mount and shows the store tab, where the cards of the learned lessons are bought.
 */
export function requestCandleCardsFromDojo() {
  publish({ view: "store", focusToken: snapshot.focusToken + 1 })
}

/** True when a focus request has not been handled yet; calling it marks the request handled. */
export function takeCandleCardsFocus(): boolean {
  if (handledToken === snapshot.focusToken) return false
  handledToken = snapshot.focusToken
  return true
}

/** Back to the first load state (tests). */
export function resetCandleCardsStore() {
  handledToken = 0
  publish(INITIAL)
}
