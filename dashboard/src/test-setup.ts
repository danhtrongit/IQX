import "@testing-library/jest-dom"

// jsdom in this project's config does NOT provide localStorage; tests that use it
// (e.g. useInitialSymbol) need this guarded polyfill. Verified: removing it makes
// those tests error at setup. The guard means it only activates when truly absent.
if (typeof localStorage === "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: (() => {
      const store: Record<string, string> = {}
      return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = String(value)
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          for (const key of Object.keys(store)) delete store[key]
        },
      }
    })(),
    writable: true,
  })
}
