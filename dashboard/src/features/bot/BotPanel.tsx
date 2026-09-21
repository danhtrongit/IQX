import { useMemo } from "react"
import { useIdentity } from "@/features/journey-identity/hooks"
import { MascotAvatar } from "@/features/journey-identity/mascot-2d/MascotAvatar"
import type { MascotId } from "@/features/journey-identity/types"
import { Alert, Button, Card, Empty, Spin, Tag } from "@arco-design/web-react"
import { IconRefresh } from "@arco-design/web-react/icon"
import { Link } from "react-router"
import { PerformanceChart } from "./components/PerformanceChart"
import {
  formatDate,
  formatDateTime,
  formatFilter,
  formatNumber,
  formatPercent,
  formatReason,
  formatVnd,
  toFiniteNumber,
} from "./format"
import {
  useBotJournal,
  useBotOverview,
  useBotPerformance,
  useBotPositions,
  useRefreshBot,
} from "./hooks"
import type {
  BotJournalEntry,
  BotIssue,
  BotOverview,
  BotPerformance,
  BotPosition,
  BotRunStatus,
  DecimalValue,
} from "./types"

const RUN_COPY: Record<BotRunStatus, { label: string; color: "gray" | "blue" | "green" | "red"; text: string }> = {
  idle: { label: "Đang chờ", color: "gray", text: "Bot đang chờ phiên giao dịch tiếp theo." },
  running: {
    label: "Đang xử lý",
    color: "blue",
    text: "Bot đang ghi nhận và đối soát dữ liệu phiên.",
  },
  succeeded: {
    label: "Đã xử lý",
    color: "green",
    text: "Bot đã xử lý xong phiên. Trạng thái này không có nghĩa phiên có lãi.",
  },
  failed: {
    label: "Cần kiểm tra",
    color: "red",
    text: "Bot chưa xử lý xong phiên. Dữ liệu hoặc sổ sách đang cần được kiểm tra.",
  },
}

const ACTION_COPY = {
  buy: { label: "Mua", color: "green" as const },
  sell: { label: "Bán", color: "red" as const },
  hold: { label: "Giữ", color: "blue" as const },
  skip: { label: "Bỏ qua", color: "gray" as const },
  issue: { label: "Lỗi", color: "orange" as const },
}

interface BotPanelViewProps {
  mascotId?: MascotId
  overview: BotOverview
  positions?: BotPosition[]
  journal?: BotJournalEntry[]
  journalIssues?: BotIssue[]
  performance?: BotPerformance
  detailLoading?: boolean
  positionsError?: boolean
  journalError?: boolean
  performanceError?: boolean
  refreshing?: boolean
  hasNextJournalPage?: boolean
  loadingNextJournalPage?: boolean
  onRefresh: () => void
  onLoadMoreJournal?: () => void
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <Card className="!rounded-xl" bordered>
        <h2 id={id} className="mb-3 text-sm font-bold text-[var(--color-text-1)]">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-3">
      <p className="text-[11px] text-[var(--color-text-3)]">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-bold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-[var(--color-text-1)]"}`}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function formatValuationVnd(value: DecimalValue | null) {
  return value === null ? "Chưa định giá" : formatVnd(value)
}

function formatValuationPercent(value: DecimalValue | null) {
  return value === null ? "Chưa định giá" : formatPercent(value, { signed: true })
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return <div role="alert"><Alert type="error" showIcon content={children} /></div>
}

