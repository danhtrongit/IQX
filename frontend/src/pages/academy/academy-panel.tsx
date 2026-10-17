import { Lock } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { REQUIRED_TOTAL_FALLBACK } from "./catalog-model"
import { useAcademyNavigation } from "./navigation"
import { useAcademyCatalog, useAcademyProgress } from "./queries"

/**
 * Right panel of the Học viện tool. F0 placeholder that compiles against the v3.2 contract: the
 * app package (P4) replaces it with ProgressCard, ChapterGroup and ItemRow. Item states always
 * come from the server (`progress.items[].state`); the client never computes locks.
 */
export function AcademyPanel() {
  const { isAuthenticated, isLoading, openAuth } = useAuth()
  const frame = useWorkspaceFrame()
  const nav = useAcademyNavigation()
  const catalogQuery = useAcademyCatalog()
  const progressQuery = useAcademyProgress()
  const catalog = catalogQuery.data
  const progress = progressQuery.data
  const total = catalog?.required_total ?? REQUIRED_TOTAL_FALLBACK

  if (!isAuthenticated && !isLoading) {
    return (
      <SidebarPanel title="Học viện" description={`${REQUIRED_TOTAL_FALLBACK} bài học`}>
        <PanelState
          title="Đăng nhập để học"
          description="Bài học, tiến độ và xu học tập được lưu theo tài khoản của bạn."
          action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
        />
      </SidebarPanel>
    )
  }

  const states = new Map(progress?.items.map((item) => [item.id, item.state]) ?? [])

  function select(id: string) {
    nav.openLesson(id)
    if (frame?.overlay) frame.setOpen(false)
  }

  return (
    <SidebarPanel title="Học viện" description={`${total} bài học`}>
      <div className="space-y-3">
        <p className="text-sm">
          Tiến độ học tập {progress ? `${progress.course_done} / ${progress.course_total}` : "—"}
        </p>
        {catalog ? (
          catalog.chapters.map((chapter) => (
            <section key={chapter.no} aria-label={`Chương ${chapter.no}`}>
              <h3 className="text-sm font-semibold">
                Chương {chapter.no} · {chapter.title}
              </h3>
              <ul className="mt-2 space-y-1">
                {chapter.items.map((item) => (
                  <li key={item.id}>
                    {states.get(item.id) === "locked" ? (
                      <div aria-disabled="true" className="flex items-center gap-2 text-sm">
                        <Lock className="size-3.5" aria-hidden="true" />
                        {item.name}
                      </div>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => select(item.id)}>
                        {item.name}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : catalogQuery.isError ? (
          <PanelState
            title="Chưa tải được danh sách bài học"
            description={errorMessage(catalogQuery.error)}
            action={{ label: "Thử lại", onClick: () => void catalogQuery.refetch() }}
          />
        ) : (
          <Skeleton className="h-14 w-full rounded-lg" />
        )}
      </div>
    </SidebarPanel>
  )
}
