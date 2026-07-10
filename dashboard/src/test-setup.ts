import "@testing-library/jest-dom"

// jsdom in this project's config does NOT provide localStorage; tests that read or
// write it need this guarded polyfill. Verified: removing it makes those tests error
// at setup. The guard means it only activates when truly absent.
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

// jsdom does not implement Element.prototype.scrollTo (only a no-op stub exists on
// window). HomeWorkspace's tab-switch scroll-reset calls it on a content <div> ref;
// without this, clicking a tab in tests throws "scrollTo is not a function". Guarded
// so it only activates when truly absent.
if (typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function () {}
}
