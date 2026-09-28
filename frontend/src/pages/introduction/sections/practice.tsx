import { ArrowRight, BookOpen, Check } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"

import { COMPANIONS, EGG_IMAGE, JOURNEY_LEVELS, LESSONS, LINKS } from "../content"
import { Caption, Container, Panel, Section, SectionHead } from "../ui"

export function Practice() {
  return (
    <Section id="luyen-tap" className="bg-background">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Luyện tập bằng vốn mô phỏng."
          lead="Tài khoản mô phỏng 100 triệu đồng và bảy cấp độ, đi từ một vòng mua bán đầu tiên đến xử lý mâu thuẫn giữa các lớp thông tin. Nhiệm vụ được xác nhận từ hành động thực tế, không phải từ lãi lỗ."
        />

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-12">
          <ol className="relative space-y-0">
            {JOURNEY_LEVELS.map((level, index) => (
              <li key={level.index} className="relative flex gap-4 pb-5 last:pb-0">
                {index < JOURNEY_LEVELS.length - 1 && (
                  <span className="absolute top-8 bottom-0 left-3 w-px bg-border" aria-hidden="true" />
                )}
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card font-heading text-xs font-bold tabular-nums">
                  {level.index}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                    <span>Cấp {level.index}</span>
                    <span className="text-muted-foreground">{level.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {level.tasks} nhiệm vụ
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{level.skill}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="min-w-0">
            <Panel>
              <div className="flex items-center gap-4">
                <img
                  src={EGG_IMAGE}
                  alt="Trứng linh thú ở cấp khởi đầu"
                  width={512}
                  height={512}
                  loading="lazy"
                  className="size-16 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-heading text-base font-bold">Linh thú đồng hành</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Trứng lớn dần qua từng cấp. Hoàn thành Cấp 6 để biết linh thú của bạn.
                  </p>
                </div>
              </div>

              <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
                {COMPANIONS.map((companion) => (
                  <li key={companion.id} className="min-w-0">
                    <img
                      src={companion.image}
                      alt={`Linh thú ${companion.name}`}
                      width={512}
                      height={512}
                      loading="lazy"
                      className="size-14"
                    />
                    <p className="mt-1 text-sm font-semibold">{companion.name}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{companion.trait}</p>
                  </li>
                ))}
              </ul>

              <Caption className="mt-5">
                Linh thú được xác định từ lớp dữ liệu mà bạn đồng ý với AI nhiều nhất trong các lần tự đánh giá. Đây
                không phải xếp hạng năng lực đầu tư.
              </Caption>
            </Panel>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-10 px-4">
                <Link to={LINKS.demo}>
                  Vào Demo Trading
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">Cần đăng nhập để mở tài khoản mô phỏng.</span>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}

export function Lessons() {
  return (
    <Section id="bai-hoc" className="bg-muted/30">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-12">
          <div className="min-w-0">
            <SectionHead
              title="Học trước, rồi thực hành."
              lead="Thư viện bài học nằm cùng chỗ với công cụ phân tích, để kiến thức và dữ liệu thị trường không tách rời nhau."
            />
            <Button asChild variant="outline" size="lg" className="mt-6 h-10 px-4">
              <Link to={LINKS.lessons}>
                Vào thư viện bài học
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <Panel className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" aria-hidden="true" />
              <h3 className="font-heading text-base font-bold">Trong thư viện có gì</h3>
            </div>
            <ul className="mt-4 space-y-3">
              {LESSONS.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-6 text-muted-foreground">
                  <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Container>
    </Section>
  )
}
