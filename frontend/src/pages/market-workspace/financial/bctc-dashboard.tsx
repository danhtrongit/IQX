import { Fragment, type ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"

import { PremiumGate } from "../components/premium-gate"
import { RadarScorecard, type RadarDim } from "./charts/radar-scorecard"
import { AiMemo } from "./components/ai-memo"
import {
  AssetQualityBodyB,
  BusinessBodyA,
  CashflowBodyA,
  DividendBody,
  EarningBodyB,
  EfficiencyBodyB,
  FinancialBody,
  HealthBodyA,
  ValuationBody,
} from "./components/blocks"
import { HeroCard } from "./components/hero-card"
import { BlockHeader, QuestionBlock } from "./components/question-block"
import { isNum } from "./format"
import { useBctcDashboard, useBctcNarrative } from "./hooks"
import type {
  BctcBusinessBlockA,
  BctcBusinessBlockB,
  BctcCashflowBlockA,
  BctcCashflowBlockB,
  BctcHealthBlockA,
  BctcHealthBlockB,
} from "./types"

/* ── block order (SPEC §2.1) ───────────────────────────────────────────────── */

/**
 *   0  Thẻ điểm sức khỏe        (không đánh số)
 *   1  Câu chuyện doanh nghiệp
 *   2  Giá đang đắt hay rẻ?      (Định giá)
 *   3  Bức tranh tài chính
 *   4  Kinh doanh có ổn không?   (A) / Ngân hàng kiếm tiền thế nào? (B)
 *   5  Tiền có thật không?       (A) / Vận hành có hiệu quả không?  (B)
 *   6  Sức khỏe tài chính        (A) / Chất lượng tài sản           (B)
 *   7  Cổ đông nhận được gì?     (Cổ tức)
 *
 * The sequence is CONFIG — the render layer walks this array, so re-ordering
 * the story is a change here and nowhere else.
 */
export type BlockId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export const BLOCK_ORDER: BlockId[] = [0, 1, 2, 3, 4, 5, 6, 7]

/* ── template guards ───────────────────────────────────────────────────────── */

/**
 * `blocks.business|cashflow|health` each carry two shapes and the payload's
 * `template` flag selects which. The discriminator is a sibling field, so the
 * shapes are told apart by their own keys here.
 */
function isBankBusiness(b: BctcBusinessBlockA | BctcBusinessBlockB): b is BctcBusinessBlockB {
  return "nim_series" in b
}

function isBankCashflow(b: BctcCashflowBlockA | BctcCashflowBlockB): b is BctcCashflowBlockB {
  return "cir_series" in b
}

function isCorpHealth(h: BctcHealthBlockA | BctcHealthBlockB): h is BctcHealthBlockA {
  return "sub_c" in h
}

/* ── states ────────────────────────────────────────────────────────────────── */

/** Honest loading state: spinner + skeleton placeholders, no tour targets yet. */
function DashboardSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-5">
      <div className="flex items-center justify-center gap-2 rounded-lg bg-card p-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Đang tải dữ liệu {symbol}…
      </div>
      {[190, 260, 210, 245, 220, 300, 210, 170, 150].map((height, i) => (
        <Skeleton key={i} className="w-full rounded-lg" style={{ height }} />
      ))}
    </div>
  )
}

/* ── main ──────────────────────────────────────────────────────────────────── */

/**
 * BCTC storytelling dashboard (SPEC §2–§3). Walks BLOCK_ORDER and emits:
 *   0 → hero + radar scorecard
 *   1 → AiMemo (premium narrative behind PremiumGate)
 *   2–7 → QuestionBlock with the block's charts/numbers + the narrative answer
 * Template A vs B branches the content + narrative keys of blocks 3–6, and the
 * bank variant swaps the middle blocks for Cách kiếm tiền / Hiệu quả vận hành /
 * Chất lượng tài sản. NO verdict badges anywhere; the footer carries the
 * compliance disclaimers (SPEC §8).
 */
