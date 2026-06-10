import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { Button, Space, Spin } from "@arco-design/web-react"

// Set up pdf.js worker via CDN (Vite import.meta.url approach can be fragile with bundlers)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  src: string
}

export function PdfViewer({ src }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)

  const pageWidth =
    typeof window !== "undefined" ? Math.min(window.innerWidth - 40, 900) : 860

  if (error) {
    return (
      <div
        className="flex items-center justify-center p-8 text-sm"
        style={{ color: "rgb(var(--danger-6))" }}
      >
        Không thể tải file PDF. {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Navigation bar */}
      <div
        className="flex items-center justify-center gap-2 sticky top-0 z-10 py-2 border-b w-full"
        style={{ background: "var(--color-bg-1)", borderColor: "var(--color-border-2)" }}
      >
        <Space>
          <Button
            size="small"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber === 1}
          >
            Trang trước
          </Button>
          <span
            className="text-xs min-w-[80px] text-center"
            style={{ color: "var(--color-text-3)" }}
          >
            Trang {pageNumber} / {numPages || "..."}
          </span>
          <Button
            size="small"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber === numPages || numPages === 0}
          >
            Trang sau
          </Button>
        </Space>
      </div>

      {/* PDF Document */}
      <div className="w-full flex justify-center pb-6">
        <Document
          file={src}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages)
            setError(null)
          }}
          onLoadError={(err) => setError(err.message)}
          loading={
            <div className="flex items-center justify-center p-12">
              <Spin />
            </div>
          }
        >
          <Page pageNumber={pageNumber} width={pageWidth} renderAnnotationLayer renderTextLayer />
        </Document>
      </div>
    </div>
  )
}
