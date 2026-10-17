import { InlineText } from "../blocks/inline-text"

/** "Tóm tắt": the short list that closes every lesson. */
export function SummaryList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="academy-summary-title" className="mt-3 rounded-lg border border-border bg-card p-4 sm:p-6">
      <h3 id="academy-summary-title" className="mb-3 font-heading text-lg font-semibold text-foreground">
        Tóm tắt
      </h3>
      <ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground marker:text-primary">
        {items.map((item, index) => (
          <InlineText key={index} as="li" html={item} />
        ))}
      </ul>
    </section>
  )
}
