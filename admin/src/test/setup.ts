import { afterEach, vi } from "vitest"

if (!globalThis.localStorage) {
  const local = createStorage()
  Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true })
}

if (!globalThis.sessionStorage) {
  const session = createStorage()
  Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true })
}

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

function createStorage(): Storage {
  const state = new Map<string, string>()
  return {
    get length() {
      return state.size
    },
    clear: () => state.clear(),
    getItem: (key: string) => state.get(key) ?? null,
    key: (index: number) => Array.from(state.keys())[index] ?? null,
    removeItem: (key: string) => state.delete(key),
    setItem: (key: string, value: string) => state.set(key, String(value)),
  }
}
