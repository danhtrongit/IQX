import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import {
  createMarketOverviewPage,
  deleteMarketOverviewPage,
  reorderMarketOverviewPages,
  resolveWidgetState,
  updateMarketOverviewPage,
  updateMarketOverviewPreferences,
  type CreateMarketOverviewPageInput,
  type MarketOverviewPagesListResult,
} from "../api"
import { getWidgetMeta } from "../catalog"
import {
  MAX_PAGE_NAME_LENGTH,
  buildDuplicatePageName,
  nextDefaultPageName,
} from "../format"
import {
  MAX_WIDGETS_PER_PAGE,
  compactLayout,
  firstFitPosition,
  packLayout,
  placeInEmptySlot,
} from "../grid/engine"
import {
  marketOverviewKeys,
  useMarketOverviewPages,
  useMarketOverviewTemplate,
} from "../hooks"
import type {
  EmptyHole,
  GridItem,
  OverviewPage,
  WidgetMeta,
  WidgetSlug,
} from "../types"
import type { ToastState } from "./toast-bar"

export const TEMPLATE_PAGE_ID = "thi-truong"
const PAGE_PARAM = "page"
const SAVE_DEBOUNCE_MS = 1_000
const UNDO_WINDOW_MS = 5_000
const JUST_ADDED_PULSE_MS = 1_400

interface MarketOverviewSessionMemory {
  lastActivePageId: string | null
  scrollTopByPage: Map<string, number>
}

const sessionMemory: MarketOverviewSessionMemory = {
  lastActivePageId: null,
  scrollTopByPage: new Map<string, number>(),
}

/** Tracks cache objects produced by our own local mutations so they never re-trigger server hydration. */
const localPagesCacheWrites = new WeakSet<MarketOverviewPagesListResult>()

export function getRememberedScrollTop(pageId: string): number {
  return sessionMemory.scrollTopByPage.get(pageId) ?? 0
}

export function rememberScrollTop(pageId: string, scrollTop: number): void {
  sessionMemory.scrollTopByPage.set(pageId, Math.max(0, Math.round(scrollTop)))
}

export function resetMarketOverviewSessionMemory(): void {
  sessionMemory.lastActivePageId = null
  sessionMemory.scrollTopByPage.clear()
}

