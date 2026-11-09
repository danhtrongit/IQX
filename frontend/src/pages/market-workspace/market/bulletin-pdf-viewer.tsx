import { useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

import { PanelState } from "@/components/layout/panel-state"
import { cn } from "@/lib/utils"

// Worker pdf.js phải cùng phiên bản với `pdfjs-dist` mà react-pdf dùng nên lấy thẳng từ package.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Bề rộng tối đa của một trang theo thiết bị: bản máy tính khổ ngang, bản điện thoại khổ dọc hẹp. */
const MAX_WIDTH: Record<"desktop" | "mobile", number> = { desktop: 1180, mobile: 520 }

export type BulletinPdfViewerProps = {
  src: string
  variant: "desktop" | "mobile"
  pageCount: number
  /** Kích thước trang (px) từ API; dùng để dựng khung xám đúng tỉ lệ trước khi trang vẽ xong. */
  pageWidth: number
  pageHeight: number
}

/**
 * Khung cuộn gần nhất của trang. IntersectionObserver chỉ nới `rootMargin` cho gốc của nó, còn phần
 * bị cắt bởi khung cuộn con (như vùng nội dung của Demo Trading) thì không, nên phải lấy chính khung
 * đó làm gốc thì trang kế tiếp mới được vẽ trước khi cuộn tới.
 */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let element = node.parentElement; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element)
    if (overflowY === "auto" || overflowY === "scroll") return element
  }
  return null
}

/** Trang nào lại gần khung nhìn (trong `rootMargin`) thì mới vẽ; đã vẽ rồi thì giữ nguyên. */
function useNearViewport<T extends HTMLElement>(rootMargin = "700px 0px") {
  const ref = useRef<T>(null)
  // Không có IntersectionObserver (môi trường cũ, kiểm thử) thì vẽ luôn.
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined")
  useEffect(() => {
    const node = ref.current
    if (!node || near) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { root: scrollParent(node), rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [near, rootMargin])
  return [ref, near] as const
}

function PageFrame({ width, ratio, children, label }: { width: number; ratio: number; children?: React.ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="mx-auto overflow-hidden border border-border bg-muted"
      style={{ width, height: Math.round(width * ratio) }}
    >
      {children}
    </div>
  )
}

function LazyPage({ pageNumber, width, ratio, total }: { pageNumber: number; width: number; ratio: number; total: number }) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const label = `Trang ${pageNumber} / ${total} của bản tin`
  return (
    <div ref={ref} data-bulletin-page={pageNumber}>
      {near ? (
        <div className="mx-auto border border-border bg-card" style={{ width, minHeight: Math.round(width * ratio) }}>
          <Page
            pageNumber={pageNumber}
            width={width}
            renderTextLayer
            renderAnnotationLayer
            loading={<PageFrame width={width - 2} ratio={ratio} label={`${label}, đang tải`} />}
          />
        </div>
      ) : (
        <PageFrame width={width} ratio={ratio} label={`${label}, chưa tải`} />
      )}
    </div>
  )
}

/**
 * Trình đọc PDF của bản tin cuối phiên (PDF.js): vẽ trang khi lại gần khung nhìn, có lớp chữ để
 * bôi đen, sao chép và lớp liên kết cho các mã mở demo-trading. Bề rộng bám theo khung chứa nên
 * đổi cỡ cửa sổ không phải tải lại file.
 */
export function BulletinPdfViewer({ src, variant, pageCount, pageWidth, pageHeight }: BulletinPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [failure, setFailure] = useState<{ src: string; attempt: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Lỗi tải chỉ áp dụng cho đúng file và lần thử đã hỏng: đổi file hoặc Thử lại thì hết lỗi.
  const loadError = failure !== null && failure.src === src && failure.attempt === attempt

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    setContainerWidth(Math.floor(node.getBoundingClientRect().width))
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(Math.floor(width))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const width = Math.max(240, Math.min(containerWidth || MAX_WIDTH[variant], MAX_WIDTH[variant]))
  const ratio = pageWidth > 0 ? pageHeight / pageWidth : 1.414
  const pages = useMemo(() => Array.from({ length: Math.max(1, pageCount) }, (_, index) => index + 1), [pageCount])

  if (loadError) {
    return (
      <PanelState
        title="Không thể tải bản tin"
        description="Bạn vẫn có thể bấm Tải PDF để xem file."
        action={{ label: "Thử lại", onClick: () => setAttempt((value) => value + 1) }}
      />
    )
  }

  return (
    // `contain: inline-size`: bề rộng của khung không phụ thuộc vào các trang bên trong. Thiếu dòng này,
    // vùng cuộn của Demo Trading (co theo nội dung) bị trang 1180 px kéo rộng ra rồi đo lại đúng số đó.
    <div ref={containerRef} className={cn("w-full min-w-0 space-y-3 [contain:inline-size]")} data-tour-id="tour-bantin-pdf" data-variant={variant}>
      <Document
        key={`${src}#${attempt}`}
        file={src}
        externalLinkTarget="_blank"
        externalLinkRel="noopener noreferrer"
        onLoadError={() => setFailure({ src, attempt })}
        loading={
          <div className="space-y-3">
            {pages.map((page) => (
              <PageFrame key={page} width={width} ratio={ratio} label={`Trang ${page} / ${pages.length} của bản tin, đang tải`} />
            ))}
          </div>
        }
        error={<span className="text-sm text-destructive">Không thể tải bản tin.</span>}
        className="space-y-3"
      >
        {pages.map((page) => (
          <LazyPage key={page} pageNumber={page} width={width} ratio={ratio} total={pages.length} />
        ))}
      </Document>
    </div>
  )
}
