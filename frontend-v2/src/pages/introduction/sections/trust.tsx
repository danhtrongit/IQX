import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

import { FAQS, PRINCIPLES, SOURCES } from "../content"
import { Container, Panel, Section, SectionHead } from "../ui"

export function DataTrust() {
  return (
    <Section id="du-lieu" className="bg-muted/30">
      <Container className="py-12 sm:py-16">
        <SectionHead
          title="Dữ liệu truy vết được."
          lead="Chỉ báo và điểm số đều được tính từ dữ liệu thị trường thật, trên giá đã điều chỉnh, rồi trả về giao diện kèm phần giải thích cách đọc."
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12">
          <dl className="space-y-5">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title}>
                <dt className="text-sm font-semibold">{principle.title}</dt>
                <dd className="mt-1 text-sm leading-6 text-muted-foreground">{principle.body}</dd>
              </div>
            ))}
          </dl>

          <Panel className="min-w-0">
            <h3 className="font-heading text-base font-bold">Nguồn dữ liệu đang dùng</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {SOURCES.map((source) => (
                <li
                  key={source}
                  className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground"
                >
                  {source}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Dữ liệu giá lấy từ nguồn chứng khoán Việt Nam, phần quốc tế và hàng hóa lấy từ các nguồn riêng. Khi một
              nguồn lỗi, giao diện báo là chưa có dữ liệu thay vì hiển thị số đoán.
            </p>
          </Panel>
        </div>
      </Container>
    </Section>
  )
}

export function Faq() {
  return (
    <Section id="faq" className="bg-muted/30">
      <Container className="py-12 sm:py-16">
        <SectionHead title="Câu hỏi thường gặp" lead="Sáu câu hỏi người dùng mới hay đặt ra nhất." />

        <Accordion type="single" collapsible className="mt-8 max-w-3xl">
          {FAQS.map((faq, index) => (
            <AccordionItem key={faq.question} value={`faq-${index}`}>
              <AccordionTrigger className="py-4 text-left text-sm font-semibold hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </Section>
  )
}