let uidSequence = 0
function generateUid(prefix: string): string {
  uidSequence += 1
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${uidSequence.toString(36)}`
}

function isTempPageId(pageId: string): boolean {
  return pageId.startsWith("tmp_")
}

function cloneGridItems(items: readonly GridItem[], regenerateUids = false): GridItem[] {
  return items.map((item) => ({
    ...item,
    uid: regenerateUids ? generateUid("w") : item.uid,
    state: { ...item.state },
  })) as GridItem[]
}

function trimPageName(raw: string): string {
  const trimmed = raw.trim()
  const chars = Array.from(trimmed)
  return chars.length > MAX_PAGE_NAME_LENGTH
    ? chars.slice(0, MAX_PAGE_NAME_LENGTH).join("").trimEnd()
    : trimmed
}

interface PendingDelete {
  pageId: string
  page: OverviewPage
  originalIndex: number
  timerId: number
}

interface ActiveToastInternal extends ToastState {
  timerId: number
  onExpire?: () => void
}

export interface TabMenuState {
  pageId: string
  anchorRect: DOMRect
}

export interface PagesControllerResult {
  templatePage: OverviewPage
  catalog: readonly WidgetMeta[]
  pages: readonly OverviewPage[]
  activePageId: string
  isTemplateActive: boolean
  activePage: OverviewPage
  activeItems: readonly GridItem[]
  placedCounts: Readonly<Partial<Record<WidgetSlug, number>>>
  locked: boolean
  drawerOpen: boolean
  slotTarget: EmptyHole | null
  renamingPageId: string | null
  menuState: TabMenuState | null
  justAddedUid: string | null
  toast: ToastState | null
  selectPage: (pageId: string) => void
  createPage: () => void
  startRename: (pageId: string) => void
  commitRename: (pageId: string, nextName: string) => void
  cancelRename: () => void
  duplicatePage: (pageId: string) => void
  deletePage: (pageId: string) => void
  reorderPages: (orderedIds: string[]) => void
  openTabMenu: (pageId: string, anchorRect: DOMRect) => void
  closeTabMenu: () => void
  toggleLock: () => void
  packActiveLayout: () => void
  openCatalog: (slot?: EmptyHole | null) => void
  closeCatalog: () => void
  clearSlotTarget: () => void
  addWidget: (slug: WidgetSlug) => void
  removeWidget: (uid: string) => void
  updateLayout: (nextItems: GridItem[]) => void
  updateWidgetState: (uid: string, patch: Readonly<Record<string, unknown>>) => void
  dismissToast: () => void
}

export function usePagesController(): PagesControllerResult {
  const { isAuthenticated, openAuth } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const { template } = useMarketOverviewTemplate()
  const pagesQuery = useMarketOverviewPages(isAuthenticated)

  const maxPages =
    pagesQuery.data?.maxPages ?? template.limits.maxPages ?? 8
  const maxWidgetsPerPage =
    template.limits.maxWidgetsPerPage ?? MAX_WIDGETS_PER_PAGE

  const [pages, setPages] = useState<OverviewPage[]>([])
  const [activePageId, setActivePageId] = useState<string>(() => {
    const urlPage = searchParams.get(PAGE_PARAM)
    if (urlPage) return urlPage
    return sessionMemory.lastActivePageId ?? TEMPLATE_PAGE_ID
  })
  const [templateStateOverrides, setTemplateStateOverrides] = useState<
    Record<string, Record<string, unknown>>
  >({})
  const [locked, setLocked] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [slotTarget, setSlotTarget] = useState<EmptyHole | null>(null)
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<TabMenuState | null>(null)
  const [justAddedUid, setJustAddedUid] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [dirtyPageIds, setDirtyPageIds] = useState<ReadonlySet<string>>(() => new Set())
  const [syncedAuth, setSyncedAuth] = useState<boolean>(isAuthenticated)
  const [syncedDataUpdatedAt, setSyncedDataUpdatedAt] = useState<number>(0)
  const [hasInitializedFromServer, setHasInitializedFromServer] = useState<boolean>(false)
  const urlPageParam = searchParams.get(PAGE_PARAM)
  const [prevUrlPageParam, setPrevUrlPageParam] = useState<string | null>(urlPageParam)

  const pagesRef = useRef<OverviewPage[]>(pages)
  const activePageIdRef = useRef<string>(activePageId)
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated)
  const saveTimersRef = useRef<Map<string, number>>(new Map())
  const dirtyPagesRef = useRef<Set<string>>(new Set())
  const pendingDeleteRef = useRef<PendingDelete | null>(null)
  const activeToastRef = useRef<ActiveToastInternal | null>(null)
  const justAddedTimerRef = useRef<number | null>(null)
  const inFlightCreatesRef = useRef<Map<string, Promise<OverviewPage | null>>>(new Map())
  const tempToRealIdRef = useRef<Map<string, string>>(new Map())
  const searchParamsRef = useRef<URLSearchParams>(searchParams)

  // Synchronize auth logout/login transitions without cascading setState inside effects.
  if (isAuthenticated !== syncedAuth) {
    setSyncedAuth(isAuthenticated)
    if (!isAuthenticated) {
      setSyncedDataUpdatedAt(0)
      setHasInitializedFromServer(false)
      setDirtyPageIds(new Set())
      setPages([])
      setActivePageId(TEMPLATE_PAGE_ID)
      setDrawerOpen(false)
      setSlotTarget(null)
      setRenamingPageId(null)
      setMenuState(null)
      setLocked(false)
    }
  }

  // Hydrate pages ONLY on initial mount or an actual server fetch/refetch (never our own local cache writes),
  // preserving in-flight optimistic `tmp_*` pages and any locally dirty pages awaiting save.
  const isFreshMountHydration = !hasInitializedFromServer
  const isNewServerFetch =
    pagesQuery.data !== undefined &&
    pagesQuery.dataUpdatedAt > 0 &&
    pagesQuery.dataUpdatedAt !== syncedDataUpdatedAt &&
    !localPagesCacheWrites.has(pagesQuery.data)

  if (isAuthenticated && pagesQuery.data && (isFreshMountHydration || isNewServerFetch)) {
    const data = pagesQuery.data
    setSyncedDataUpdatedAt(pagesQuery.dataUpdatedAt)
    const serverPages = data.pages.filter((p) => p.id !== pendingDeleteId)
    const localById = new Map(pages.map((p) => [p.id, p]))
    const mergedFromServer = serverPages.map((sp) => {
      const local = localById.get(sp.id)
      if (local && dirtyPageIds.has(sp.id)) {
        return local
      }
      return sp
    })
    const serverIdSet = new Set(serverPages.map((p) => p.id))
    const localOptimisticPages = pages.filter(
      (p) => p.id !== pendingDeleteId && isTempPageId(p.id) && !serverIdSet.has(p.id),
    )
    const nextPages = [...mergedFromServer, ...localOptimisticPages]
    setPages(nextPages)

    const validIds = new Set(nextPages.map((p) => p.id))
    let resolvedActive: string
    if (urlPageParam === TEMPLATE_PAGE_ID) {
      resolvedActive = TEMPLATE_PAGE_ID
    } else if (urlPageParam && validIds.has(urlPageParam)) {
      resolvedActive = urlPageParam
    } else if (!hasInitializedFromServer) {
      const remembered = sessionMemory.lastActivePageId
      if (remembered === TEMPLATE_PAGE_ID || (remembered && validIds.has(remembered))) {
        resolvedActive = remembered
      } else if (
        data.lastActivePageId === TEMPLATE_PAGE_ID ||
        validIds.has(data.lastActivePageId)
      ) {
        resolvedActive = data.lastActivePageId
      } else {
        resolvedActive = TEMPLATE_PAGE_ID
      }
    } else {
      resolvedActive =
        activePageId === TEMPLATE_PAGE_ID || validIds.has(activePageId)
          ? activePageId
          : TEMPLATE_PAGE_ID
    }

    setHasInitializedFromServer(true)
    setActivePageId(resolvedActive)
  }

  // Reconcile explicit URL ?page=... changes from external navigation.
  if (urlPageParam !== prevUrlPageParam) {
    setPrevUrlPageParam(urlPageParam)
    if (urlPageParam && urlPageParam !== activePageId) {
      if (urlPageParam === TEMPLATE_PAGE_ID) {
        setActivePageId(TEMPLATE_PAGE_ID)
        setDrawerOpen(false)
        setLocked(false)
      } else if (pages.some((p) => p.id === urlPageParam)) {
        setActivePageId(urlPageParam)
        setLocked(false)
      }
    }
  }

  useEffect(() => {
    pagesRef.current = pages
    activePageIdRef.current = activePageId
    isAuthenticatedRef.current = isAuthenticated
    searchParamsRef.current = searchParams
  })

  const syncUrlPageParam = useCallback(
    (nextPageId: string) => {
      const current = searchParamsRef.current
      if (current.get(PAGE_PARAM) === nextPageId) return
      const next = new URLSearchParams(current)
      next.set(PAGE_PARAM, nextPageId)
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  const updatePagesState = useCallback(
    (updater: (prev: OverviewPage[]) => OverviewPage[]) => {
      setPages((prev) => {
        const next = updater(prev)
        pagesRef.current = next
        return next
      })
    },
    [],
  )

  const resolveServerPageId = useCallback(async (pageId: string): Promise<string | null> => {
    const mapped = tempToRealIdRef.current.get(pageId)
    if (mapped) return mapped
    const inflight = inFlightCreatesRef.current.get(pageId)
    if (inflight) {
      const created = await inflight
      return created?.id ?? null
    }
    return isTempPageId(pageId) ? null : pageId
  }, [])

  const writePagesQueryCache = useCallback(
    (updater: (prev: MarketOverviewPagesListResult) => MarketOverviewPagesListResult) => {
      const existingUpdatedAt = queryClient.getQueryState(
        marketOverviewKeys.pages,
      )?.dataUpdatedAt
      queryClient.setQueryData<MarketOverviewPagesListResult>(
        marketOverviewKeys.pages,
        (prev) => {
          if (!prev) return prev
          const next = updater(prev)
          if (next !== prev) {
            localPagesCacheWrites.add(next)
          }
          return next
        },
        existingUpdatedAt ? { updatedAt: existingUpdatedAt } : undefined,
      )
    },
    [queryClient],
  )

  const markPageDirty = useCallback((pageId: string) => {
    dirtyPagesRef.current.add(pageId)
    setDirtyPageIds((prev) => {
      if (prev.has(pageId)) return prev
      const next = new Set(prev)
      next.add(pageId)
      return next
    })
  }, [])

  const clearPageDirty = useCallback((pageId: string) => {
    dirtyPagesRef.current.delete(pageId)
    setDirtyPageIds((prev) => {
      if (!prev.has(pageId)) return prev
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })
  }, [])

  const commitPendingDelete = useCallback(
    (pending: PendingDelete, keepalive = false) => {
      window.clearTimeout(pending.timerId)
      if (pendingDeleteRef.current?.pageId === pending.pageId) {
        pendingDeleteRef.current = null
        setPendingDeleteId(null)
      }
      if (!isAuthenticatedRef.current) return

      const executeDelete = async () => {
        const resolvedId = await resolveServerPageId(pending.pageId)
        if (!resolvedId) return
        try {
          await deleteMarketOverviewPage(resolvedId, { keepalive })
          writePagesQueryCache((prev) => ({
            ...prev,
            pages: prev.pages.filter((p) => p.id !== resolvedId),
          }))
        } catch {
          if (!keepalive) {
            void queryClient.invalidateQueries({ queryKey: marketOverviewKeys.pages })
          }
        }
      }
      void executeDelete()
    },
    [queryClient, resolveServerPageId, writePagesQueryCache],
  )

  const flushPendingDeleteNow = useCallback(
    (keepalive = false) => {
      const pending = pendingDeleteRef.current
      if (!pending) return
      commitPendingDelete(pending, keepalive)
    },
    [commitPendingDelete],
  )

  const clearToastTimer = useCallback(() => {
    if (activeToastRef.current) {
      window.clearTimeout(activeToastRef.current.timerId)
      activeToastRef.current = null
    }
  }, [])

  const dismissToast = useCallback(() => {
    clearToastTimer()
    setToast(null)
  }, [clearToastTimer])

  const showToast = useCallback(
    (options: {
      message: string
      actionLabel?: string
      onAction?: () => void
      onExpire?: () => void
      durationMs?: number
      preservePendingDelete?: boolean
    }) => {
      // If a prior toast had an uncommitted expiration callback (e.g. pending page delete)
      // and a new toast is replacing it, flush that prior delete immediately so it is never lost.
      if (!options.preservePendingDelete && activeToastRef.current?.onExpire) {
        const priorExpire = activeToastRef.current.onExpire
        activeToastRef.current.onExpire = undefined
        priorExpire()
      }
      clearToastTimer()

      const id = generateUid("toast")
      const durationMs = options.durationMs ?? UNDO_WINDOW_MS
      const timerId = window.setTimeout(() => {
        const current = activeToastRef.current
        if (!current || current.id !== id) return
        activeToastRef.current = null
        setToast(null)
        current.onExpire?.()
      }, durationMs)

      const wrappedOnAction = options.onAction
        ? () => {
            if (activeToastRef.current?.id === id) {
              activeToastRef.current.onExpire = undefined
            }
            clearToastTimer()
            setToast(null)
            options.onAction?.()
          }
        : undefined

      const entry: ActiveToastInternal = {
        id,
        message: options.message,
        actionLabel: options.actionLabel,
        onAction: wrappedOnAction,
        onExpire: options.onExpire,
        timerId,
      }
      activeToastRef.current = entry
      setToast({
        id: entry.id,
        message: entry.message,
        actionLabel: entry.actionLabel,
        onAction: entry.onAction,
      })
    },
    [clearToastTimer],
  )

  const flushPageSave = useCallback(
    async (pageId: string, keepalive = false) => {
      const existingTimer = saveTimersRef.current.get(pageId)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        saveTimersRef.current.delete(pageId)
      }

      if (!isAuthenticatedRef.current) {
        clearPageDirty(pageId)
        return
      }
      if (pendingDeleteRef.current?.pageId === pageId) {
        clearPageDirty(pageId)
        return
      }

      const resolvedId = await resolveServerPageId(pageId)
      if (!resolvedId) {
        clearPageDirty(pageId)
        return
      }
      if (pendingDeleteRef.current?.pageId === resolvedId) {
        clearPageDirty(pageId)
        clearPageDirty(resolvedId)
        return
      }

      const target = pagesRef.current.find(
        (p) => p.id === resolvedId || p.id === pageId,
      )
      if (!target) {
        clearPageDirty(pageId)
        clearPageDirty(resolvedId)
        return
      }

      try {
        const saved = await updateMarketOverviewPage(
          resolvedId,
          {
            name: target.name,
            items: target.items,
          },
          { keepalive },
        )
        if (!saveTimersRef.current.has(pageId) && !saveTimersRef.current.has(resolvedId)) {
          clearPageDirty(pageId)
          clearPageDirty(resolvedId)
        }
        writePagesQueryCache((prev) => ({
          ...prev,
          pages: prev.pages.map((p) => (p.id === saved.id ? saved : p)),
        }))
      } catch (err) {
        if (!saveTimersRef.current.has(pageId) && !saveTimersRef.current.has(resolvedId)) {
          clearPageDirty(pageId)
          clearPageDirty(resolvedId)
        }
        if (!keepalive && err instanceof ApiError && (err.status === 400 || err.status === 422)) {
          void queryClient.invalidateQueries({ queryKey: marketOverviewKeys.pages })
          showToast({ message: errorMessage(err), durationMs: 4_000 })
        }
      }
    },
    [clearPageDirty, queryClient, resolveServerPageId, showToast, writePagesQueryCache],
  )

  const schedulePageSave = useCallback(
    (pageId: string) => {
      if (!isAuthenticatedRef.current) return
      markPageDirty(pageId)
      const prevTimer = saveTimersRef.current.get(pageId)
      if (prevTimer !== undefined) {
        window.clearTimeout(prevTimer)
      }
      const timer = window.setTimeout(() => {
        saveTimersRef.current.delete(pageId)
        void flushPageSave(pageId, false)
      }, SAVE_DEBOUNCE_MS)
      saveTimersRef.current.set(pageId, timer)
    },
    [flushPageSave, markPageDirty],
  )

  const flushAllPendingWork = useCallback(
    (keepalive = false) => {
      const dirtyIds = Array.from(dirtyPagesRef.current)
      for (const id of dirtyIds) {
        void flushPageSave(id, keepalive)
      }
      flushPendingDeleteNow(keepalive)
    },
    [flushPageSave, flushPendingDeleteNow],
  )

  // Flush pending deletes and debounced saves on pagehide (with keepalive) or component unmount.
  useEffect(() => {
    const handlePageHide = () => {
      flushAllPendingWork(true)
    }
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      flushAllPendingWork(false)
      clearToastTimer()
      if (justAddedTimerRef.current !== null) {
        window.clearTimeout(justAddedTimerRef.current)
      }
    }
  }, [flushAllPendingWork, clearToastTimer])

  // Sync active tab to module session memory and URL ?page=... (external systems only).
  useEffect(() => {
    if (isAuthenticated && !hasInitializedFromServer) return
    sessionMemory.lastActivePageId = activePageId
    syncUrlPageParam(activePageId)
  }, [activePageId, hasInitializedFromServer, isAuthenticated, syncUrlPageParam])

  const selectPage = useCallback(
    (nextPageId: string) => {
      setActivePageId(nextPageId)
      sessionMemory.lastActivePageId = nextPageId
      syncUrlPageParam(nextPageId)
      setLocked(false)
      setRenamingPageId(null)
      setMenuState(null)
      setSlotTarget(null)
      if (nextPageId === TEMPLATE_PAGE_ID) {
        setDrawerOpen(false)
      }
      if (isAuthenticatedRef.current && !isTempPageId(nextPageId)) {
        void updateMarketOverviewPreferences(nextPageId).catch(() => {
          // Non-blocking preference sync
        })
      }
    },
    [syncUrlPageParam],
  )

  const createPage = useCallback(() => {
    if (!isAuthenticatedRef.current) {
      openAuth("login")
      return
    }
    const currentPages = pagesRef.current
    if (currentPages.length >= maxPages) {
      showToast({ message: `Tối đa ${maxPages} trang` })
      return
    }

    const name = nextDefaultPageName(currentPages.map((p) => p.name))
    const tempId = generateUid("tmp")
    const optimisticPage: OverviewPage = {
      version: 1,
      id: tempId,
      name,
      order: currentPages.length,
      items: [],
      updatedAt: new Date().toISOString(),
    }

    updatePagesState((prev) => [...prev, optimisticPage])
    setActivePageId(tempId)
    sessionMemory.lastActivePageId = tempId
    syncUrlPageParam(tempId)
    setLocked(false)
    setRenamingPageId(null)
    setMenuState(null)
    setSlotTarget(null)
    setDrawerOpen(true)

    const createPromise = createMarketOverviewPage({ name, items: [] })
      .then((created) => {
        tempToRealIdRef.current.set(tempId, created.id)
        inFlightCreatesRef.current.delete(tempId)

        let hadLocalChanges = false
        let mergedPage: OverviewPage = created
        updatePagesState((prev) =>
          prev.map((p) => {
            if (p.id !== tempId) return p
            hadLocalChanges = p.items.length > 0 || p.name !== created.name
            mergedPage = {
              ...created,
              name: p.name,
              items: hadLocalChanges ? p.items : created.items,
            }
            return mergedPage
          }),
        )

        if (activePageIdRef.current === tempId) {
          setActivePageId(created.id)
          sessionMemory.lastActivePageId = created.id
          syncUrlPageParam(created.id)
        }
        setRenamingPageId((prev) => (prev === tempId ? created.id : prev))

        writePagesQueryCache((prev) => ({
          ...prev,
          lastActivePageId: created.id,
          pages: [
            ...prev.pages.filter((p) => p.id !== created.id),
            mergedPage,
          ],
        }))

        if (hadLocalChanges || dirtyPagesRef.current.has(tempId)) {
          clearPageDirty(tempId)
          const pendingTimer = saveTimersRef.current.get(tempId)
          if (pendingTimer !== undefined) {
            window.clearTimeout(pendingTimer)
            saveTimersRef.current.delete(tempId)
          }
          schedulePageSave(created.id)
        }

        return created
      })
      .catch((err) => {
        inFlightCreatesRef.current.delete(tempId)
        clearPageDirty(tempId)
        updatePagesState((prev) => prev.filter((p) => p.id !== tempId))
        if (activePageIdRef.current === tempId) {
          setActivePageId(TEMPLATE_PAGE_ID)
          sessionMemory.lastActivePageId = TEMPLATE_PAGE_ID
          syncUrlPageParam(TEMPLATE_PAGE_ID)
          setDrawerOpen(false)
        }
        showToast({ message: errorMessage(err), durationMs: 4_000 })
        return null
      })

    inFlightCreatesRef.current.set(tempId, createPromise)
  }, [
    clearPageDirty,
    maxPages,
    openAuth,
    schedulePageSave,
    showToast,
    syncUrlPageParam,
    updatePagesState,
    writePagesQueryCache,
  ])

  const startRename = useCallback(
    (pageId: string) => {
      if (activePageIdRef.current !== pageId) {
        selectPage(pageId)
      }
      setMenuState(null)
      setRenamingPageId(pageId)
    },
    [selectPage],
  )

  const commitRename = useCallback(
    (pageId: string, rawName: string) => {
      setRenamingPageId(null)
      const cleaned = trimPageName(rawName)
      if (!cleaned) return

      const existing = pagesRef.current.find((p) => p.id === pageId)
      if (!existing || existing.name === cleaned) return

      updatePagesState((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, name: cleaned } : p)),
      )
      schedulePageSave(pageId)
    },
    [schedulePageSave, updatePagesState],
  )

  const cancelRename = useCallback(() => {
    setRenamingPageId(null)
  }, [])

  const duplicatePage = useCallback(
    (sourceId: string) => {
      if (!isAuthenticatedRef.current) {
        openAuth("login")
        return
      }
      const currentPages = pagesRef.current
      if (currentPages.length >= maxPages) {
        showToast({ message: `Tối đa ${maxPages} trang` })
        return
      }

      const source = currentPages.find((p) => p.id === sourceId)
      if (!source) return

      const duplicateName = buildDuplicatePageName(source.name)
      const clonedItems = cloneGridItems(source.items, true)
      const tempId = generateUid("tmp")
      const optimisticCopy: OverviewPage = {
        version: 1,
        id: tempId,
        name: duplicateName,
        order: currentPages.length,
        items: clonedItems,
        updatedAt: new Date().toISOString(),
      }

      updatePagesState((prev) => [...prev, optimisticCopy])
      setActivePageId(tempId)
      sessionMemory.lastActivePageId = tempId
      syncUrlPageParam(tempId)
      setLocked(false)
      setMenuState(null)
      setSlotTarget(null)
      showToast({ message: "Đã nhân bản trang" })

      const persistedSourceId = isTempPageId(source.id)
        ? tempToRealIdRef.current.get(source.id)
        : source.id
      const createInput: CreateMarketOverviewPageInput = persistedSourceId
        ? { name: duplicateName, duplicateFromPageId: persistedSourceId }
        : { name: duplicateName, items: clonedItems }

      const runCreate = async (): Promise<OverviewPage> => {
        if (persistedSourceId) {
          const dirtySourceKey = dirtyPagesRef.current.has(source.id)
            ? source.id
            : dirtyPagesRef.current.has(persistedSourceId)
              ? persistedSourceId
              : null
          if (dirtySourceKey) {
            await flushPageSave(dirtySourceKey)
          }
        }
        return createMarketOverviewPage(createInput)
      }

      const createPromise = runCreate()
        .then((created) => {
          tempToRealIdRef.current.set(tempId, created.id)
          inFlightCreatesRef.current.delete(tempId)

          let mergedCopy: OverviewPage = created
          updatePagesState((prev) =>
            prev.map((p) => {
              if (p.id !== tempId) return p
              mergedCopy = {
                ...created,
                name: p.name,
                items: dirtyPagesRef.current.has(tempId) ? p.items : created.items,
              }
              return mergedCopy
            }),
          )
          if (activePageIdRef.current === tempId) {
            setActivePageId(created.id)
            sessionMemory.lastActivePageId = created.id
            syncUrlPageParam(created.id)
          }
          setRenamingPageId((prev) => (prev === tempId ? created.id : prev))
          writePagesQueryCache((prev) => ({
            ...prev,
            lastActivePageId: created.id,
            pages: [
              ...prev.pages.filter((p) => p.id !== created.id),
              mergedCopy,
            ],
          }))
          if (dirtyPagesRef.current.has(tempId)) {
            clearPageDirty(tempId)
            schedulePageSave(created.id)
          }
          return created
        })
        .catch((err) => {
          inFlightCreatesRef.current.delete(tempId)
          clearPageDirty(tempId)
          updatePagesState((prev) => prev.filter((p) => p.id !== tempId))
          if (activePageIdRef.current === tempId) {
            selectPage(sourceId)
          }
          showToast({ message: errorMessage(err), durationMs: 4_000 })
          return null
        })

      inFlightCreatesRef.current.set(tempId, createPromise)
    },
    [
      clearPageDirty,
      flushPageSave,
      maxPages,
      openAuth,
      schedulePageSave,
      selectPage,
      showToast,
      syncUrlPageParam,
      updatePagesState,
      writePagesQueryCache,
    ],
  )

  const deletePage = useCallback(
    (pageId: string) => {
      // Flush any previously pending page delete before starting a new undo window.
      flushPendingDeleteNow()

      const currentPages = pagesRef.current
      const idx = currentPages.findIndex((p) => p.id === pageId)
      if (idx < 0) return

      const removedPage = currentPages[idx]
      const remaining = currentPages.filter((p) => p.id !== pageId)

      // Cancel any debounced PUT for this page.
      const pendingSaveTimer = saveTimersRef.current.get(pageId)
      if (pendingSaveTimer !== undefined) {
        window.clearTimeout(pendingSaveTimer)
        saveTimersRef.current.delete(pageId)
      }
      clearPageDirty(pageId)

      updatePagesState(() => remaining)
      setDrawerOpen(false)
      setMenuState(null)
      setSlotTarget(null)
      setRenamingPageId((prev) => (prev === pageId ? null : prev))

      if (activePageIdRef.current === pageId) {
        const leftNeighbor = idx > 0 ? remaining[idx - 1] : undefined
        const nextActiveId = leftNeighbor?.id ?? TEMPLATE_PAGE_ID
        setActivePageId(nextActiveId)
        sessionMemory.lastActivePageId = nextActiveId
        syncUrlPageParam(nextActiveId)
        setLocked(false)
      }

      const pending: PendingDelete = {
        pageId,
        page: removedPage,
        originalIndex: idx,
        timerId: 0,
      }
      pendingDeleteRef.current = pending
      setPendingDeleteId(pageId)

      showToast({
        message: `Đã xoá “${removedPage.name}”`,
        actionLabel: "Hoàn tác",
        preservePendingDelete: true,
        onAction: () => {
          if (pendingDeleteRef.current?.pageId === pageId) {
            window.clearTimeout(pendingDeleteRef.current.timerId)
            pendingDeleteRef.current = null
            setPendingDeleteId(null)
          }
          updatePagesState((prev) => {
            if (prev.some((p) => p.id === removedPage.id)) return prev
            const next = [...prev]
            const insertAt = Math.max(0, Math.min(idx, next.length))
            next.splice(insertAt, 0, removedPage)
            return next
          })
          setActivePageId(removedPage.id)
          sessionMemory.lastActivePageId = removedPage.id
          syncUrlPageParam(removedPage.id)
          setLocked(false)
        },
        onExpire: () => {
          if (pendingDeleteRef.current?.pageId === pageId) {
            commitPendingDelete(pendingDeleteRef.current)
          }
        },
      })
    },
    [
      clearPageDirty,
      commitPendingDelete,
      flushPendingDeleteNow,
      showToast,
      syncUrlPageParam,
      updatePagesState,
    ],
  )

  const reorderPages = useCallback(
    (orderedIds: string[]) => {
      const currentPages = pagesRef.current
      const byId = new Map(currentPages.map((p) => [p.id, p]))
      const reordered: OverviewPage[] = []
      for (const id of orderedIds) {
        const found = byId.get(id)
        if (found) {
          reordered.push({ ...found, order: reordered.length })
          byId.delete(id)
        }
      }
      for (const leftover of byId.values()) {
        reordered.push({ ...leftover, order: reordered.length })
      }
      updatePagesState(() => reordered)

      if (!isAuthenticatedRef.current) return
      const persistOrder = async () => {
        const resolvedIds: string[] = []
        for (const page of reordered) {
          const id = await resolveServerPageId(page.id)
          if (id) resolvedIds.push(id)
        }
        if (resolvedIds.length === 0) return
        try {
          const updated = await reorderMarketOverviewPages(resolvedIds)
          writePagesQueryCache((prev) => ({ ...prev, pages: updated }))
        } catch {
          void queryClient.invalidateQueries({ queryKey: marketOverviewKeys.pages })
        }
      }
      void persistOrder()
    },
    [queryClient, resolveServerPageId, updatePagesState, writePagesQueryCache],
  )

  const openTabMenu = useCallback((pageId: string, anchorRect: DOMRect) => {
    setMenuState((prev) =>
      prev && prev.pageId === pageId ? null : { pageId, anchorRect },
    )
  }, [])

  const closeTabMenu = useCallback(() => {
    setMenuState(null)
  }, [])

  const toggleLock = useCallback(() => {
    setLocked((prev) => !prev)
  }, [])

  const openCatalog = useCallback((slot: EmptyHole | null = null) => {
    if (activePageIdRef.current === TEMPLATE_PAGE_ID) return
    setSlotTarget(slot)
    setDrawerOpen(true)
  }, [])

  const closeCatalog = useCallback(() => {
    setDrawerOpen(false)
    setSlotTarget(null)
  }, [])

  const clearSlotTarget = useCallback(() => {
    setSlotTarget(null)
  }, [])

  const triggerJustAddedPulse = useCallback((uid: string) => {
    if (justAddedTimerRef.current !== null) {
      window.clearTimeout(justAddedTimerRef.current)
    }
    setJustAddedUid(uid)
    justAddedTimerRef.current = window.setTimeout(() => {
      justAddedTimerRef.current = null
      setJustAddedUid((curr) => (curr === uid ? null : curr))
    }, JUST_ADDED_PULSE_MS)
  }, [])

  const updateActivePageItems = useCallback(
    (pageId: string, nextItems: GridItem[]) => {
      updatePagesState((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, items: nextItems } : p)),
      )
      schedulePageSave(pageId)
    },
    [schedulePageSave, updatePagesState],
  )

  const addWidget = useCallback(
    (slug: WidgetSlug) => {
      const currentId = activePageIdRef.current
      if (currentId === TEMPLATE_PAGE_ID) return
      const currentPage = pagesRef.current.find((p) => p.id === currentId)
      if (!currentPage) return

      if (currentPage.items.length >= maxWidgetsPerPage) {
        showToast({ message: `Tối đa ${maxWidgetsPerPage} widget mỗi trang` })
        return
      }

      const meta = getWidgetMeta(slug)
      const uid = generateUid("w")
      const priorSnapshot = cloneGridItems(currentPage.items, false)
      let nextItems: GridItem[]

      if (slotTarget) {
        nextItems = placeInEmptySlot(currentPage.items, slotTarget, meta, uid)
        setSlotTarget(null)
      } else {
        const pos = firstFitPosition(
          currentPage.items,
          meta.defaultW,
          meta.defaultH,
        )
        const inserted = {
          uid,
          widget: slug,
          x: pos.x,
          y: pos.y,
          w: meta.defaultW,
          h: meta.defaultH,
          state: { ...meta.defaultState },
        } as GridItem
        nextItems = compactLayout([...currentPage.items, inserted])
      }

      updateActivePageItems(currentId, nextItems)
      triggerJustAddedPulse(uid)

      showToast({
        message: `Đã thêm “${meta.title}”`,
        actionLabel: "Hoàn tác",
        onAction: () => {
          const targetId = tempToRealIdRef.current.get(currentId) ?? currentId
          const latestPage = pagesRef.current.find(
            (p) => p.id === targetId || p.id === currentId,
          )
          if (!latestPage) return
          const sameWidgetSet =
            latestPage.items.length === nextItems.length &&
            latestPage.items.every((item) => nextItems.some((n) => n.uid === item.uid))
          const reverted = sameWidgetSet
            ? priorSnapshot
            : compactLayout(latestPage.items.filter((item) => item.uid !== uid))
          setJustAddedUid((curr) => (curr === uid ? null : curr))
          updateActivePageItems(latestPage.id, reverted)
        },
      })
    },
    [
      maxWidgetsPerPage,
      showToast,
      slotTarget,
      triggerJustAddedPulse,
      updateActivePageItems,
    ],
  )

  const removeWidget = useCallback(
    (uid: string) => {
      const currentId = activePageIdRef.current
      if (currentId === TEMPLATE_PAGE_ID || locked) return
      const currentPage = pagesRef.current.find((p) => p.id === currentId)
      if (!currentPage) return

      const targetItem = currentPage.items.find((it) => it.uid === uid)
      if (!targetItem) return

      const meta = getWidgetMeta(targetItem.widget)
      const priorSnapshot = cloneGridItems(currentPage.items, false)
      const nextItems = compactLayout(
        currentPage.items.filter((item) => item.uid !== uid),
      )

      updateActivePageItems(currentId, nextItems)

      showToast({
        message: `Đã xoá “${meta.title}”`,
        actionLabel: "Hoàn tác",
        onAction: () => {
          const targetId = tempToRealIdRef.current.get(currentId) ?? currentId
          const latestPage = pagesRef.current.find(
            (p) => p.id === targetId || p.id === currentId,
          )
          if (!latestPage) return
          updateActivePageItems(latestPage.id, priorSnapshot)
        },
      })
    },
    [locked, showToast, updateActivePageItems],
  )

  const updateLayout = useCallback(
    (nextItems: GridItem[]) => {
      const currentId = activePageIdRef.current
      if (currentId === TEMPLATE_PAGE_ID || locked) return
      updateActivePageItems(currentId, nextItems)
    },
    [locked, updateActivePageItems],
  )

  const packActiveLayout = useCallback(() => {
    const currentId = activePageIdRef.current
    if (currentId === TEMPLATE_PAGE_ID) return
    const currentPage = pagesRef.current.find((p) => p.id === currentId)
    if (!currentPage || currentPage.items.length === 0) return

    const packed = packLayout(currentPage.items)
    updateActivePageItems(currentId, packed)
    showToast({ message: "Đã xếp gọn bố cục" })
  }, [showToast, updateActivePageItems])

  const updateWidgetState = useCallback(
    (uid: string, patch: Readonly<Record<string, unknown>>) => {
      const currentId = activePageIdRef.current
      if (currentId === TEMPLATE_PAGE_ID) {
        setTemplateStateOverrides((prev) => ({
          ...prev,
          [uid]: { ...(prev[uid] ?? {}), ...patch },
        }))
        return
      }

      const currentPage = pagesRef.current.find((p) => p.id === currentId)
      if (!currentPage) return

      const nextItems = currentPage.items.map((item) => {
        if (item.uid !== uid) return item
        const merged = resolveWidgetState(item.widget, {
          ...(item.state as Record<string, unknown>),
          ...patch,
        })
        return { ...item, state: merged } as GridItem
      })

      updateActivePageItems(currentId, nextItems)
    },
    [updateActivePageItems],
  )

  const activeUserPage = useMemo(
    () => pages.find((p) => p.id === activePageId) ?? null,
    [pages, activePageId],
  )
  const isTemplateActive = activePageId === TEMPLATE_PAGE_ID || activeUserPage === null
  const activePage = isTemplateActive ? template.templatePage : activeUserPage

  const activeItems = useMemo<GridItem[]>(() => {
    if (!isTemplateActive) {
      return activePage.items
    }
    if (Object.keys(templateStateOverrides).length === 0) {
      return template.templatePage.items
    }
    return template.templatePage.items.map((item) => {
      const override = templateStateOverrides[item.uid]
      if (!override) return item
      const merged = resolveWidgetState(item.widget, {
        ...(item.state as Record<string, unknown>),
        ...override,
      })
      return { ...item, state: merged } as GridItem
    })
  }, [isTemplateActive, activePage.items, template.templatePage.items, templateStateOverrides])

  const placedCounts = useMemo(() => {
    const counts: Partial<Record<WidgetSlug, number>> = {}
    if (isTemplateActive) return counts
    for (const item of activeItems) {
      counts[item.widget] = (counts[item.widget] ?? 0) + 1
    }
    return counts
  }, [isTemplateActive, activeItems])

  return {
    templatePage: template.templatePage,
    catalog: template.catalog,
    pages,
    activePageId: isTemplateActive ? TEMPLATE_PAGE_ID : activePageId,
    isTemplateActive,
    activePage,
    activeItems,
    placedCounts,
    locked: isTemplateActive ? false : locked,
    drawerOpen: isTemplateActive ? false : drawerOpen,
    slotTarget: isTemplateActive ? null : slotTarget,
    renamingPageId,
    menuState,
    justAddedUid,
    toast,
    selectPage,
    createPage,
    startRename,
    commitRename,
    cancelRename,
    duplicatePage,
    deletePage,
    reorderPages,
    openTabMenu,
    closeTabMenu,
    toggleLock,
    packActiveLayout,
    openCatalog,
    closeCatalog,
    clearSlotTarget,
    addWidget,
    removeWidget,
    updateLayout,
    updateWidgetState,
    dismissToast,
  }
}
