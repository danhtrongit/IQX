import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { MAX_PAGE_NAME_LENGTH } from "../format"
import type { OverviewPage } from "../types"

export interface TabBarProps {
  pages: readonly OverviewPage[]
  activePageId: string
  templatePageId?: string
  isTemplateActive: boolean
  activePageHasWidgets: boolean
  locked: boolean
  renamingPageId: string | null
  menuOpenPageId: string | null
  onSelectPage: (pageId: string) => void
  onCreatePage: () => void
  onStartRename: (pageId: string) => void
  onCommitRename: (pageId: string, nextName: string) => void
  onCancelRename: () => void
  onOpenMenu: (pageId: string, anchorRect: DOMRect) => void
  onReorderPages: (orderedIds: string[]) => void
  onPackLayout: () => void
  onToggleLock: () => void
  onOpenCatalog: () => void
}

interface DropIndicator {
  targetId: string
  side: "left" | "right"
}

interface InlineTabRenameInputProps {
  initialValue: string
  onCommit: (nextName: string) => void
  onCancel: () => void
}

function InlineTabRenameInput({
  initialValue,
  onCommit,
  onCancel,
}: InlineTabRenameInputProps) {
  const [draft, setDraft] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const settledRef = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const finish = (save: boolean) => {
    if (settledRef.current) return
    settledRef.current = true
    const trimmed = draft.trim()
    if (save && trimmed.length > 0) {
      onCommit(trimmed.slice(0, MAX_PAGE_NAME_LENGTH))
    } else {
      onCancel()
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      finish(true)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className="mo-tni"
      value={draft}
      maxLength={MAX_PAGE_NAME_LENGTH}
      aria-label="Đổi tên trang"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => finish(true)}
      onClick={(event) => event.stopPropagation()}
    />
  )
}

export function TabBar({
  pages,
  activePageId,
  templatePageId = "thi-truong",
  isTemplateActive,
  activePageHasWidgets,
  locked,
  renamingPageId,
  menuOpenPageId,
  onSelectPage,
  onCreatePage,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenMenu,
  onReorderPages,
  onPackLayout,
  onToggleLock,
  onOpenCatalog,
}: TabBarProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const activeTab = strip.querySelector<HTMLElement>(".mo-tb.on")
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }, [activePageId, pages.length])

  const handleDragStart = (pageId: string, event: ReactDragEvent<HTMLDivElement>) => {
    setDraggedId(pageId)
    try {
      event.dataTransfer.setData("text/plain", pageId)
      event.dataTransfer.effectAllowed = "move"
    } catch {
      // jsdom or restricted drag environment
    }
  }

  const handleDragOver = (targetId: string, event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggedId || draggedId === targetId) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const side: "left" | "right" =
      event.clientX < rect.left + rect.width / 2 ? "left" : "right"
    setDropIndicator((prev) =>
      prev && prev.targetId === targetId && prev.side === side
        ? prev
        : { targetId, side },
    )
  }

  const handleDrop = (targetId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDropIndicator(null)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const insertBefore =
      dropIndicator?.targetId === targetId
        ? dropIndicator.side === "left"
        : event.clientX < rect.left + rect.width / 2

    const ids = pages.map((p) => p.id)
    const fromIdx = ids.indexOf(draggedId)
    if (fromIdx >= 0) {
      ids.splice(fromIdx, 1)
      const toIdx = ids.indexOf(targetId)
      if (toIdx >= 0) {
        ids.splice(insertBefore ? toIdx : toIdx + 1, 0, draggedId)
        onReorderPages(ids)
      }
    }

    setDraggedId(null)
    setDropIndicator(null)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDropIndicator(null)
  }

  return (
    <div className="mo-tbar">
      <div
        ref={stripRef}
        className="mo-tabs"
        role="tablist"
        aria-label="Các trang Toàn cảnh thị trường"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isTemplateActive}
          className={isTemplateActive ? "mo-tb on" : "mo-tb"}
          data-page-id={templatePageId}
          onClick={() => onSelectPage(templatePageId)}
        >
          <span className="mo-tn">Thị trường</span>
        </button>

        {pages.map((page) => {
          const isActive = !isTemplateActive && activePageId === page.id
          const isRenaming = renamingPageId === page.id
          const isMenuOpen = menuOpenPageId === page.id

          const tabClasses = ["mo-tb"]
          if (isActive) tabClasses.push("on")
          if (draggedId === page.id) tabClasses.push("mo-tdrag")
          if (dropIndicator?.targetId === page.id) {
            tabClasses.push(dropIndicator.side === "left" ? "mo-tl" : "mo-tr")
          }

          return (
            <div
              key={page.id}
              role="tab"
              tabIndex={isRenaming ? -1 : 0}
              aria-selected={isActive}
              className={tabClasses.join(" ")}
              data-page-id={page.id}
              draggable={!isRenaming}
              onClick={() => {
                if (!isRenaming) onSelectPage(page.id)
              }}
              onKeyDown={(event) => {
                if (isRenaming) return
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelectPage(page.id)
                }
              }}
              onDragStart={(event) => handleDragStart(page.id, event)}
              onDragOver={(event) => handleDragOver(page.id, event)}
              onDrop={(event) => handleDrop(page.id, event)}
              onDragEnd={handleDragEnd}
            >
              {isRenaming ? (
                <InlineTabRenameInput
                  key={page.id}
                  initialValue={page.name}
                  onCommit={(nextName) => onCommitRename(page.id, nextName)}
                  onCancel={onCancelRename}
                />
              ) : (
                <span
                  className="mo-tn"
                  title="Bấm đúp để đổi tên"
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    onStartRename(page.id)
                  }}
                >
                  {page.name}
                </span>
              )}

              <button
                type="button"
                className="mo-tm"
                aria-label="Tuỳ chọn trang"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenMenu(page.id, event.currentTarget.getBoundingClientRect())
                }}
              >
                ⋯
              </button>
            </div>
          )
        })}

        <button
          type="button"
          className="mo-tadd"
          title="Thêm trang trống"
          aria-label="Thêm trang trống"
          onClick={onCreatePage}
        >
          ＋
        </button>
      </div>

      {!isTemplateActive && (
        <div className="mo-tact">
          {activePageHasWidgets && (
            <>
              <button type="button" className="mo-btn" onClick={onPackLayout}>
                Xếp gọn
              </button>
              <button type="button" className="mo-btn" onClick={onToggleLock}>
                {locked ? "Mở khoá bố cục" : "Khoá bố cục"}
              </button>
            </>
          )}
          <button type="button" className="mo-btn pri" onClick={onOpenCatalog}>
            ＋ Thêm widget
          </button>
        </div>
      )}
    </div>
  )
}