function PerformanceSection({
  overview,
  performance,
  loading,
  error,
}: {
  overview: BotOverview
  performance?: BotPerformance
  loading?: boolean
  error?: boolean
}) {
  const account = overview.account
  const pnl = toFiniteNumber(account?.pnlTotalNetVnd)
  if (loading) return <div className="flex justify-center py-8"><Spin /></div>
  if (error) return <ErrorBlock>Không tải được dữ liệu hiệu suất.</ErrorBlock>
  if (!account) return <Empty description="Chưa có dữ liệu tài khoản Bot" />
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Tổng tài sản (NAV)" value={formatValuationVnd(account.navVnd)} />
        <Metric label="Tiền mặt" value={formatVnd(account.cashVnd)} />
        <Metric
          label="P&L ròng"
          value={formatValuationVnd(account.pnlTotalNetVnd)}
          tone={pnl === null || pnl === 0 ? undefined : pnl > 0 ? "up" : "down"}
        />
        <Metric
          label="Tỷ suất từ khi kích hoạt"
          value={formatValuationPercent(account.returnTotal)}
          tone={pnl === null || pnl === 0 ? undefined : pnl > 0 ? "up" : "down"}
        />
      </div>
      {!account.valuationComplete && (
        <Alert
          type="warning"
          showIcon
          content="NAV chưa định giá đầy đủ do thiếu giá đóng cửa của một hoặc nhiều vị thế."
        />
      )}
      {performance && <PerformanceChart performance={performance} />}
      {performance?.baseDate && (
        <p className="text-[11px] leading-5 text-[var(--color-text-3)]">
          Ngày gốc {formatDate(performance.baseDate)} · NAV gốc {formatVnd(performance.navBaseVnd)}
          {performance.comparisonAvailable
            ? ` · VN-Index gốc ${formatNumber(performance.vnindexBase, 2)}`
            : ". Chưa có đủ dữ liệu VN-Index cùng kỳ để so sánh."}
        </p>
      )}
      {performance && performance.points.length < 2 && (
        <p className="text-xs text-[var(--color-text-3)]">Chưa đủ hai phiên để vẽ đường hiệu suất.</p>
      )}
      <p className="text-[11px] text-[var(--color-text-3)]">
        Dữ liệu đến phiên {formatDate(account.asOf)}. P&L đã gồm phí và thuế được ghi trong sổ Bot.
      </p>
    </div>
  )
}

