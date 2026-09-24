import { cn } from "@/lib/utils"

import { DUPONT, FORENSIC, VALUATION } from "../content"
import { BandChart, Caption, Container, Panel, Section, SectionHead, toneText } from "../ui"

export function Fundamentals() {
  return (
    <Section id="nghien-cuu" className="bg-muted/30">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Đọc báo cáo tài chính mà không cần là dân tài chính."
          lead="Hệ thống tự tính chuỗi DuPont, bộ ba chỉ số phát hiện rủi ro chất lượng lợi nhuận, và dải định giá của doanh nghiệp. Ngân hàng dùng bộ chỉ số riêng: NIM và phân rã NIM, nợ xấu, mức bao phủ nợ xấu."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <Panel className="flex flex-col">
            <h3 className="font-heading text-base font-bold">Phân rã ROE theo DuPont</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Ba thành phần nhân lại thành ROE, để bạn thấy lợi nhuận đến từ biên lãi, vòng quay hay đòn bẩy.
            </p>
            <dl className="mt-5 flex-1 space-y-2">
              {DUPONT.map((row, index) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex items-baseline justify-between gap-3 rounded-lg px-3 py-2",
                    index === DUPONT.length - 1 ? "bg-primary/10" : "bg-background",
                  )}
                >
                  <dt className="text-sm text-muted-foreground">
                    {index > 0 && <span className="mr-1.5 font-mono text-xs text-muted-foreground">×</span>}
                    {row.label}
                  </dt>
                  <dd
                    className={cn(
                      "font-heading font-bold tabular-nums",
                      index === DUPONT.length - 1 ? "text-lg text-primary" : "text-base",
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel className="flex flex-col">
            <h3 className="font-heading text-base font-bold">Ba chỉ số chất lượng lợi nhuận</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Ba thước đo độc lập về rủi ro kiệt quệ, sức khỏe tài chính và khả năng thao túng lợi nhuận.
            </p>
            <dl className="mt-5 flex-1 space-y-2">
              {FORENSIC.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 rounded-lg bg-background px-3 py-2">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-right">
                    <span className="font-heading text-base font-bold tabular-nums">{row.value}</span>
                    <span className={cn("ml-2 text-xs font-medium", toneText(row.tone))}>{row.state}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel className="flex flex-col">
            <h3 className="font-heading text-base font-bold">Giá đang đắt hay rẻ</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Ba phương pháp độc lập tạo thành dải giá hợp lý, kèm vị trí giá hiện tại trên dải đó.
            </p>
            <div className="mt-5 flex-1">
              <BandChart low={VALUATION.low} high={VALUATION.high} price={VALUATION.price} bands={VALUATION.bands} />
            </div>
          </Panel>
        </div>

        <Caption className="mt-4">
          Ví dụ minh hoạ trên một mã ngân hàng. Trong ứng dụng, bộ số này được tính lại theo báo cáo tài chính mới nhất
          của từng mã, và AI viết thêm phần nhận định cho doanh nghiệp.
        </Caption>
      </Container>
    </Section>
  )
}
