/** Canvas giả ghi lại các lệnh gọi, vì jsdom không có Canvas 2D. Chỉ dùng trong test. */

export type Call = [name: string, ...args: unknown[]]

export type FakeContext = CanvasRenderingContext2D & { calls: Call[]; state: Record<string, unknown> }

/** Bề rộng chữ số khác nhau như Be Vietnam Pro (số 1 hẹp, số 4 rộng) để kiểm tra việc căn số. */
export const GLYPH_WIDTH: Record<string, number> = { "0": 7, "1": 4, "2": 7, "3": 7, "4": 8, "5": 7, "6": 7, "7": 6, "8": 7, "9": 7, ".": 3, ",": 3, " ": 3 }
export const widthOf = (text: string) => [...text].reduce((sum, glyph) => sum + (GLYPH_WIDTH[glyph] ?? 6), 0)

export function fakeContext(colorOf: (fillStyle: unknown) => [number, number, number, number] = () => [128, 128, 128, 255]): FakeContext {
  const calls: Call[] = []
  const state: Record<string, unknown> = {}
  return new Proxy({} as FakeContext, {
    get(_, key: string) {
      if (key === "calls") return calls
      if (key === "state") return state
      if (key === "measureText") return (text: string) => ({ width: widthOf(text) })
      if (key === "getImageData") return () => ({ data: colorOf(state.fillStyle) })
      if (key in state) return state[key]
      return (...args: unknown[]) => {
        calls.push([key, ...args])
      }
    },
    set(_, key: string, value) {
      state[key] = value
      calls.push([`set ${key}`, value])
      return true
    },
  })
}

export const named = (context: FakeContext, name: string) => context.calls.filter((call) => call[0] === name)
