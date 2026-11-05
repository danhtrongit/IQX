/**
 * Chế độ `static` của IQLine cho Học viện (docs/iqline-design.md §13). Vẽ số liệu tính sẵn của `StaticPanel` lên
 * Canvas, không chạy công thức chỉ báo, không zoom, không kéo, không vẽ. Chỉ có crosshair (con trỏ và phím mũi tên)
 * và chú giải. Chữ trên biểu đồ do Canvas vẽ; chú giải, chú giải nổi và câu đọc cho trình đọc màn hình nằm ở DOM.
 *
 * Mọi tính toán hình học nằm ở `scene/static.ts`; component này chỉ đo chiều rộng, đo chữ bằng `ctx.measureText`,
 * giữ vị trí crosshair và gọi `render/`. Cảnh tĩnh nằm ở lớp `base`, crosshair ở lớp `top`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { createCanvasStack, resolveDpr, type CanvasStack } from "../render/canvas-stack"
import { DEFAULT_FONT_FAMILY, ensureFonts } from "../render/text"
import { estimateText, type MeasureText } from "../labels/text"
import {
  buildStaticCrosshair,
  buildStaticScene,
  formatStaticValue,
  layoutStatic,
  staticLegend,
  staticReadoutText,
  type StaticPriceLevels,
} from "../scene/static"
import type { StaticPanel } from "../static-types"
import type { ColorToken, Scene } from "../types"

/** Bề rộng dùng trước lần đo đầu tiên và khi khung chưa có bố cục (thẻ `<details>` đóng, jsdom). */
export const STATIC_FALLBACK_WIDTH = 580
export const STATIC_MIN_WIDTH = 230

export type IQLineStaticProps = {
  /** Các ô của một biểu đồ; dùng chung `frame` của ô đầu tiên. */
  panels: readonly StaticPanel[]
  theme: "light" | "dark"
  /** Có để khớp `StaticProps` của hợp đồng và không có tác dụng: chế độ `static` luôn dùng `academy-label` cho chữ trung tính. */
  labelToken?: ColorToken
  priceLevels?: StaticPriceLevels
  /** Hiện chú giải DOM khi có hơn một dòng. Mặc định có; tắt khi khối bài đã mang chú giải riêng. */
  legend?: boolean
  /** Mô tả cho trình đọc màn hình; mặc định lấy `frame.alt`. */
  ariaLabel?: string
  className?: string
}

/** Màu token sang biến CSS cho các ô chú giải và chú giải nổi của DOM (cùng nguồn với `readPalette`). */
const cssVar = (token: ColorToken) => `var(--${token})`

/** Bộ đo chữ bằng `ctx.measureText`; nhớ kết quả theo (font, chữ). Không có Canvas thì dùng ước lượng. */
function probeContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null
  try {
    return document.createElement("canvas").getContext("2d")
  } catch {
    return null
  }
}

