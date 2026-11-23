import { useEffect, useMemo, useRef, useState } from "react"
import {
  CATALOG_GROUPS,
  DEFAULT_ENABLED_WIDGET_LIST,
  matchesWidgetSearch,
} from "../catalog"
import type { CatalogGroupId, EmptyHole, WidgetMeta, WidgetSlug } from "../types"

export interface CatalogDrawerProps {
  open: boolean
  overlay?: boolean
  widgets?: readonly WidgetMeta[]
  placedCounts: Readonly<Partial<Record<WidgetSlug, number>>>
  targetSlot?: EmptyHole | null
  onClearTargetSlot?: () => void
  onAddWidget: (slug: WidgetSlug) => void
  onClose: () => void
}

export function CatalogDrawer({
  open,
  overlay = false,
  widgets = DEFAULT_ENABLED_WIDGET_LIST,
  placedCounts,
  targetSlot = null,
  onClearTargetSlot,
  onAddWidget,
  onClose,
}: CatalogDrawerProps) {
  const [query, setQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<CatalogGroupId>>(
    () => new Set<CatalogGroupId>(["indices"]),
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus search input whenever drawer opens.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 30)
    return () => window.clearTimeout(timer)
  }, [open])

  // Close drawer on Escape key.
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const trimmedQuery = query.trim()
  const isSearching = trimmedQuery.length > 0

  const groupedWidgets = useMemo(() => {
    return CATALOG_GROUPS.map((group) => {
      const matched = widgets.filter(
        (meta) =>
          meta.group === group.id && matchesWidgetSearch(meta, group.label, trimmedQuery),
      )
      const addedUniqueCount = matched.reduce(
        (acc, meta) => acc + ((placedCounts[meta.id] ?? 0) > 0 ? 1 : 0),
        0,
      )
      return {
        group,
        items: matched,
        addedUniqueCount,
      }
    }).filter((entry) => entry.items.length > 0)
  }, [widgets, trimmedQuery, placedCounts])

  const toggleGroup = (groupId: CatalogGroupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const drawerClasses = ["mo-dr"]
  if (open) drawerClasses.push("open")
  if (overlay) drawerClasses.push("mo-dr-overlay")

  const showSlotBanner = Boolean(targetSlot && !targetSlot.isEnd)

  return (
    <>
      {open && overlay && (
        <div
          className="mo-dr-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        className={drawerClasses.join(" ")}
        aria-label="Kho widget"
        aria-hidden={!open}
      >
        <div className="mo-drh">
          <div className="mo-dr-tt">
            <b>Thêm widget</b>
            <span className="mo-note">{widgets.length} widget</span>
            <button type="button" className="mo-btn pri" onClick={onClose}>
              Xong
            </button>
          </div>
          <div className="mo-srch">
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              placeholder="Tìm widget"
              aria-label="Tìm widget"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="mo-drb">
          {showSlotBanner && targetSlot && (
            <div className="mo-slotinfo">
              <span>
                Thêm vào ô trống đã chọn ({targetSlot.w}×{targetSlot.h}).
              </span>
              {onClearTargetSlot && (
                <button type="button" onClick={onClearTargetSlot}>
                  Bỏ chọn ô
                </button>
              )}
            </div>
          )}

          {groupedWidgets.length === 0 ? (
            <div className="mo-pad mo-note">Không thấy widget phù hợp.</div>
          ) : (
            groupedWidgets.map(({ group, items, addedUniqueCount }) => {
              const isExpanded = isSearching || expandedGroups.has(group.id)
              return (
                <section key={group.id} aria-label={group.label}>
                  <button
                    type="button"
                    className={isExpanded ? "mo-gh op" : "mo-gh"}
                    aria-expanded={isExpanded}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className="mo-cv2" aria-hidden="true">
                      ›
                    </span>
                    <span>{group.label}</span>
                    <span className="mo-n">
                      {addedUniqueCount > 0 && (
                        <>
                          <b className="mo-hv">{addedUniqueCount} đã thêm</b>
                          {" · "}
                        </>
                      )}
                      {items.length}
                    </span>
                  </button>

                  {isExpanded &&
                    items.map((meta) => {
                      const count = placedCounts[meta.id] ?? 0
                      return (
                        <div
                          key={meta.id}
                          className={count > 0 ? "mo-it has" : "mo-it"}
                        >
                          <div className="mo-nm">
                            <b>{meta.title}</b>
                          </div>
                          {count > 0 && (
                            <span
                              className="mo-hv"
                              aria-label={`Đã thêm ${count}`}
                            >
                              ✓{count > 1 ? ` ×${count}` : ""}
                            </span>
                          )}
                          <button
                            type="button"
                            className="mo-add"
                            title="Thêm vào trang"
                            aria-label={`Thêm ${meta.title} vào trang`}
                            onClick={() => onAddWidget(meta.id)}
                          >
                            ＋
                          </button>
                        </div>
                      )
                    })}
                </section>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}
