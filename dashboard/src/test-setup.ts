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

// jsdom does not implement SVGElement.prototype.getBBox. `resize-observer-polyfill`
// (pulled in by Arco) calls it on any observed SVG; the throw happens inside the
// polyfill's async callback, so it surfaces as an UNHANDLED error rather than a test
// failure — vitest then warns "might cause false positive tests". Hit when
// TradingPanel.mockupConformance renders the whole panel. Guarded so it only
// activates when truly absent; returns zeros because no test asserts on geometry
// (jsdom has no layout engine, so real numbers are not obtainable anyway).
// ★ `getBBox` khai trên `SVGGraphicsElement` trong lib DOM của TS, nhưng jsdom
// dựng phần tử SVG là `SVGElement` trần — nên gắn lên `SVGElement.prototype`
// (mọi phần tử SVG kế thừa từ đó) và ép kiểu ở đúng một chỗ.
const svgProto = typeof SVGElement !== "undefined" ? SVGElement.prototype : undefined
if (svgProto && typeof (svgProto as Partial<SVGGraphicsElement>).getBBox !== "function") {
  ;(svgProto as Partial<SVGGraphicsElement>).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
}