function createMeasure(family: string): MeasureText {
  const ctx = probeContext()
  if (!ctx || typeof ctx.measureText !== "function") return estimateText
  const cache = new Map<string, number>()
  return (text, size, weight = 400) => {
    const key = `${weight}|${size}|${text}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    ctx.font = `${weight} ${size}px ${family}`
    const width = ctx.measureText(text).width
    cache.set(key, width)
    return width
  }
}

export function IQLineStatic({ panels, theme, priceLevels, legend = true, ariaLabel, className }: IQLineStaticProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<CanvasStack | null>(null)
  const hintId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-hint`
  const [width, setWidth] = useState(STATIC_FALLBACK_WIDTH)
  const [dpr, setDpr] = useState(() => resolveDpr(undefined))
  const [cursor, setCursor] = useState<number | null>(null)
  // Đổi khi font tải xong: số đo cũ rơi vào font dự phòng nên phải đo và dựng lại.
  const [fontEpoch, setFontEpoch] = useState(0)

  const measureText = useMemo(() => {
    void fontEpoch
    return createMeasure(DEFAULT_FONT_FAMILY)
  }, [fontEpoch])
  const options = useMemo(() => ({ measureText, priceLevels }), [measureText, priceLevels])
  const layout = useMemo(() => layoutStatic(panels, { width }, options), [panels, width, options])
  const scene = useMemo<Scene>(() => buildStaticScene(panels, { width, dpr }, options), [panels, width, dpr, options])
  const index = cursor !== null && cursor < layout.count ? cursor : null
  const crosshair = useMemo(() => (index === null ? null : buildStaticCrosshair(panels, { width, dpr }, options, index)), [panels, width, dpr, options, index])
  const entries = useMemo(() => staticLegend(panels), [panels])
  const thumbnail = layout.thumbnail

  // Trạng thái mới nhất cho hàm dựng lớp và trình xử lý sự kiện, để chúng không phải đăng ký lại.
  const liveRef = useRef({ scene, top: null as Scene | null, layout })
  useEffect(() => {
    liveRef.current = { scene, top: crosshair?.scene ?? null, layout }
  })

  // ---- bốn lớp canvas, tạo một lần.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const stack = createCanvasStack(host, {
      build: (layer) => (layer === "base" ? liveRef.current.scene : layer === "top" ? liveRef.current.top : null),
    })
    stackRef.current = stack
    return () => {
      stack.destroy()
      stackRef.current = null
    }
  }, [])

  // ---- đo chiều rộng của khung chứa; khung chưa có bố cục (rộng 0) thì giữ bề rộng cũ.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const measure = () => {
      const measured = Math.round(root.clientWidth)
      if (measured > 0) setWidth(Math.max(STATIC_MIN_WIDTH, measured))
      setDpr(resolveDpr(undefined))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // ---- font tải xong thì đo lại chữ.
  useEffect(() => {
    let alive = true
    const bump = () => {
      if (alive) setFontEpoch((epoch) => epoch + 1)
    }
    void ensureFonts(DEFAULT_FONT_FAMILY).then(bump)
    document.fonts?.addEventListener?.("loadingdone", bump)
    return () => {
      alive = false
      document.fonts?.removeEventListener?.("loadingdone", bump)
    }
  }, [])

  useEffect(() => {
    stackRef.current?.resize(width, layout.height, dpr)
  }, [width, layout.height, dpr])
  useEffect(() => {
    stackRef.current?.invalidate("base")
  }, [scene])
  useEffect(() => {
    stackRef.current?.invalidate("top")
  }, [crosshair])
  useEffect(() => {
    stackRef.current?.refreshPalette()
  }, [theme])

  // ---- con trỏ: chỉ đọc, không kéo. Trình xử lý đọc bố cục mới nhất qua ref.
  useEffect(() => {
    const stack = stackRef.current
    if (!stack) return undefined
    const canvas = stack.interactive
    if (thumbnail) {
      canvas.style.pointerEvents = "none"
      return undefined
    }
    canvas.style.pointerEvents = ""
    canvas.style.cursor = "crosshair"
    const onMove = (event: PointerEvent) => {
      const current = liveRef.current.layout
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0) return
      // Bố cục theo CSS pixel của biểu đồ; khung có thể đang co theo CSS nên quy đổi theo tỷ lệ.
      const x = ((event.clientX - rect.left) * current.width) / rect.width
      const y = event.clientY - rect.top
      if (x < current.plot.left || x > current.plot.right || y < current.plot.top || y > current.plot.bottom) return
      setCursor(current.indexOfX(x))
    }
    const onLeave = () => setCursor(null)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerleave", onLeave)
    return () => {
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
    }
  }, [thumbnail])

  const moveTo = useCallback(
    (next: number) => setCursor(Math.max(0, Math.min(layout.count - 1, next))),
    [layout.count],
  )
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") return setCursor(null)
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") moveTo(0)
    else if (event.key === "End") moveTo(layout.count - 1)
    else moveTo((index ?? (event.key === "ArrowRight" ? -1 : layout.count)) + (event.key === "ArrowRight" ? 1 : -1))
  }

  const label = ariaLabel ?? layout.frame.alt
  const readoutText = index === null ? "" : staticReadoutText(panels, index)
  const readout = crosshair?.readout ?? []
  const tooltipStyle =
    crosshair && index !== null
      ? layout.tooltipSide(index) === "left"
        ? { right: Math.max(3, layout.width - crosshair.x + 12) }
        : { left: Math.min(Math.max(0, layout.width - 160), crosshair.x + 12) }
      : undefined

  return (
    <div ref={rootRef} data-iqline-mode="static" className={["relative w-full min-w-0 space-y-2", className].filter(Boolean).join(" ")}>
      {legend && entries.length > 1 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-academy-label" aria-label="Chú giải">
          {entries.map((entry, entryIndex) => (
            <li key={`${entry.label}-${entryIndex}`} className="inline-flex items-center gap-1.5">
              {entry.shape === "line" ? (
                <svg width="20" height="8" aria-hidden="true" className="shrink-0">
                  <line x1="0" x2="20" y1="4" y2="4" strokeWidth="2" strokeDasharray={entry.dash ? "5 4" : undefined} stroke={cssVar(entry.token)} />
                </svg>
              ) : (
                <span aria-hidden="true" className="size-2 shrink-0 rounded-[1px]" style={{ background: cssVar(entry.token) }} />
              )}
              {entry.label}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <div
          ref={hostRef}
          role="img"
          aria-label={label}
          {...(thumbnail ? {} : { tabIndex: 0, "aria-describedby": hintId, onKeyDown, onBlur: () => setCursor(null) })}
          className="block w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{ position: "relative", width: "100%", height: layout.height }}
        />
        {!thumbnail && (
          <p id={hintId} className="sr-only">
            Dữ liệu minh họa. Dùng phím mũi tên trái, phải, Home và End hoặc trỏ vào hình để đọc các giá trị.
          </p>
        )}
        {crosshair && tooltipStyle && (
          <div
            aria-hidden="true"
            data-iqline-tooltip=""
            className="pointer-events-none absolute top-6 z-10 min-w-36 rounded-sm border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={tooltipStyle}
          >
            <b className="mb-1 block">{crosshair.label}</b>
            {readout.map((row, rowIndex) => (
              <div key={`${row.name}-${rowIndex}`} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <strong className="tabular-nums">{formatStaticValue(row.value, row.digits)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      {!thumbnail && (
        <p role="status" aria-live="polite" className="sr-only">
          {readoutText}
        </p>
      )}
    </div>
  )
}
