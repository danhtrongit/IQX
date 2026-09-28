/**
 * «Linh thú» - the identity panel: the server-owned companion profile, the Bot
 * status card, and the Cấp 4+ «Đọc 5 lớp» assessment whose commit-then-reveal
 * protocol produces the identity evidence.
 *
 * The mascot is 100% server-derived (never computed here), and the AI
 * comparison is exposed ONLY from the reveal response: a failed dataset or
 * reveal is reported as unavailable, never as a neutral verdict.
 */
import { useState } from "react"
import { Check, LoaderCircle, Lock, RefreshCw, TriangleAlert } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { errorMessage } from "@/lib/api"
import { CreatureArtwork } from "@/pages/demo-trading/journey/artwork/CreatureArtwork"
import { useIdentity } from "@/pages/demo-trading/journey/use-identity"
import type { MascotId } from "@/pages/demo-trading/journey/types"
import { LOP_DEFS, NHAN_DINH_LABEL, NHAN_DINH_OPTIONS, TONG_SO_LOP, countCungGocNhin, countDongThuan, countRated, formatInt, levelName, type Lop5Partial, type NhanDinhLop } from "./copy"
import { useInsightsLevel, useReadingAssessment } from "./hooks"
import { ErrorLine, HintLine, LoadingLine, NoteLine, SectionCard } from "./ui"

const COMPANION_COPY: Record<MascotId, string> = {
  bach_ho: "Bạch Hổ đồng hành cùng cách bạn quan sát cấu trúc giá và xu hướng.",
  thanh_long: "Thanh Long đồng hành cùng cách bạn theo dõi sự dịch chuyển của dòng vốn.",
  loc_huou: "Lộc Hươu đồng hành cùng cách bạn quan sát thông tin công khai từ doanh nghiệp.",
  phung_hoang: "Phụng Hoàng đồng hành cùng cách bạn đọc tin tức và bối cảnh mới.",
  kim_quy: "Kim Quy đồng hành cùng cách bạn tìm hiểu giá trị doanh nghiệp.",
}

/* ── «Đọc 5 lớp» - commit-then-reveal ──────────────────────────────────── */

