import type { ReactNode } from "react"
import { Link } from "react-router"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime, formatPremiumEnd } from "@/lib/format"

import type { ReferralOfferInfo, UserGroupInfo } from "../api"
import { DetailList } from "./detail-list"
import { StatusBadge } from "./status-badge"

function offerText(offer: ReferralOfferInfo): string {
  return offer.lifetime || offer.offerType === "lifetime"
    ? "Premium miễn phí trọn đời"
    : `Premium miễn phí ${offer.offerDays ?? "?"} ngày`
}

/**
 * Thẻ "Giới thiệu" thay cho AdminReferralPanel (admin spec v1.1 §5.1.3): vào nhóm bằng mã
 * hay do quản trị viên thêm, trưởng nhóm, ngày vào nhóm và ưu đãi đã nhận. Dùng chung cho
 * quản trị viên và trưởng nhóm; `leadHref` chỉ truyền khi người xem được mở trang trưởng nhóm.
 */
export function UserReferralCard({
  group,
  referralOffer,
  leadHref,
  actions,
}: {
  group: UserGroupInfo | null
  referralOffer: ReferralOfferInfo | null
  leadHref?: (leadUserId: string) => string
  actions?: ReactNode
}) {
  const leadName = group ? (group.leadFullName ? `${group.leadFullName} (${group.leadUsername})` : group.leadUsername) : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Giới thiệu</CardTitle>
        <CardDescription>{group ? "Nhóm hiện tại và ưu đãi đã nhận" : "Chưa thuộc nhóm nào"}</CardDescription>
        {actions && <CardAction className="flex flex-wrap justify-end gap-2">{actions}</CardAction>}
      </CardHeader>
      <CardContent>
        <DetailList
          columns={2}
          items={[
            {
              label: "Vào nhóm bằng",
              value: group ? (
                group.joinVia === "code" ? (
                  <>
                    Mã <span className="font-mono">{group.code}</span>
                  </>
                ) : (
                  "Quản trị viên thêm"
                )
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
            },
            {
              label: "Trưởng nhóm",
              value: group ? (
                <span className="flex flex-wrap items-center gap-2">
                  {leadHref ? (
                    <Link to={leadHref(group.leadUserId)} className="text-primary underline-offset-4 hover:underline">
                      {leadName}
                    </Link>
                  ) : (
                    leadName
                  )}
                  {group.leadStatus === "revoked" && <StatusBadge status="revoked" label="Đã thôi" tone="neutral" />}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
            },
            {
              label: "Ngày vào nhóm",
              value: group ? <span className="tabular-nums">{formatDateTime(group.joinedAt)}</span> : <span className="text-muted-foreground">—</span>,
            },
            {
              label: "Ưu đãi",
              value: referralOffer ? (
                <span>
                  {offerText(referralOffer)}
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {referralOffer.lifetime ? "Hạn: Trọn đời" : `Hạn: ${formatPremiumEnd(referralOffer.endsAt)}`}
                    {!referralOffer.active && " · không còn hiệu lực"}
                  </span>
                </span>
              ) : (
                "Không có"
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}
