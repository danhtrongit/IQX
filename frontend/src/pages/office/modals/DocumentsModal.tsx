import { Download, Trash2, Upload } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { triggerOfficeDocumentDownload } from "../api.ts"
import {
  useDeleteOfficeDocument,
  useOfficeDocuments,
  useUploadOfficeDocument,
} from "../hooks.ts"
import type { OfficeMe } from "../types.ts"
import { formatFileSize, formatFullDate } from "../utils.ts"
import { ModalShell, OfficeQueryError } from "./ModalShell.tsx"

const MAX_DOC_TITLE = 160
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "png",
  "jpg",
  "jpeg",
])

export interface DocumentsModalProps {
  me: OfficeMe
  onClose: () => void
  onToast: (message: string) => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function docIconClass(ext: string): string {
  const normalized = ext.toLowerCase()
  if (normalized === "pdf") return "of-doc-ic t-pdf"
  if (normalized === "doc" || normalized === "docx") return "of-doc-ic t-doc"
  if (normalized === "xls" || normalized === "xlsx") return "of-doc-ic t-xls"
  if (normalized === "ppt" || normalized === "pptx") return "of-doc-ic t-ppt"
  if (normalized === "png" || normalized === "jpg" || normalized === "jpeg") {
    return "of-doc-ic t-img"
  }
  return "of-doc-ic"
}

export function DocumentsModal({ me, onClose, onToast }: DocumentsModalProps) {
  const docsQuery = useOfficeDocuments(true)
  const uploadMutation = useUploadOfficeDocument()
  const deleteMutation = useDeleteOfficeDocument()

  const isBoss = me.role === "boss"
  const maxBytes = docsQuery.data?.maxSizeBytes ?? DEFAULT_MAX_BYTES

  const [title, setTitle] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documents = useMemo(() => {
    const items = docsQuery.data?.items ?? []
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [docsQuery.data?.items])

  const handleFileChange = (file: File | null) => {
    setUploadError(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setSelectedFile(null)
      setUploadError(
        "Định dạng không hỗ trợ. Chỉ chấp nhận PDF, DOCX, XLSX, PPTX, PNG, JPG."
      )
      return
    }
    if (file.size > maxBytes) {
      setSelectedFile(null)
      setUploadError("Tệp vượt quá dung lượng tối đa 20 MB.")
      return
    }
    setSelectedFile(file)
  }

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedFile) {
      setUploadError("Vui lòng chọn tệp tài liệu để tải lên.")
      return
    }
    if (selectedFile.size > maxBytes) {
      setUploadError("Tệp vượt quá dung lượng tối đa 20 MB.")
      return
    }
    setUploadError(null)
    try {
      await uploadMutation.mutateAsync({
        file: selectedFile,
        title: title.trim() || undefined,
      })
      setTitle("")
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      onToast("Đã tải tài liệu lên thành công.")
    } catch (error) {
      setUploadError(getErrorMessage(error, "Không thể tải tài liệu lên."))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      setConfirmDeleteId(null)
      onToast("Đã xoá tài liệu.")
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể xoá tài liệu."))
    }
  }

  return (
    <ModalShell
      title="PHÒNG TÀI LIỆU"
      subtitle={`Nhóm ${me.team?.bossName ?? ""} · ${documents.length} tệp`}
      size="small"
      bodyClassName="of-bb-sm"
      testId="office-modal-docs"
      onClose={onClose}
    >
      {isBoss && (
        <section className="of-sect">
          <h5>TẢI TÀI LIỆU LÊN</h5>
          <form
            className="of-form"
            style={{ padding: 0 }}
            onSubmit={(event) => void handleUpload(event)}
          >
            <div className="of-fl">
              <label htmlFor="of-doc-title">
                Tên tài liệu (tuỳ chọn · {title.length}/{MAX_DOC_TITLE})
              </label>
              <input
                id="of-doc-title"
                type="text"
                className="of-inp"
                maxLength={MAX_DOC_TITLE}
                value={title}
                placeholder="Ví dụ: Quy trình tư vấn khách hàng Q4"
                onChange={(e) =>
                  setTitle(e.target.value.slice(0, MAX_DOC_TITLE))
                }
              />
            </div>

            <div className="of-fl">
              <label htmlFor="of-doc-file">
                Chọn tệp (PDF, DOCX, XLSX, PPTX, PNG, JPG · tối đa 20 MB)
              </label>
              <input
                ref={fileInputRef}
                id="of-doc-file"
                type="file"
                className="of-file-input"
                accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                onChange={(event) =>
                  handleFileChange(event.target.files?.[0] ?? null)
                }
              />
            </div>

            {uploadError && (
              <div className="of-err" role="alert">
                {uploadError}
              </div>
            )}

            <div className="of-form-acts">
              <button
                type="submit"
                className="of-btn is-gold"
                disabled={uploadMutation.isPending}
              >
                <Upload size={14} aria-hidden="true" />
                Tải tài liệu lên
              </button>
            </div>
          </form>
        </section>
      )}

      {docsQuery.isError ? (
        <OfficeQueryError onRetry={() => void docsQuery.refetch()} />
      ) : documents.length === 0 ? (
        <p className="of-empty">
          {docsQuery.isLoading
            ? "Đang tải danh sách tài liệu..."
            : "Chưa có tài liệu nào trong phòng."}
        </p>
      ) : (
        documents.map((doc) => {
          const isDeleting = confirmDeleteId === doc.id
          return (
            <div key={doc.id} data-testid={`office-doc-${doc.id}`}>
              <div className="of-doc">
                <span className={docIconClass(doc.fileExt)} aria-hidden="true">
                  {doc.fileExt.toUpperCase()}
                </span>
                <div className="of-doc-tt">
                  <b>{doc.title}</b>
                  <small>
                    {doc.fileExt.toUpperCase()} ·{" "}
                    {formatFileSize(doc.sizeBytes)} ·{" "}
                    {formatFullDate(doc.createdAt)}
                  </small>
                </div>
                <div className="of-doc-acts">
                  <button
                    type="button"
                    className="of-btn is-ghost"
                    onClick={() => triggerOfficeDocumentDownload(doc)}
                  >
                    <Download size={14} aria-hidden="true" />
                    Tải về
                  </button>
                  {isBoss && !isDeleting && (
                    <button
                      type="button"
                      className="of-btn is-red"
                      aria-label={`Xoá ${doc.title}`}
                      onClick={() => setConfirmDeleteId(doc.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {isBoss && isDeleting && (
                <div className="of-confirm-inline" style={{ marginBottom: 10 }}>
                  <span>Xác nhận xoá tài liệu &ldquo;{doc.title}&rdquo;?</span>
                  <div className="of-form-acts">
                    <button
                      type="button"
                      className="of-btn is-ghost"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      className="of-btn is-red"
                      disabled={deleteMutation.isPending}
                      onClick={() => void handleDelete(doc.id)}
                    >
                      Xác nhận xoá
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </ModalShell>
  )
}
