import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

// Worker của pdf.js phải cùng phiên bản với `pdfjs-dist` mà react-pdf dùng, nên
// đường dẫn lấy thẳng từ package thay vì CDN.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/** Bề rộng khung đọc (px) — luôn nằm trong khoảng đọc được của một trang A4. */
function clampWidth(width: number) {
  return Math.min(Math.max(width, 320), 1100)
}

/**
 * Trình đọc PDF của bài học: phân trang, thu/phóng, tải về.
 *
 * Bề rộng trang bám theo khung chứa (ResizeObserver) rồi nhân với hệ số thu
 * phóng, nên đổi cỡ cửa sổ không phải tải lại tài liệu.
 */
export function PdfViewer({ src, title }: { src: string; title?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  // Chỉ số trong `ZOOM_STEPS`; 2 = 100% (cỡ vừa khung).
  const [zoomIndex, setZoomIndex] = useState(2)
  const [baseWidth, setBaseWidth] = useState(860)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setBaseWidth(clampWidth(width - 32))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const zoom = ZOOM_STEPS[zoomIndex]

  if (loadError) {
    return (
      <PanelState
        title="Không thể tải file PDF"
        description={loadError}
        action={{ label: "Tải về máy", onClick: () => window.open(src, "_blank", "noopener") }}
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Trang trước"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="min-w-24 text-center text-xs text-muted-foreground tabular-nums">
            Trang {pageNumber} / {numPages || "…"}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Trang sau"
            disabled={numPages === 0 || pageNumber >= numPages}
            onClick={() => setPageNumber((page) => Math.min(numPages, page + 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Thu nhỏ"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center text-xs text-muted-foreground tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Phóng to"
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Về cỡ gốc"
            disabled={zoomIndex === 2}
            onClick={() => setZoomIndex(2)}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={src} download={title ? `${title}.pdf` : undefined}>
              <Download aria-hidden="true" />
              Tải PDF
            </a>
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="w-full min-w-0 pb-6">
        <ScrollArea orientation="horizontal" className="w-full" viewportClassName="pb-3">
          <div className="flex min-w-full w-max justify-center">
        <Document
          file={src}
          onLoadSuccess={({ numPages: total }) => {
            setNumPages(total)
            setLoadError(null)
          }}
          onLoadError={(error: Error) => setLoadError(error.message)}
          loading={<Skeleton className="h-[70vh] w-full" />}
          error={<span className="text-sm text-destructive">Không thể tải file PDF.</span>}
        >
          <Page
            pageNumber={pageNumber}
            width={Math.round(baseWidth * zoom)}
            renderAnnotationLayer
            renderTextLayer
            loading={<Skeleton className="h-[70vh] w-full" />}
          />
        </Document>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
