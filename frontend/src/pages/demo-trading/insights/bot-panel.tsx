/**
 * «Bot» - the Bot account panel.
 *
 * Read-only by construction: the only action is a refresh (query invalidation)
 * and journal paging. Every number comes from the server and nothing here gates
 * the panel behind a level or a graduation; the disclosure text is the server's
 * own string.
 */
import { Bot, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { BotConditions, BotPerformance } from "./api"
import {
  formatDateOnly,
  formatDateTimeVn,
  formatInt,
  formatRatioPercent,
} from "./copy"
import {
  ACTION_COPY,
  RUN_COPY,
  formatFilter,
  formatReason,
  journalKind,
  toFiniteNumber,
} from "./derive"
import {
  useBotJournal,
  useBotOverview,
  useBotPerformance,
  useBotPositions,
  useRefreshBot,
} from "./hooks"
import {
  ErrorLine,
  HintLine,
  KeyValueRow,
  LoadingLine,
  NoteLine,
  SectionCard,
} from "./ui"

const RUN_TONE: Record<string, string> = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-primary/15 text-primary",
  good: "bg-price-up/15 text-price-up",
  bad: "bg-destructive/15 text-destructive",
}

const ACTION_TONE: Record<string, string> = {
  good: "bg-price-up/15 text-price-up",
  bad: "bg-destructive/15 text-destructive",
  info: "bg-primary/15 text-primary",
  muted: "bg-muted text-muted-foreground",
  warn: "bg-price-ref/15 text-price-ref",
}

/** One line naming which saved conditions the Bot currently evaluates. */
function conditionsText(conditions: BotConditions): string {
  switch (conditions.state) {
    case "waiting_for_conditions":
      return "Chờ thiết lập điều kiện."
    case "entry_enabled":
      return conditions.has_active_sell
        ? "Đã bật Mua và Bán."
        : "Đã bật điều kiện Mua."
    case "exit_only":
    case "protection_only":
      return "Chỉ xét điều kiện Bán."
  }
}

/** Bot vs VN-Index return lines; nothing is drawn with fewer than two sessions. */
function PerformanceChart({ performance }: { performance: BotPerformance }) {
  const points = performance.series.filter(
    (point) => point.nav_vnd != null && point.bot_return_since_base != null
  )
  if (points.length < 2) {
    return <NoteLine>Chưa đủ hai phiên để vẽ đường hiệu suất.</NoteLine>
  }

  const botValues = points.map(
    (point) => toFiniteNumber(point.bot_return_since_base) ?? 0
  )
  const indexValues = points.map((point) =>
    toFiniteNumber(point.vnindex_return_since_base)
  )
  const all = [
    ...botValues,
    ...indexValues.filter((value): value is number => value != null),
  ]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const toPath = (values: (number | null)[]) => {
    const usable = values
      .map((value, index) => ({ value, index }))
      .filter(
        (entry): entry is { value: number; index: number } =>
          entry.value != null
      )
    if (usable.length < 2) return null
    return usable
      .map(
        (entry, order) =>
          `${order === 0 ? "M" : "L"} ${(entry.index / (points.length - 1)) * 100} ${32 - ((entry.value - min) / span) * 32}`
      )
      .join(" ")
  }
  const botPath = toPath(botValues)
  const indexPath = performance.comparison_available
    ? toPath(indexValues)
    : null

  return (
    <div className="space-y-1">
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label="Biểu đồ tỷ suất Bot và VN-Index cùng kỳ"
      >
        <line
          x1="0"
          y1={32 - ((0 - min) / span) * 32}
          x2="100"
          y2={32 - ((0 - min) / span) * 32}
          className="stroke-border"
          strokeWidth="0.3"
        />
        {indexPath && (
          <path
            d={indexPath}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth="0.6"
          />
        )}
        {botPath && (
          <path
            d={botPath}
            fill="none"
            className="stroke-primary"
            strokeWidth="0.9"
          />
        )}
      </svg>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-primary" />
          Bot IQX
        </span>
        {performance.comparison_available && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-muted-foreground" />
            VN-Index
          </span>
        )}
      </div>
    </div>
  )
}

