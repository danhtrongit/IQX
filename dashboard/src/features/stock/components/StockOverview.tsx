import type { ReactNode } from "react"
import { Spin } from "@arco-design/web-react"
import {
  IconArrowFall,
  IconArrowRise,
  IconFile,
  IconUser,
} from "@arco-design/web-react/icon"
import { usePrice } from "@/features/market-data"
import { StockLogo } from "@/features/navigation/StockLogo"
import { useStockOverview } from "../hooks"
import { fmtBillion, fmtPctFraction, fmtPrice, fmtVnd } from "../format"
import { IconBriefcase, IconLayers } from "../icons"

/** Building2 (industry) — small inline glyph since Arco lacks it. */
function IconBuilding(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  )
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--color-border-2)]/40 py-[5px] last:border-0">
      <span className="text-xs text-[var(--color-text-3)]">{label}</span>
      <span
        className={`text-right text-xs tabular-nums ${
          bold ? "font-bold text-[var(--color-text-1)]" : "text-[var(--color-text-2)]"
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function SectionHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 pb-1.5 pt-1">
      <span className="text-[var(--color-text-3)]">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
        {title}
      </span>
    </div>
  )
}

export function StockOverview({ symbol }: { symbol: string }) {
  const { data, isLoading } = useStockOverview(symbol)
  const { data: liveData } = usePrice(symbol)

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    )
  }

  const { profile, ratio, shareholders, managers } = data
  const fr = ratio

  // Live MSN price (x1000 format).
  const price = liveData?.closePrice || 0
  const change = liveData?.priceChange || 0
  const changePct = liveData?.percentChange || 0
  // VCI 52w values are raw VND.
  const high52 = profile.highestPrice1Year || 0
  const low52 = profile.lowestPrice1Year || 0

  const priceVnd = price * 1000
  const rangeWidth = high52 - low52
  const rangePos = rangeWidth > 0 ? ((priceVnd - low52) / rangeWidth) * 100 : 50

  const hasIcb = profile.icbName2 || profile.icbName3 || profile.icbName4

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid min-h-0 grid-cols-1 divide-y divide-[var(--color-border-2)]/40 md:grid-cols-3 md:divide-x md:divide-y-0">
        {/* ── Left: Price + Valuation + Profitability ── */}
        <div className="space-y-3 p-4">
          <div>
            <div className="mb-1 flex items-center gap-3">
              <StockLogo symbol={symbol} size={36} />
              <div>
                <span className="text-sm font-bold text-[var(--color-text-1)]">
                  {profile.organShortName || symbol}
                </span>
                <p className="max-w-[200px] truncate text-[10px] text-[var(--color-text-3)]">
                  {profile.organName}
                </p>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-[var(--color-text-1)]">
                {price ? fmtPrice(price) : "—"}
              </span>
              {change !== 0 && (
                <span
                  className={`flex items-center gap-0.5 text-sm font-semibold ${
                    change >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {change >= 0 ? <IconArrowRise /> : <IconArrowFall />}
                  {change >= 0 ? "+" : ""}
                  {fmtPrice(Math.abs(change))} ({changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%)
                </span>
              )}
            </div>

            {high52 > 0 && (
              <div className="mt-2.5 space-y-1">
                <div className="flex justify-between text-[10px] tabular-nums text-[var(--color-text-3)]">
                  <span>{fmtVnd(low52)}</span>
                  <span>52 tuần</span>
                  <span>{fmtVnd(high52)}</span>
                </div>
                <div className="relative h-1 rounded-full bg-[var(--color-fill-3)]">
                  <div
                    className="h-full rounded-full bg-[rgb(var(--primary-6))]/40"
                    style={{ width: `${rangePos}%` }}
                  />
                  <div
                    className="absolute top-1/2 size-2.5 rounded-full border-2 border-[var(--color-bg-2)] bg-[rgb(var(--primary-6))] shadow"
                    style={{
                      left: `${Math.max(2, Math.min(98, rangePos))}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <section>
            <SectionHead icon={<IconLayers />} title="Định giá" />
            <InfoRow label="Vốn hóa" value={fr?.marketCap ? fmtBillion(fr.marketCap) : "—"} bold />
            <InfoRow label="P/E" value={fr?.pe?.toFixed(2) ?? "—"} />
            <InfoRow label="P/B" value={fr?.pb?.toFixed(2) ?? "—"} />
            <InfoRow label="EPS" value={fr?.eps ? fmtVnd(fr.eps) + " VND" : "—"} />
            <InfoRow label="BVPS" value={fr?.bvps ? fmtVnd(fr.bvps) + " VND" : "—"} />
          </section>

          <section>
            <SectionHead icon={<IconArrowRise />} title="Sinh lợi" />
            <InfoRow label="ROE" value={fmtPctFraction(fr?.roe)} />
            <InfoRow label="ROA" value={fmtPctFraction(fr?.roa)} />
            <InfoRow label="D/E" value={fr?.de?.toFixed(1) ?? "—"} />
            <InfoRow label="Cổ tức" value={fr?.dividend ? fmtVnd(fr.dividend) + " VND" : "0 VND"} />
          </section>

          <section>
            <SectionHead icon={<IconUser />} title="Sở hữu NN" />
            <InfoRow
              label="Tỷ lệ sở hữu"
              value={
                profile.foreignCurrentPercent != null
                  ? profile.foreignCurrentPercent.toFixed(2) + "%"
                  : "—"
              }
            />
            <InfoRow
              label="Room còn lại"
              value={profile.foreignCurrentRoom != null ? fmtVnd(profile.foreignCurrentRoom) : "—"}
            />
          </section>
        </div>

        {/* ── Middle: Shareholders + Management ── */}
        <div className="space-y-4 p-4">
          {shareholders.length > 0 && (
            <section>
              <SectionHead icon={<IconUser />} title="Cổ đông lớn" />
              <div>
                {shareholders.slice(0, 8).map((sh, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 border-b border-[var(--color-border-2)]/40 py-[6px] last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-2)]">
                      {sh.ownerFullName}
                    </span>
                    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--color-text-1)]">
                      {sh.percentage != null ? sh.percentage.toFixed(2) + "%" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {managers.length > 0 && (
            <section>
              <SectionHead icon={<IconBriefcase />} title="Ban lãnh đạo" />
              <div>
                {managers.slice(0, 6).map((mg, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 border-b border-[var(--color-border-2)]/40 py-[6px] last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[var(--color-text-1)]">
                        {mg.fullName}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-3)]">
                        {mg.positionName}
                      </span>
                    </div>
                    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--color-text-1)]">
                      {mg.percentage != null && mg.percentage > 0
                        ? mg.percentage.toFixed(2) + "%"
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Right: Intro + ICB + Basic Info ── */}
        <div className="space-y-4 p-4">
          {profile.companyProfile && (
            <section>
              <SectionHead icon={<IconFile />} title="Giới thiệu" />
              <p className="whitespace-pre-line text-xs leading-[1.6] text-[var(--color-text-3)]">
                {profile.companyProfile.length > 600
                  ? profile.companyProfile.slice(0, 600) + "..."
                  : profile.companyProfile}
              </p>
            </section>
          )}

          {hasIcb && (
            <section>
              <SectionHead icon={<IconBuilding />} title="Phân ngành ICB" />
              <div>
                {profile.icbName2 && (
                  <div className="flex items-center gap-2 border-b border-[var(--color-border-2)]/40 py-[5px]">
                    <span className="w-5 text-[10px] text-[var(--color-text-3)]">L2</span>
                    <span className="text-xs text-[var(--color-text-1)]">{profile.icbName2}</span>
                  </div>
                )}
                {profile.icbName3 && (
                  <div className="flex items-center gap-2 border-b border-[var(--color-border-2)]/40 py-[5px]">
                    <span className="w-5 text-[10px] text-[var(--color-text-3)]">L3</span>
                    <span className="text-xs text-[var(--color-text-1)]">{profile.icbName3}</span>
                  </div>
                )}
                {profile.icbName4 && (
                  <div className="flex items-center gap-2 py-[5px]">
                    <span className="w-5 text-[10px] text-[var(--color-text-3)]">L4</span>
                    <span className="text-xs text-[var(--color-text-1)]">{profile.icbName4}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <SectionHead icon={<IconLayers />} title="Thông tin cơ bản" />
            <InfoRow label="Sàn" value={liveData?.exchange || profile.exchange || "—"} />
            <InfoRow
              label="SLCP lưu hành"
              value={profile.issueShare ? fmtVnd(profile.issueShare) : "—"}
            />
            <InfoRow
              label="KL TB 2 tuần"
              value={
                profile.averageMatchVolume2Week
                  ? fmtVnd(profile.averageMatchVolume2Week)
                  : "—"
              }
            />
          </section>
        </div>
      </div>
    </div>
  )
}
