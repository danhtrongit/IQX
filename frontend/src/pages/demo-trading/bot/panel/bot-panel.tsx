/**
 * «Bot» tool panel (right): the buy source and the 16 indicators grouped by chapter.
 *
 * This is the only place that configures the Bot. Nothing here starts a run or places
 * an order; saving a configuration or a source records a revision that counts from a
 * later trading session.
 */
import { useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

import { ConfigModal } from "../config/config-modal"
import { savedIndicatorConfig } from "../config/draft"
import { masterToggleIntent } from "../config/master"
import { effectiveText } from "../config/summary"
import type { TechnicalIndicator } from "../config/types"
import { useBotConfig } from "../config/use-bot-config"
import { chapterTitle, useBotNavigation } from "../navigation"
import { UniverseCard } from "../universe/universe-card"
import { groupIndicators } from "./indicator-groups"
import { IndicatorRow } from "./indicator-row"

const TOTAL_INDICATORS = 16

export function BotPanel() {
  const config = useBotConfig()
  const navigation = useBotNavigation()
  const [query, setQuery] = useState("")
  const [modal, setModal] = useState<{ id: string; activate: boolean } | null>(null)

  const { isAuthenticated, openAuth } = useAuth()
  if (!isAuthenticated) {
    return (
      <SidebarPanel title="Bot" description="Chỉ báo và nguồn mua của Bot">
        <PanelState title="Đăng nhập để dùng Bot" description="Cấu hình Bot gắn với tài khoản của bạn." action={{ label: "Đăng nhập", onClick: () => openAuth("login") }} />
      </SidebarPanel>
    )
  }

  const ready = config.availability === "ready"
  const total = config.indicators.length || TOTAL_INDICATORS
  const grantedCount = config.indicators.filter((indicator) => config.granted.has(indicator.id)).length
  const groups = groupIndicators(config.indicators, query)
  const modalIndicator = modal ? config.indicators.find((indicator) => indicator.id === modal.id) : undefined

  async function toggleMaster(indicator: TechnicalIndicator) {
    const saved = savedIndicatorConfig(config.state, indicator)
    const intent = masterToggleIntent(saved)
    if (intent.kind === "configure") {
      setModal({ id: indicator.id, activate: true })
      return
    }
    const outcome = await config.save(indicator.id, intent.config)
    if (outcome.ok) {
      const when = effectiveText(outcome.result.status, outcome.result.effective_session)
      toast.success(`Đã lưu trạng thái ${indicator.name} (bản ${outcome.result.revision}).${when ? ` ${when}.` : ""}`)
    } else if (outcome.reason === "conflict") {
      toast.error(`${outcome.message}${outcome.currentRevision === null ? "" : ` Bản mới nhất là #${outcome.currentRevision}.`} Đã tải lại bản mới nhất, hãy thử lại.`)
    } else {
      toast.error(outcome.message)
    }
  }

  return (
    <SidebarPanel title="Bot" description={ready ? `${grantedCount} / ${total} chỉ báo đã mở` : "Chỉ báo và nguồn mua của Bot"}>
      <UniverseCard />

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm chỉ báo…"
          aria-label="Tìm chỉ báo"
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent pr-2.5 pl-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      {config.availability === "loading" && (
        <div className="space-y-2" aria-label="Đang tải chỉ báo"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      )}
      {config.availability === "disabled" && (
        <PanelState title="Cấu hình chỉ báo chưa được bật" description="Hệ thống chưa mở cấu hình điều kiện cho Bot. Bot vẫn giữ nguyên các điều kiện đã lưu." action={{ label: "Thử lại", onClick: config.retry }} />
      )}
      {config.availability === "locked" && (
        <PanelState title="Chưa có quyền dùng cấu hình chỉ báo" description="Tài khoản hiện tại chưa được cấp quyền cấu hình điều kiện cho Bot." action={{ label: "Thử lại", onClick: config.retry }} />
      )}
      {config.availability === "error" && (
        <PanelState title="Không tải được chỉ báo" description={config.errorMessage ?? undefined} action={{ label: "Thử lại", onClick: config.retry }} />
      )}

      {ready && config.state?.legacy?.needs_review && (
        <p role="status" className="rounded-md border border-price-ref/40 bg-price-ref/10 p-2.5 text-xs leading-5 text-price-ref">
          Cấu hình đã lưu trước đây dùng chỉ báo không còn trong danh mục. Hãy kiểm tra từng chỉ báo và lưu lại cấu hình mới; Bot không giao dịch theo cấu hình cũ.
        </p>
      )}

      {ready && (
        <div aria-label="16 chỉ báo của Bot">
          {groups.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Không tìm thấy chỉ báo.</p>
          ) : (
            groups.map((group) => (
              <section key={group.chapter} aria-label={`Chương ${group.chapter}`} className="mb-3 space-y-2.5">
                <h3 className="mx-0.5 mt-4 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">
                  Chương {group.chapter} · {chapterTitle(group.chapter)}
                </h3>
                {group.indicators.map((indicator) => {
                  const granted = config.granted.has(indicator.id)
                  const saved = savedIndicatorConfig(config.state, indicator)
                  return (
                    <IndicatorRow
                      key={indicator.id}
                      indicator={indicator}
                      granted={granted}
                      masterOn={granted && saved.master_enabled}
                      busy={config.saving}
                      lessonSearch={navigation.lessonSearch(indicator.lesson_id)}
                      onPractice={() => navigation.openPractice(indicator.id)}
                      onConfigure={() => setModal({ id: indicator.id, activate: false })}
                      onToggleMaster={() => void toggleMaster(indicator)}
                    />
                  )
                })}
              </section>
            ))
          )}
        </div>
      )}

      {modal && modalIndicator && ready && (
        <ConfigModal
          key={modal.id}
          indicator={modalIndicator}
          controller={config}
          activate={modal.activate}
          onClose={() => setModal(null)}
        />
      )}
    </SidebarPanel>
  )
}