export function BotPanel() {
  const overview = useBotOverview()
  const hasBot = Boolean(overview.data?.bot)
  const positions = useBotPositions(hasBot)
  const journal = useBotJournal(hasBot)
  const performance = useBotPerformance(hasBot)
  const refresh = useRefreshBot()

  const data = overview.data
  const run = data?.bot_run
  const runCopy = run ? (RUN_COPY[run.status] ?? RUN_COPY.idle) : null
  const refreshing =
    overview.isFetching || positions.isFetching || performance.isFetching
  const journalItems = journal.data?.pages.flatMap((page) => page.items) ?? []
  const journalIssues = journal.data?.pages.flatMap((page) => page.issues) ?? []
  const account = data?.account ?? null
  const pnl = account ? toFiniteNumber(account.pnl_total_net_vnd) : null
  const pnlTone = pnl == null || pnl === 0 ? undefined : pnl > 0 ? "up" : "down"

  return (
    <SidebarPanel
      title="Bot"
      description="Tài khoản Bot riêng · mô phỏng theo giá đóng cửa"
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Làm mới dữ liệu Bot"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      }
    >
      {overview.isPending ? (
        <p
          className="flex items-center gap-2 text-xs text-muted-foreground"
          aria-label="Đang tải Bot"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Đang tải Bot…
        </p>
      ) : overview.isError || !data ? (
        <ErrorLine
          text="Không tải được Bot của bạn. Vui lòng thử lại."
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <div className="space-y-3">
          <SectionCard title="Trạng thái Bot">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <Badge variant="outline" className="h-4 px-1.5 text-[11px]">
                Mô phỏng theo giá đóng cửa
              </Badge>
            </div>
            {data.conditions && (
              <div className="space-y-1" aria-label="Điều kiện Bot">
                <p className="text-xs">{conditionsText(data.conditions)}</p>
                <HintLine>{`${formatInt(data.conditions.buy_condition_count)} điều kiện Mua · ${formatInt(data.conditions.sell_condition_count)} điều kiện Bán`}</HintLine>
                {data.conditions.config_status === "pending" &&
                  data.conditions.effective_session &&
                  data.conditions.saved_revision != null && (
                    <HintLine>{`Bản #${formatInt(data.conditions.saved_revision)} có hiệu lực từ phiên ${formatDateOnly(data.conditions.effective_session)}`}</HintLine>
                  )}
              </div>
            )}
            {runCopy && run && (
              <div role="status" aria-live="polite" className="space-y-1">
                <span
                  className={cn(
                    "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold",
                    RUN_TONE[runCopy.tone]
                  )}
                >
                  {runCopy.label}
                </span>
                <p className="text-xs">{runCopy.text}</p>
                {run.processed_unseen_sessions > 1 &&
                  run.status === "succeeded" && (
                    <p className="text-xs">{`Đã xử lý ${formatInt(run.processed_unseen_sessions)} phiên thành công kể từ lần bạn xem gần nhất.`}</p>
                  )}
                {run.last_updated_at && (
                  <HintLine>{`Cập nhật ${formatDateTimeVn(run.last_updated_at)}`}</HintLine>
                )}
              </div>
            )}
            {run && run.issues.length > 0 && (
              <div aria-label="Vấn đề xử lý Bot" className="space-y-1">
                {run.issues.map((issue, index) => (
                  <NoteLine
                    key={`${issue.code}-${index}`}
                    tone={run.status === "failed" ? "warn" : undefined}
                  >
                    {`${issue.symbol ? `${issue.symbol}: ` : ""}${formatReason(issue.code, issue.detail)}`}
                  </NoteLine>
                ))}
              </div>
            )}
          </SectionCard>

          {!data.bot ? (
            <SectionCard title="Tài khoản Bot">
              <NoteLine>
                Tài khoản Bot chưa sẵn sàng. Việc mở màn này không tạo Bot hoặc
                cấp vốn; hãy làm mới sau.
              </NoteLine>
            </SectionCard>
          ) : (
            <>
              <SectionCard title="Hiệu suất">
                {performance.isPending ? (
                  <LoadingLine label="Đang tải hiệu suất Bot…" />
                ) : performance.isError ? (
                  <ErrorLine
                    text="Không tải được dữ liệu hiệu suất."
                    onRetry={() => void performance.refetch()}
                  />
                ) : !account ? (
                  <NoteLine>Chưa có dữ liệu tài khoản Bot.</NoteLine>
                ) : (
                  <>
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                      <KeyValueRow
                        label="Tổng tài sản (NAV)"
                        value={
                          account.nav_vnd == null
                            ? "Chưa định giá"
                            : formatMoney(toFiniteNumber(account.nav_vnd))
                        }
                      />
                      <KeyValueRow
                        label="Tiền mặt"
                        value={formatMoney(toFiniteNumber(account.cash_vnd))}
                      />
                      <KeyValueRow
                        label="P&L ròng"
                        value={
                          account.pnl_total_net_vnd == null
                            ? "Chưa định giá"
                            : formatMoney(pnl)
                        }
                        tone={pnlTone}
                      />
                      <KeyValueRow
                        label="Tỷ suất từ khi kích hoạt"
                        value={
                          account.return_total == null
                            ? "Chưa định giá"
                            : formatRatioPercent(
                                toFiniteNumber(account.return_total),
                                true
                              )
                        }
                        tone={pnlTone}
                      />
                    </div>
                    {!account.valuation_complete && (
                      <NoteLine tone="warn">
                        NAV chưa định giá đầy đủ do thiếu giá đóng cửa của một
                        hoặc nhiều vị thế.
                      </NoteLine>
                    )}
                    {performance.data && (
                      <PerformanceChart performance={performance.data} />
                    )}
                    {performance.data?.base && (
                      <HintLine>
                        {`Ngày gốc ${formatDateOnly(performance.data.base.trading_date)} · NAV gốc ${formatMoney(toFiniteNumber(performance.data.base.bot_nav_vnd))}`}
                        {performance.data.comparison_available
                          ? ` · VN-Index gốc ${formatNumber(toFiniteNumber(performance.data.base.vnindex_value))}`
                          : ". Chưa có đủ dữ liệu VN-Index cùng kỳ để so sánh."}
                      </HintLine>
                    )}
                    <HintLine>{`Dữ liệu đến phiên ${formatDateOnly(account.as_of_session)}. P&L đã gồm phí và thuế được ghi trong sổ Bot.`}</HintLine>
                  </>
                )}
              </SectionCard>

              <SectionCard title="Danh mục">
                {positions.isPending ? (
                  <LoadingLine label="Đang tải danh mục Bot…" />
                ) : positions.isError ? (
                  <ErrorLine
                    text="Không tải được danh mục Bot."
                    onRetry={() => void positions.refetch()}
                  />
                ) : (positions.data?.items.length ?? 0) === 0 ? (
                  <NoteLine>Bot chưa có vị thế mở.</NoteLine>
                ) : (
                  <div className="space-y-2">
                    {positions.data?.items.map((position) => {
                      const itemPnl = toFiniteNumber(
                        position.unrealized_pnl_net_vnd
                      )
                      return (
                        <article
                          key={position.id}
                          aria-label={`Vị thế ${position.symbol}`}
                          className="space-y-1 rounded-md border border-border bg-background/40 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-heading text-sm font-bold">
                              {position.symbol}
                            </span>
                            {position.sector && (
                              <span className="text-xs text-muted-foreground">
                                {position.sector}
                              </span>
                            )}
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                itemPnl == null
                                  ? "text-muted-foreground"
                                  : itemPnl > 0
                                    ? "text-price-up"
                                    : itemPnl < 0
                                      ? "text-price-down"
                                      : ""
                              )}
                            >
                              {position.unrealized_pnl_net_vnd == null
                                ? "-"
                                : formatMoney(itemPnl)}
                            </span>
                          </div>
                          <dl className="space-y-0.5">
                            <KeyValueRow
                              label="Khối lượng"
                              value={`${formatNumber(position.qty)} CP`}
                            />
                            <KeyValueRow
                              label="Tỷ trọng"
                              value={
                                position.weight_pct == null
                                  ? "-"
                                  : formatPercent(
                                      toFiniteNumber(position.weight_pct)
                                    )
                              }
                            />
                            <KeyValueRow
                              label="Giá mua"
                              value={formatMoney(
                                toFiniteNumber(position.entry_price_vnd)
                              )}
                            />
                            <KeyValueRow
                              label="Đóng cửa"
                              value={formatMoney(
                                toFiniteNumber(position.current_close_vnd)
                              )}
                            />
                            <KeyValueRow
                              label="Phiên mua"
                              value={formatDateOnly(position.opened_session)}
                            />
                          </dl>
                          {!positions.data?.valuation_complete && (
                            <HintLine>
                              Chưa có giá đóng cửa hợp lệ cho phiên đang xem.
                            </HintLine>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Nhật ký">
                {journal.isPending ? (
                  <LoadingLine label="Đang tải nhật ký Bot…" />
                ) : journal.isError ? (
                  <ErrorLine
                    text="Không tải được nhật ký Bot."
                    onRetry={() => void journal.refetch()}
                  />
                ) : journalItems.length === 0 ? (
                  <NoteLine>Chưa có bản ghi xử lý.</NoteLine>
                ) : (
                  <div className="space-y-2">
                    {journalIssues.map((issue, index) => (
                      <NoteLine
                        key={`${issue.code}-${index}`}
                        tone="warn"
                      >{`${issue.symbol ? `${issue.symbol}: ` : ""}${formatReason(issue.code, issue.detail)}`}</NoteLine>
                    ))}
                    {journalItems.map((item) => {
                      const copy = ACTION_COPY[item.action] ?? {
                        label: item.action,
                        tone: "muted" as const,
                      }
                      const kind = journalKind(item)
                      const fee = toFiniteNumber(item.execution?.fee_vnd)
                      const tax = toFiniteNumber(item.execution?.tax_vnd)
                      return (
                        <article
                          key={item.id}
                          className="space-y-1 rounded-md border border-border bg-background/40 p-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold",
                                ACTION_TONE[copy.tone]
                              )}
                            >
                              {copy.label}
                            </span>
                            {item.symbol && (
                              <strong className="text-xs">{item.symbol}</strong>
                            )}
                            <time
                              dateTime={item.trading_date}
                              className="ml-auto text-xs text-muted-foreground"
                            >
                              {formatDateOnly(item.trading_date)}
                            </time>
                          </div>
                          <p className="text-xs">
                            {formatReason(item.reason_code, item.reason)}
                          </p>
                          {kind === "execution" && item.execution && (
                            <dl className="space-y-0.5">
                              <KeyValueRow
                                label="Khối lượng"
                                value={`${formatNumber(item.execution.qty)} CP`}
                              />
                              <KeyValueRow
                                label="Giá đóng cửa"
                                value={formatMoney(
                                  toFiniteNumber(item.execution.price_vnd)
                                )}
                              />
                              <KeyValueRow
                                label="Giá trị"
                                value={formatMoney(
                                  toFiniteNumber(item.execution.gross_value_vnd)
                                )}
                              />
                              <KeyValueRow
                                label="Phí / thuế"
                                value={
                                  fee == null && tax == null
                                    ? "-"
                                    : formatMoney((fee ?? 0) + (tax ?? 0))
                                }
                              />
                            </dl>
                          )}
                          {item.supporting_count != null && (
                            <HintLine>{`(policy cũ) ${formatInt(item.supporting_count)}/4 lớp Ủng hộ`}</HintLine>
                          )}
                          {item.threshold_vnd != null && (
                            <HintLine>{`Mốc kích hoạt: ${formatMoney(toFiniteNumber(item.threshold_vnd))}`}</HintLine>
                          )}
                          {item.filter_ids.length > 0 && (
                            <HintLine>{`Nguồn săn: ${item.filter_ids.map(formatFilter).join(", ")}`}</HintLine>
                          )}
                        </article>
                      )
                    })}
                    {journal.hasNextPage && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={journal.isFetchingNextPage}
                        onClick={() => void journal.fetchNextPage()}
                      >
                        {journal.isFetchingNextPage ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : null}
                        Xem thêm nhật ký
                      </Button>
                    )}
                  </div>
                )}
              </SectionCard>
            </>
          )}

          <SectionCard title="Nguyên tắc Bot">
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>Vốn khởi tạo 100.000.000 đồng, tài khoản riêng, cấp một lần.</li>
              <li>Mua mới trong VN30 hoặc danh mục đã áp dụng; bán mọi mã đang giữ theo điều kiện Bán đang có hiệu lực.</li>
              <li>Mỗi lần mua dùng 12% giá trị danh mục tham chiếu, gồm phí; tối đa 2 lần mua mới mỗi phiên và 30% tỷ trọng mỗi mã.</li>
              <li>Không mua thêm mã đang giữ. Không có cắt lỗ, chốt lời hay giới hạn thời gian giữ tự động.</li>
            </ul>
            <HintLine>
              Lưu cấu hình hoặc áp dụng danh mục không tạo giao dịch ngay; thay
              đổi có hiệu lực từ phiên giao dịch kế tiếp.
            </HintLine>
          </SectionCard>

          <div className="flex items-start gap-2 rounded-md border border-price-ref/40 bg-price-ref/5 p-2 text-xs leading-snug text-price-ref">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {data.disclosure}
          </div>
        </div>
      )}
    </SidebarPanel>
  )
}