function PositionsSection({
  positions,
  loading,
  error,
}: {
  positions?: BotPosition[]
  loading?: boolean
  error?: boolean
}) {
  if (loading) return <div className="flex justify-center py-8"><Spin /></div>
  if (error) return <ErrorBlock>Không tải được danh mục Bot.</ErrorBlock>
  if (!positions?.length) return <Empty description="Bot chưa có vị thế mở" />
  return (
    <div className="space-y-3">
      {positions.map((position) => {
        const pnl = toFiniteNumber(position.pnlVnd)
        return (
          <article
            key={position.id}
            className="rounded-lg border border-[var(--color-border-2)] p-3"
            aria-label={`Vị thế ${position.symbol}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold">{position.symbol}</h3>
                {position.sectorName && (
                  <p className="truncate text-[11px] text-[var(--color-text-3)]">{position.sectorName}</p>
                )}
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${pnl === null || pnl === 0 ? "" : pnl > 0 ? "text-up" : "text-down"}`}>
                  {formatVnd(position.pnlVnd)}
                </p>
                {position.pnlPct !== null && (
                  <p className="text-[11px] text-[var(--color-text-3)]">
                    {formatPercent(position.pnlPct, { signed: true })}
                  </p>
                )}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div><dt className="text-[var(--color-text-3)]">Khối lượng</dt><dd>{formatNumber(position.qtyOpen)} CP</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Tỷ trọng</dt><dd>{formatPercent(position.weight, { input: "percent" })}</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Giá mua</dt><dd>{formatVnd(position.entryPriceVnd)}</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Đóng cửa</dt><dd>{formatVnd(position.closePriceVnd)}</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Cắt lỗ</dt><dd className="text-down">{formatVnd(position.stopLossVnd)}</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Chốt lời</dt><dd className="text-up">{formatVnd(position.takeProfitVnd)}</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Biên độ khi mua</dt><dd>{formatVnd(position.amplitudeAtEntryVnd)}</dd></div>
              <div><dt className="text-[var(--color-text-3)]">Phiên mua</dt><dd>{formatDate(position.openedSession)}</dd></div>
            </dl>
            {!position.valuationComplete && (
              <p className="mt-2 text-xs text-[rgb(var(--orange-6))]">Chưa có giá đóng cửa hợp lệ cho phiên đang xem.</p>
            )}
            {!!position.filterIds.length && (
              <div className="mt-3 flex flex-wrap gap-1" aria-label="Nguồn săn mã">
                {position.filterIds.map((filter) => <Tag key={filter} size="small">{formatFilter(filter)}</Tag>)}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function JournalSection({
  entries,
  issues,
  loading,
  error,
  hasNextPage,
  loadingNextPage,
  onLoadMore,
}: {
  entries?: BotJournalEntry[]
  issues?: BotIssue[]
  loading?: boolean
  error?: boolean
  hasNextPage?: boolean
  loadingNextPage?: boolean
  onLoadMore?: () => void
}) {
  if (loading) return <div className="flex justify-center py-8"><Spin /></div>
  if (error) return <ErrorBlock>Không tải được nhật ký Bot.</ErrorBlock>
  if (!entries?.length && !issues?.length) return <Empty description="Chưa có bản ghi xử lý" />
  return (
    <div className="space-y-2">
      {issues?.map((issue, index) => (
        <Alert
          key={`${issue.code}-${issue.symbol ?? "all"}-${index}`}
          type="warning"
          showIcon
          content={`${issue.symbol ? `${issue.symbol}: ` : ""}${formatReason(issue.code, issue.detail)}`}
        />
      ))}
      {(entries ?? []).map((entry) => {
        const action = ACTION_COPY[entry.action]
        const executed = entry.kind === "execution"
        return (
          <article key={entry.id} className="rounded-lg border border-[var(--color-border-2)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Tag color={action.color} size="small">{action.label}</Tag>
                {entry.symbol && <strong>{entry.symbol}</strong>}
              </div>
              <time className="shrink-0 text-[11px] text-[var(--color-text-3)]" dateTime={entry.tradingDate}>
                {formatDate(entry.tradingDate)}
              </time>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-2)]">
              {formatReason(entry.reasonCode, entry.reason)}
            </p>
            {executed && (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div><dt className="text-[var(--color-text-3)]">Khối lượng</dt><dd>{entry.qty === null ? "—" : `${formatNumber(entry.qty)} CP`}</dd></div>
                <div><dt className="text-[var(--color-text-3)]">Giá đóng cửa</dt><dd>{formatVnd(entry.priceVnd)}</dd></div>
                <div><dt className="text-[var(--color-text-3)]">Giá trị</dt><dd>{formatVnd(entry.grossValueVnd)}</dd></div>
                <div><dt className="text-[var(--color-text-3)]">Phí / thuế</dt><dd>{entry.feeVnd === null && entry.taxVnd === null ? "—" : formatVnd((toFiniteNumber(entry.feeVnd) ?? 0) + (toFiniteNumber(entry.taxVnd) ?? 0))}</dd></div>
              </dl>
            )}
            {entry.supportingCount !== null && (
              <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
                {entry.supportingCount}/5 lớp Ủng hộ
              </p>
            )}
            {entry.thresholdVnd !== null && (
              <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                Mốc kích hoạt: {formatVnd(entry.thresholdVnd)}
              </p>
            )}
            {!!entry.filterIds.length && (
              <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                Nguồn săn: {entry.filterIds.map(formatFilter).join(", ")}
              </p>
            )}
          </article>
        )
      })}
      {hasNextPage && onLoadMore && (
        <Button long type="outline" loading={loadingNextPage} onClick={onLoadMore}>
          Xem thêm nhật ký
        </Button>
      )}
    </div>
  )
}

function HowItWorks() {
  return (
    <div className="space-y-3 text-xs leading-5 text-[var(--color-text-2)]">
      <p>
        Bot dùng cùng một chiến lược tiêu chuẩn IQX. Linh thú, kết quả giao dịch thủ công và lịch sử P&L của bạn không thay đổi chiến lược này.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Lấy tối đa 10 mã từ mỗi bộ lọc: Khối ngoại gom, Tự doanh gom, Khối lượng đột biến, Vượt đỉnh 20 phiên và Tăng mạnh kèm khối lượng.</li>
        <li>Chỉ xét mua khi đủ năm lớp, có ít nhất 3/5 lớp Ủng hộ và không có Tin tức hoặc Nội bộ ở mức rất xấu.</li>
        <li>Mỗi lần mua dùng tối đa 12% NAV đã khóa trước giao dịch, gồm phí; tối đa 30% NAV cho một mã và hai giao dịch mua mới mỗi phiên.</li>
        <li>Bot không mua thêm mã đang giữ hoặc mua lại mã vừa bán trong cùng phiên.</li>
        <li>Cắt lỗ và chốt lời được khóa tại giá mua −2× và +4× Biên độ L1. Khi giá đóng cửa chạm mốc, Bot bán mô phỏng toàn bộ tại chính giá đóng cửa phiên đó.</li>
      </ol>
    </div>
  )
}

export function BotPanelView({
  mascotId,
  overview,
  positions,
  journal,
  journalIssues,
  performance,
  detailLoading,
  positionsError,
  journalError,
  performanceError,
  refreshing,
  hasNextJournalPage,
  loadingNextJournalPage,
  onRefresh,
  onLoadMoreJournal,
}: BotPanelViewProps) {
  const run = RUN_COPY[overview.botRun.status]
  const eligible = overview.eligible && Boolean(overview.cap6GraduatedAt)

  return (
    <div className="h-full min-w-0 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4" data-testid="bot-panel">
      <section aria-labelledby="bot-title" className="rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {mascotId && <MascotAvatar mascotId={mascotId} size={40} />}
              <h1 id="bot-title" className="text-lg font-bold">Bot của tôi</h1>
              <Tag color="purple" size="small">Mô phỏng theo giá đóng cửa</Tag>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-2)]">
              Bot demo tự động theo bộ quy tắc tiêu chuẩn IQX
            </p>
            {overview.bot && (
              <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                Chiến lược tiêu chuẩn IQX · phiên bản {overview.bot.strategyVersion}
              </p>
            )}
          </div>
          <Button
            type="text"
            shape="circle"
            icon={<IconRefresh />}
            aria-label="Làm mới dữ liệu Bot"
            loading={refreshing}
            onClick={onRefresh}
          />
        </div>
        <div className="mt-3 flex items-center gap-2" role="status" aria-live="polite">
          <Tag color={run.color}>{run.label}</Tag>
          <p className="text-xs text-[var(--color-text-2)]">{run.text}</p>
        </div>
        {overview.botRun.processedUnseenSessions > 1 && overview.botRun.status === "succeeded" && (
          <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
            Đã xử lý {overview.botRun.processedUnseenSessions} phiên thành công kể từ lần bạn xem gần nhất.
          </p>
        )}
        {overview.botRun.lastUpdatedAt && (
          <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
            Cập nhật {formatDateTime(overview.botRun.lastUpdatedAt)}
          </p>
        )}
        {!!overview.botRun.issues.length && (
          <div className="mt-3 space-y-2" aria-label="Vấn đề xử lý Bot">
            {overview.botRun.issues.map((issue, index) => (
              <Alert
                key={`${issue.code}-${issue.symbol ?? "all"}-${index}`}
                type={overview.botRun.status === "failed" ? "error" : "warning"}
                showIcon
                content={`${issue.symbol ? `${issue.symbol}: ` : ""}${formatReason(issue.code, issue.detail)}`}
              />
            ))}
          </div>
        )}
      </section>

      {!eligible ? (
        <section aria-labelledby="bot-eligibility">
          <Card className="!rounded-xl" bordered>
            <h2 id="bot-eligibility" className="text-sm font-bold">Mở sau khi tốt nghiệp Cấp 6</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-2)]">
              Bạn đang ở Cấp {overview.currentLevel}. Bot chỉ được backend khởi tạo sau khi ghi nhận tốt nghiệp Cấp 6; việc mở màn này không tạo Bot hoặc cấp vốn.
            </p>
            <Link
              to="/dau-truong"
              className="mt-3 inline-flex min-h-11 items-center font-bold text-[rgb(var(--primary-6))] focus-visible:outline focus-visible:outline-2"
            >
              Tiếp tục hành trình Demo Trading
            </Link>
          </Card>
        </section>
      ) : !overview.bot ? (
        <Alert
          type="info"
          showIcon
          title="Bot đang được khởi tạo"
          content="Hệ thống đã ghi nhận tốt nghiệp Cấp 6 nhưng tài khoản Bot chưa sẵn sàng. Hãy làm mới sau."
        />
      ) : (
        <>
          <Section id="bot-performance" title="Hiệu suất">
            <PerformanceSection
              overview={overview}
              performance={performance}
              loading={detailLoading}
              error={performanceError}
            />
          </Section>
          <Section id="bot-positions" title="Danh mục">
            <PositionsSection positions={positions} loading={detailLoading} error={positionsError} />
          </Section>
          <Section id="bot-journal" title="Nhật ký">
            <JournalSection
              entries={journal}
              issues={journalIssues}
              loading={detailLoading}
              error={journalError}
              hasNextPage={hasNextJournalPage}
              loadingNextPage={loadingNextJournalPage}
              onLoadMore={onLoadMoreJournal}
            />
          </Section>
        </>
      )}

      <Section id="bot-rules" title="Bot hoạt động như thế nào">
        <HowItWorks />
      </Section>

      <Section id="bot-guide" title="Hướng dẫn">
        <p className="text-xs leading-5 text-[var(--color-text-2)]">
          Ôn lại năm lớp đánh giá và quy tắc Demo Trading trước khi xem các quyết định của Bot.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/bai-hoc" className="min-h-11 py-3 font-bold text-[rgb(var(--primary-6))] focus-visible:outline focus-visible:outline-2">
            Xem nội dung kiến thức
          </Link>
          <Link to="/dau-truong" className="min-h-11 py-3 font-bold text-[rgb(var(--primary-6))] focus-visible:outline focus-visible:outline-2">
            Mở Demo Trading
          </Link>
        </div>
      </Section>

      <Alert type="warning" showIcon content={overview.disclosure} />
    </div>
  )
}

export function BotPanel() {
  const identity = useIdentity()
  const overview = useBotOverview()
  const enabled = Boolean(overview.data?.eligible && overview.data.bot)
  const positions = useBotPositions(enabled)
  const journal = useBotJournal(enabled)
  const performance = useBotPerformance(enabled)
  const refresh = useRefreshBot()
  const entries = useMemo(
    () => journal.data?.pages.flatMap((page) => page.items) ?? [],
    [journal.data?.pages],
  )
  const journalIssues = useMemo(
    () => journal.data?.pages.flatMap((page) => page.issues) ?? [],
    [journal.data?.pages],
  )

  if (overview.isPending) {
    return <div className="flex min-h-48 items-center justify-center" aria-label="Đang tải Bot"><Spin /></div>
  }
  if (overview.isError || !overview.data) {
    return (
      <div className="p-4">
        <ErrorBlock>Không tải được Bot của bạn. Vui lòng thử lại.</ErrorBlock>
        <Button long className="!mt-3" icon={<IconRefresh />} onClick={() => void overview.refetch()}>
          Thử lại
        </Button>
      </div>
    )
  }

  return (
    <BotPanelView
      mascotId={identity.data?.lifecycle === "mascot" ? identity.data.mascot?.id : undefined}
      overview={overview.data}
      positions={positions.data}
      journal={entries}
      journalIssues={journalIssues}
      performance={performance.data}
      detailLoading={enabled && (positions.isPending || journal.isPending || performance.isPending)}
      positionsError={positions.isError}
      journalError={journal.isError}
      performanceError={performance.isError}
      refreshing={overview.isFetching || positions.isFetching || performance.isFetching}
      hasNextJournalPage={journal.hasNextPage}
      loadingNextJournalPage={journal.isFetchingNextPage}
      onRefresh={() => void refresh()}
      onLoadMoreJournal={() => void journal.fetchNextPage()}
    />
  )
}

export const BotPage = BotPanel