function ReadingBlock({ symbol }: { symbol: string }) {
  const [answers, setAnswers] = useState<Lop5Partial>({})
  const reading = useReadingAssessment(symbol, answers)
  const rated = countRated(answers)
  const ai = reading.aiAnswers
  const soDongThuan = countDongThuan(ai)
  const soCungGocNhin = countCungGocNhin(answers, ai)

  return (
    <SectionCard title="Đọc 5 lớp phân tích" flag="Cấp 4+">
      <HintLine>{`Tự chấm từng lớp theo dữ liệu thật của ${symbol}; AI đối chiếu chỉ hiện sau khi bạn chấm đủ ${TONG_SO_LOP} lớp.`}</HintLine>

      {LOP_DEFS.map((def) => {
        const row = reading.readings?.[def.lop]
        const degraded = !row || row.degraded
        const picked = answers?.[def.lop] ?? null
        const aiMuc = ai?.[def.lop] as NhanDinhLop | undefined
        const cungGocNhin = aiMuc != null && picked != null && aiMuc === picked
        return (
          <div key={def.lop} className="space-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <def.Icon className="size-3.5 text-muted-foreground" />
              {def.label}
            </div>
            {reading.isLoading && !row ? (
              <HintLine>Đang tải dữ liệu lớp…</HintLine>
            ) : degraded ? (
              <HintLine>Chưa có dữ liệu lớp này.</HintLine>
            ) : (
              <div className="space-y-0.5">
                {row.lines.map((line, index) => (
                  <p key={index} className="text-xs leading-snug text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            )}
            <div className="text-xs text-muted-foreground">Bạn đọc lớp này là:</div>
            <div className="flex gap-1">
              {NHAN_DINH_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="xs"
                  variant={picked === option.value ? "default" : "outline"}
                  aria-pressed={picked === option.value}
                  onClick={() => setAnswers((previous) => ({ ...previous, [def.lop]: option.value }))}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {ai != null && (
              <p className={cn("text-xs leading-snug", degraded ? "text-muted-foreground" : cungGocNhin ? "text-price-up" : "text-price-ref")}>
                {degraded
                  ? "Chưa có dữ liệu lớp này để đối chiếu"
                  : cungGocNhin
                    ? `Cùng góc nhìn với AI - AI đánh giá: ${NHAN_DINH_LABEL[aiMuc as NhanDinhLop]}`
                    : `Góc nhìn khác AI - AI đánh giá: ${NHAN_DINH_LABEL[aiMuc as NhanDinhLop]}`}
              </p>
            )}
          </div>
        )
      })}

      {reading.settledFailure && (
        <NoteLine tone="warn">Chưa lưu được dữ liệu đối chiếu. Bạn vẫn có thể tiếp tục kế hoạch; bản này chưa được dùng để xác định Linh thú.</NoteLine>
      )}

      {ai == null && !reading.settledFailure ? (
        <div className="space-y-0.5 rounded-md border border-border bg-muted/40 p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Lock className="size-3.5" />
            {rated === TONG_SO_LOP ? "Đang lưu bản tự chấm và tải AI đối chiếu…" : `Chấm đủ ${TONG_SO_LOP} lớp để xem AI đối chiếu`}
          </p>
          <HintLine>{`Đã chấm ${formatInt(rated)}/${TONG_SO_LOP} lớp`}</HintLine>
        </div>
      ) : ai == null ? (
        <div className="space-y-0.5 rounded-md border border-border bg-muted/40 p-2">
          <p className="text-xs font-medium">AI đối chiếu đang tạm thời chưa khả dụng</p>
          <HintLine>Bản tự chấm đủ 5 lớp vẫn được dùng cho tiến độ; bạn có thể tiếp tục đặt lệnh.</HintLine>
        </div>
      ) : (
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">{`Điểm đồng thuận ${formatInt(soDongThuan)}/5 · Cùng góc nhìn AI ${formatInt(soCungGocNhin)}/5`}</p>
          <HintLine>{`${formatInt(soDongThuan)}/5 lớp AI đánh giá Ủng hộ · bạn cùng góc nhìn AI ở ${formatInt(soCungGocNhin)}/5 lớp. Lệch AI là góc nhìn khác cần kiểm chứng bằng kết quả lệnh, không phải lỗi đọc.`}</HintLine>
        </div>
      )}

      {reading.dataset.isError && <ErrorLine text={`Chưa tải được dữ liệu đọc 5 lớp của ${symbol}: ${errorMessage(reading.error)}`} onRetry={() => void reading.dataset.refetch()} />}
    </SectionCard>
  )
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export function IdentityPanel({ symbol }: { symbol: string }) {
  const { level } = useInsightsLevel()
  const identity = useIdentity()
  const data = identity.data
  const mascot = data?.mascot
  const isQaOverride = mascot?.assignment_basis === "qa_override"
  const isLegacy = mascot?.assignment_basis === "legacy_order_snapshot"
  const comparisonLabel = isLegacy ? "bộ nhận định đã lưu" : "bộ đối chiếu hợp lệ"
  const dominant = mascot ? (LOP_DEFS.find((def) => def.lop === mascot.dominant_layer)?.label ?? mascot.dominant_layer) : null
  const dominantCount = mascot ? (mascot.match_counts[mascot.dominant_layer] ?? 0) : 0
  const tieNames = mascot?.tied_layers.map((id) => LOP_DEFS.find((def) => def.lop === id)?.label ?? id).join(", ")
  const zeroMatch = mascot ? mascot.assignment_basis === "zero_match_tie_break" || (isLegacy && Math.max(...Object.values(mascot.match_counts)) === 0) : false
  const run = data?.bot_run

  return (
    <SidebarPanel
      title="Linh thú"
      description="Đồng hành cùng hành trình Demo Trading"
      actions={
        <Button variant="ghost" size="icon-sm" aria-label="Làm mới hồ sơ Linh thú" disabled={identity.isFetching} onClick={() => void identity.refetch()}>
          {identity.isFetching ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      }
    >
      <div className="space-y-3">
        {identity.isPending ? (
          <LoadingLine label="Đang tải hành trình…" />
        ) : identity.isError || !data ? (
          <ErrorLine text="Chưa tải được hồ sơ Linh thú. Vui lòng thử lại." onRetry={() => void identity.refetch()} />
        ) : (
          <>
            {mascot ? (
              <SectionCard title="Linh thú của tôi">
                <div className="flex items-center gap-3">
                  <span className="size-16 shrink-0" aria-hidden="true">
                    <CreatureArtwork mascotId={mascot.id} idPrefix="identity-panel" />
                  </span>
                  <div>
                    <span className="text-xs tracking-wide text-muted-foreground uppercase">{isQaOverride ? "Linh thú kiểm thử" : "ĐỒNG HÀNH CÙNG BẠN"}</span>
                    <h3 className="font-heading text-base font-bold">{mascot.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {isQaOverride
                        ? `${mascot.name} được cấp riêng cho tài khoản QA để kiểm tra giao diện và hoạt ảnh.`
                        : COMPANION_COPY[mascot.id]}
                    </p>
                  </div>
                </div>

                {!isQaOverride && (
                  <>
                    {isLegacy && <HintLine>Linh thú được khôi phục từ các bản tự chấm và nhận định AI đã lưu trong hành trình Cấp 4-6.</HintLine>}
                    {zeroMatch ? (
                      <NoteLine>{`Trong ${formatInt(mascot.valid_pair_count)} ${comparisonLabel}, chưa có lớp nào cùng đánh giá với AI. ${mascot.name} được xác định theo thứ tự cố định. Góc nhìn khác AI không có nghĩa là sai.`}</NoteLine>
                    ) : (
                      <NoteLine>
                        {`${dominant} có nhiều lần cùng đánh giá với AI nhất: ${formatInt(dominantCount)} lần trong ${formatInt(mascot.valid_pair_count)} ${comparisonLabel}.`}
                        {(mascot.assignment_basis === "stable_tie_break" || (isLegacy && mascot.tied_layers.length > 1)) &&
                          ` Các lớp ${tieNames} cùng có ${formatInt(dominantCount)} lần; IQX chọn ${mascot.name} theo thứ tự ổn định đã quy định. Đây không phải xếp hạng năng lực.`}
                      </NoteLine>
                    )}
                    <Table className="min-w-0 table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-normal">Lớp đánh giá</TableHead>
                          <TableHead className="whitespace-normal text-right">Số lần cùng AI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {LOP_DEFS.map((def) => {
                          const count = mascot.match_counts[def.lop] ?? 0
                          const pct = mascot.valid_pair_count > 0 ? (count / mascot.valid_pair_count) * 100 : 0
                          return (
                            <TableRow key={def.lop}>
                              <TableCell>
                                <span className="flex items-center gap-2">
                                  {def.label}
                                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                    <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {`${formatInt(count)} / ${formatInt(mascot.valid_pair_count)}`}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
                <HintLine>Linh thú đồng hành cùng bạn; không quyết định chiến lược giao dịch Bot.</HintLine>
              </SectionCard>
            ) : data.lifecycle === "pending_data_repair" ? (
              <SectionCard title="Linh thú của tôi">
                <NoteLine>IQX đang hoàn thiện dữ liệu đối chiếu để xác định Linh thú của bạn.</NoteLine>
              </SectionCard>
            ) : (
              <SectionCard title="Linh thú của tôi">
                <NoteLine>Trứng ADN đồng hành qua Cấp 0-6. Sau khi hoàn tất Cấp 6, Linh thú được xác định từ những bản tự chấm 5 lớp hợp lệ của bạn.</NoteLine>
              </SectionCard>
            )}

            {data.cap6_graduated_at && (
              <SectionCard title="Trạng thái Bot">
                <div role="status" className="space-y-1">
                  <p className="text-xs">
                    {!run?.connected
                      ? "Chưa có phiên xử lý Bot được kết nối. IQX sẽ hiển thị trạng thái khi có dữ liệu vận hành."
                      : run.status === "running"
                        ? "Bot đang xử lý dữ liệu phiên."
                        : run.status === "failed"
                          ? "Bot chưa xử lý xong phiên. Dữ liệu hoặc việc ghi nhận cần được kiểm tra."
                          : run.processed_unseen_sessions > 1
                            ? `Bot đã xử lý ${formatInt(run.processed_unseen_sessions)} phiên khi bạn vắng mặt.`
                            : run.status === "succeeded"
                              ? "Bot đã xử lý xong phiên. Đây không phải thông báo có lãi."
                              : "Bot đang chờ phiên tiếp theo."}
                  </p>
                  {run?.issues.map((issue, index) => (
                    <HintLine key={`${issue.code}-${index}`}>{`${issue.symbol ? `${issue.symbol}: ` : ""}${issue.detail ?? "Một phần dữ liệu phiên cần được kiểm tra."}`}</HintLine>
                  ))}
                </div>
              </SectionCard>
            )}
          </>
        )}

        {level >= 4 ? (
          symbol.length > 0 ? (
            <ReadingBlock key={symbol} symbol={symbol} />
          ) : (
            <SectionCard title="Đọc 5 lớp phân tích">
              <NoteLine>Chưa chọn mã nào - chọn một mã ở panel Đặt lệnh hoặc Săn mã để bắt đầu bản tự chấm 5 lớp.</NoteLine>
            </SectionCard>
          )
        ) : (
          <SectionCard title="Đọc 5 lớp phân tích">
            <NoteLine>{`Đọc 5 lớp mở từ Cấp 4 «${levelName(4)}». Bạn đang ở Cấp ${formatInt(level)} «${levelName(level)}».`}</NoteLine>
          </SectionCard>
        )}

        <HintLine>
          <Check className="mr-1 inline size-3" />
          Bản tự chấm đủ 5 lớp được lưu một lần và không bị viết lại khi bạn sửa; đó là bằng chứng để xác định Linh thú sau Cấp 6.
        </HintLine>
        <HintLine>
          <TriangleAlert className="mr-1 inline size-3" />
          Linh thú không quyết định chiến lược giao dịch và không ảnh hưởng Bot.
        </HintLine>
      </div>
    </SidebarPanel>
  )
}
