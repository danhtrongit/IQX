import { cn } from "@/lib/utils"

import { TOOLS } from "../content"
import { Container, Section, SectionHead, TierBadge } from "../ui"

export function Toolkit() {
  return (
    <Section id="cong-cu" className="bg-background">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Cả một phòng phân tích trong trình duyệt."
          lead="Bảng giá, biểu đồ, săn mã, tin tức, mẫu hình và danh sách theo dõi nằm cùng một chỗ, dùng chung một tài khoản và cùng một nguồn dữ liệu."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((tool, index) => (
            <article
              key={tool.name}
              className={cn(
                "flex flex-col rounded-lg border border-border p-4",
                tool.tint ? "bg-muted/40" : "bg-card",
                index === 0 && "sm:col-span-2",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-background">
                  <tool.Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                </span>
                <TierBadge tier={tool.tier} />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{tool.name}</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-muted-foreground">{tool.description}</p>
              <p className="mt-3 font-mono text-xs text-muted-foreground">{tool.proof}</p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  )
}
