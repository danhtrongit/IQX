import "@testing-library/jest-dom"

// Ensure localStorage is available in jsdom
if (typeof localStorage === "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: (() => {
      const store: Record<string, string> = {}
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString()
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          Object.keys(store).forEach((key) => {
            delete store[key]
          })
        },
      }
    })(),
    writable: true,
  })
}
