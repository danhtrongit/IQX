import { useSyncExternalStore } from "react"

import type { Store } from "./bridge.ts"

/** Subscribes a component to a bridge store. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
