/**
 * "Tổng quan" tab — company profile, valuation/profitability ratios, ownership
 * and management, all from `/market-data/company/*` + `/fundamentals/*`, with
 * the live price from the price board. A missing upstream field renders "—".
 */
import { Building, FileText, Layers, TrendingUp, Users } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatNumber, formatPercent } from "@/lib/format"
import { useQuote } from "@/pages/demo-trading/market/use-quote"

import { fmtBillion, fmtPctFraction, fmtVnd } from "../format"
import { useStockOverview } from "../hooks"

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right text-xs tabular-nums",
          bold ? "font-bold" : "font-medium",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] font-bold tracking-wide uppercase">{title}</span>
    </div>
  )
}

export function StockOverview({ symbol }: { symbol: string }) {
  const overview = useStockOverview(symbol)
  const quote = useQuote(symbol)

  if (overview.isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-5 w-full" />
        ))}
      </div>
    )
  }

  if (overview.isError || !overview.data) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
        Không tải được dữ liệu tổng quan cho {symbol}.
      </div>
    )
  }

  const { profile, ratio, shareholders, managers } = overview.data
  const data = quote.data
  // Price board values are nghìn đồng; 52-week range is raw đồng.
  const price = data?.price ?? null
  const reference = data?.reference ?? null
  const change = price != null && reference != null ? price - reference : null
  const changePct =
    change != null && reference ? (change / reference) * 100 : null
  const high52 = profile.highestPrice1Year / 1000
  const low52 = profile.lowestPrice1Year / 1000
  const rangeWidth = high52 - low52
  const rangePos =
    price != null && rangeWidth > 0
      ? Math.min(98, Math.max(2, ((price - low52) / rangeWidth) * 100))
      : null
  const hasIcb = Boolean(profile.icbName2 || profile.icbName3 || profile.icbName4)

  return (
    <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div>
            <p className="font-heading text-base font-bold">
              {profile.organShortName || symbol}
            </p>
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {profile.organName || symbol}
              {profile.exchange ? ` · ${profile.exchange}` : ""}
            </p>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {price != null ? formatNumber(price) : "—"}
            </span>
            {change != null && changePct != null && (
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  change > 0 ? "text-price-up" : change < 0 ? "text-price-down" : "text-price-ref",
                )}
              >
                {change > 0 ? "+" : ""}
                {formatNumber(change)} ({formatPercent(changePct)})
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">nghìn đồng</span>
          </div>

          {rangePos != null && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>{formatNumber(low52)}</span>
                <span>52 tuần</span>
                <span>{formatNumber(high52)}</span>
              </div>
              <div className="relative h-1 rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/40"
                  style={{ width: `${rangePos}%` }}
                />
                <div
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{ left: `${rangePos}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <section>
          <SectionHead icon={<Layers className="size-3.5" aria-hidden="true" />} title="Định giá" />
          <InfoRow label="Vốn hóa" value={fmtBillion(ratio?.marketCap)} bold />
          <InfoRow label="P/E" value={ratio?.pe?.toFixed(2) ?? "—"} />
          <InfoRow label="P/B" value={ratio?.pb?.toFixed(2) ?? "—"} />
          <InfoRow label="EPS" value={ratio?.eps ? `${fmtVnd(ratio.eps)} VND` : "—"} />
          <InfoRow label="BVPS" value={ratio?.bvps ? `${fmtVnd(ratio.bvps)} VND` : "—"} />
        </section>

        <section>
          <SectionHead
            icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
            title="Sinh lợi"
          />
          <InfoRow label="ROE" value={fmtPctFraction(ratio?.roe)} />
          <InfoRow label="ROA" value={fmtPctFraction(ratio?.roa)} />
          <InfoRow label="D/E" value={ratio?.de?.toFixed(1) ?? "—"} />
          <InfoRow
            label="Cổ tức"
            value={ratio?.dividend ? `${fmtVnd(ratio.dividend)} VND` : "0 VND"}
          />
        </section>

        <section>
          <SectionHead icon={<Users className="size-3.5" aria-hidden="true" />} title="Sở hữu NN" />
          <InfoRow
            label="Tỷ lệ sở hữu"
            value={
              profile.foreignCurrentPercent != null
                ? `${profile.foreignCurrentPercent.toFixed(2)}%`
                : "—"
            }
          />
          <InfoRow
            label="Room còn lại"
            value={
              profile.foreignCurrentRoom != null ? fmtVnd(profile.foreignCurrentRoom) : "—"
            }
          />
        </section>
      </div>

      <div className="space-y-4 p-4">
        <section>
          <SectionHead icon={<Users className="size-3.5" aria-hidden="true" />} title="Cổ đông lớn" />
          {shareholders.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có dữ liệu cổ đông.</p>
          ) : (
            shareholders.slice(0, 8).map((shareholder, index) => (
              <div
                key={`${shareholder.ownerFullName}-${index}`}
                className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-xs">{shareholder.ownerFullName}</span>
                <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                  {shareholder.percentage != null
                    ? `${shareholder.percentage.toFixed(2)}%`
                    : "—"}
                </span>
              </div>
            ))
          )}
        </section>

        <section>
          <SectionHead
            icon={<Building className="size-3.5" aria-hidden="true" />}
            title="Ban lãnh đạo"
          />
          {managers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có dữ liệu ban lãnh đạo.</p>
          ) : (
            managers.slice(0, 6).map((manager, index) => (
              <div
                key={`${manager.fullName}-${index}`}
                className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{manager.fullName}</span>
                  <span className="text-[10px] text-muted-foreground">{manager.positionName}</span>
                </div>
                <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                  {manager.percentage != null && manager.percentage > 0
                    ? `${manager.percentage.toFixed(2)}%`
                    : "—"}
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="space-y-4 p-4">
        {profile.companyProfile && (
          <section>
            <SectionHead
              icon={<FileText className="size-3.5" aria-hidden="true" />}
              title="Giới thiệu"
            />
            <p className="text-xs leading-5 whitespace-pre-line text-muted-foreground">
              {profile.companyProfile.length > 600
                ? `${profile.companyProfile.slice(0, 600)}…`
                : profile.companyProfile}
            </p>
          </section>
        )}

        {hasIcb && (
          <section>
            <SectionHead
              icon={<Building className="size-3.5" aria-hidden="true" />}
              title="Phân ngành ICB"
            />
            {[
              ["L2", profile.icbName2],
              ["L3", profile.icbName3],
              ["L4", profile.icbName4],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([level, value]) => (
                <div
                  key={level}
                  className="flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0"
                >
                  <span className="w-5 text-[10px] text-muted-foreground">{level}</span>
                  <span className="text-xs">{value}</span>
                </div>
              ))}
          </section>
        )}

        <section>
          <SectionHead
            icon={<Layers className="size-3.5" aria-hidden="true" />}
            title="Thông tin cơ bản"
          />
          <InfoRow label="Sàn" value={profile.exchange || "—"} />
          <InfoRow
            label="SLCP lưu hành"
            value={profile.issueShare ? fmtVnd(profile.issueShare) : "—"}
          />
          <InfoRow
            label="KL TB 2 tuần"
            value={
              profile.averageMatchVolume2Week ? fmtVnd(profile.averageMatchVolume2Week) : "—"
            }
          />
        </section>
      </div>
    </div>
  )
}