export function BctcDashboard({ symbol }: { symbol: string }) {
  const { data, isLoading, isError, refetch } = useBctcDashboard(symbol)
  const { data: narrative } = useBctcNarrative(symbol)

  if (isLoading) return <DashboardSkeleton symbol={symbol} />

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1080px]">
        <PanelState
          title="Không tải được dữ liệu phân tích BCTC"
          description="Vui lòng thử lại."
          action={{ label: "Thử lại", onClick: () => void refetch() }}
        />
      </div>
    )
  }

  // The backend answers a 200 "empty dashboard" (blocks: {}) for symbols with no
  // BCTC periods — status/validator treat it as success, so it reaches here with
  // data present but no blocks. Render the backend's own note instead of
  // crashing on `blocks.valuation`.
  if (!data.blocks?.valuation) {
    return (
      <div className="mx-auto w-full max-w-[1080px]">
        <PanelState
          title={
            data.meta.disclaimers[0] ||
            "Không đủ dữ liệu báo cáo tài chính để dựng phân tích cho mã này."
          }
        />
      </div>
    )
  }

  const isBank = data.template === "B"
  const narrativeBlocks = narrative?.blocks
  const hero = data.hero
  const story = narrative?.story

  const isEstimated = (prefix: string) =>
    data.meta.is_estimated_fields.some((f) => f.startsWith(prefix))

  // radar dims → coerce the B3-optional score/band/value_label into the chart shape
  const radarDims: RadarDim[] = data.radar.dims.map((d) => ({
    key: d.key,
    label: d.label,
    score: isNum(d.score) ? d.score : 0,
    band: d.band ?? "neutral",
    value_label: d.value_label ?? "—",
  }))
  const scored = data.radar.dims.flatMap((d) => (isNum(d.score) ? [d.score] : []))
  const overall = scored.length
    ? scored.reduce((a, s) => a + s, 0) / scored.length / 20
    : undefined

  const renderBlock = (id: BlockId): ReactNode => {
    switch (id) {
      case 0:
        return (
          <HeroCard
            ticker={hero.ticker}
            name={hero.name ?? ""}
            exchange={hero.exchange ?? ""}
            sector={hero.sector ?? ""}
            price={isNum(hero.price) ? hero.price : 0}
            fairValue={isNum(hero.fair_value) ? hero.fair_value : 0}
            upsidePct={isNum(hero.upside_pct) ? hero.upside_pct * 100 : 0}
            verdictOneliner={narrative?.verdict_oneliner ?? "—"}
          >
            <RadarScorecard dims={radarDims} score={overall} />
          </HeroCard>
        )

      case 1:
        return (
          <section className="space-y-3" data-tour-id="tour-bctc-block-1">
            <BlockHeader num={1} title="Câu chuyện doanh nghiệp" />
            <PremiumGate
              featureName="Phân tích BCTC bằng lời"
              description="Câu chuyện doanh nghiệp + điểm mạnh / cần theo dõi do AI tổng hợp trên số liệu đã tính."
            >
              {story ? (
                <AiMemo
                  lead={story.lead}
                  paragraphs={story.paragraphs}
                  strengths={story.strengths}
                  watchlist={story.watchlist}
                />
              ) : (
                <div className="rounded-lg border-l-4 border-l-accent bg-card p-5 sm:p-7">
                  <div className="font-heading text-xl font-medium leading-snug tracking-tight">
                    Phân tích bằng lời do AI tổng hợp từ số liệu đã tính.
                  </div>
                  <div className="mt-3 text-[15px] leading-7 text-muted-foreground">
                    <p>
                      Nâng cấp để xem câu chuyện doanh nghiệp: điểm mạnh, dòng tiền, định giá và các
                      điểm cần theo dõi.
                    </p>
                  </div>
                </div>
              )}
            </PremiumGate>
          </section>
        )

      case 2:
        return (
          <QuestionBlock
            num={2}
            tourId="tour-bctc-block-2"
            title="Giá đang đắt hay rẻ?"
            question="Giá hiện tại đắt hay rẻ?"
            answer={narrativeBlocks?.valuation?.answer ?? ""}
          >
            <ValuationBody block={data.blocks.valuation} template={data.template} />
          </QuestionBlock>
        )

      case 3:
        return (
          <QuestionBlock
            num={3}
            tourId="tour-bctc-block-3"
            title="Bức tranh tài chính"
            question={
              isBank
                ? "Ngân hàng to cỡ nào và cơ cấu ra sao?"
                : "Công ty phình to ra sao, và tiền tăng thêm đến từ đâu?"
            }
            answer={narrativeBlocks?.financial?.answer ?? ""}
          >
            <FinancialBody block={data.blocks.financial} template={data.template} />
          </QuestionBlock>
        )

      case 4: {
        const business = data.blocks.business
        return (
          <QuestionBlock
            num={4}
            tourId="tour-bctc-block-4"
            title={isBank ? "Ngân hàng kiếm tiền thế nào?" : "Kinh doanh có ổn không?"}
            question={
              isBank
                ? "Ngân hàng kiếm tiền ra sao, có bền không?"
                : "Doanh nghiệp kinh doanh có ổn không?"
            }
            answer={(isBank ? narrativeBlocks?.earning : narrativeBlocks?.business)?.answer ?? ""}
          >
            {isBankBusiness(business) ? (
              <EarningBodyB block={business} />
            ) : (
              <BusinessBodyA
                block={business}
                estimated={isEstimated("blocks.business.earnings_quality")}
              />
            )}
          </QuestionBlock>
        )
      }

      case 5: {
        const cashflow = data.blocks.cashflow
        return (
          <QuestionBlock
            num={5}
            tourId="tour-bctc-block-5"
            title={isBank ? "Vận hành có hiệu quả không?" : "Tiền có thật không?"}
            question={
              isBank
                ? "Ngân hàng vận hành có tiết kiệm không?"
                : "Lợi nhuận có biến thành tiền thật không?"
            }
            answer={(isBank ? narrativeBlocks?.efficiency : narrativeBlocks?.cashflow)?.answer ?? ""}
          >
            {isBankCashflow(cashflow) ? (
              <EfficiencyBodyB block={cashflow} />
            ) : (
              <CashflowBodyA block={cashflow} />
            )}
          </QuestionBlock>
        )
      }

      case 6: {
        const health = data.blocks.health
        return (
          <QuestionBlock
            num={6}
            tourId="tour-bctc-block-6"
            title={
              isBank ? "Chất lượng tài sản có tốt không?" : "Sức khỏe tài chính có vững không?"
            }
            question={
              isBank
                ? "Nợ cho vay có xấu nhiều, dự phòng có đủ không?"
                : "Tài chính có đủ vững để vượt khó không?"
            }
            answer={
              (isBank ? narrativeBlocks?.asset_quality : narrativeBlocks?.health)?.answer ?? ""
            }
          >
            {isCorpHealth(health) ? (
              <HealthBodyA block={health} sub={narrativeBlocks?.health?.sub} />
            ) : (
              <AssetQualityBodyB
                block={health}
                sub={narrativeBlocks?.asset_quality?.sub}
                estimated={isEstimated("blocks.health")}
              />
            )}
          </QuestionBlock>
        )
      }

      case 7:
        return (
          <QuestionBlock
            num={7}
            tourId="tour-bctc-block-7"
            title="Cổ đông nhận được gì?"
            question={
              isBank
                ? "Ngân hàng có chia tiền cho cổ đông không?"
                : "Công ty có chia tiền cho cổ đông không?"
            }
            answer={narrativeBlocks?.dividend?.answer ?? ""}
          >
            <DividendBody block={data.blocks.dividend} />
          </QuestionBlock>
        )
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1080px]" data-tour-id="tour-bctc-ready">
      <div className="space-y-10">
        {BLOCK_ORDER.map((id) => (
          <Fragment key={id}>{renderBlock(id)}</Fragment>
        ))}
      </div>

      <footer className="mt-12 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        {data.meta.disclaimers.map((d, i) => (
          <p className="mb-1.5" key={i}>
            {d}
          </p>
        ))}
      </footer>
    </div>
  )
}
