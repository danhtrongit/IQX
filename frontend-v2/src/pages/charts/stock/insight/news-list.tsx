/**
 * L5 news list: "Tin trọng yếu" (material) then "Tin phụ" (filler). The filler
 * section is omitted entirely when empty; every item is its own block line.
 */
type MaterialItem = { title: string; subtitle?: string; tag: string }
type FillerItem = { title: string; tag: string }

const TAG_CLASS =
  "inline-flex items-center rounded-sm bg-price-ref/10 px-1.5 py-0.5 text-xs font-medium tracking-wide text-price-ref uppercase whitespace-nowrap"

/** One block line per item; the dotted rule sits between items, never after the last. */
const ITEM_CLASS =
  "grid grid-cols-[1fr_auto] items-start gap-3 border-b border-dotted border-border py-1.5 last:border-b-0"

export function NewsList({
  material,
  filler,
}: {
  material?: MaterialItem[]
  filler?: FillerItem[]
}) {
  const materialItems = material ?? []
  const fillerItems = filler ?? []

  if (materialItems.length === 0 && fillerItems.length === 0) return null

  return (
    <div className="mt-4 flex flex-col gap-4">
      {materialItems.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-price-ref uppercase">
            Tin trọng yếu
          </p>
          {materialItems.map((item, index) => (
            <div key={index} className={ITEM_CLASS}>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs leading-5">{item.title}</span>
                {item.subtitle ? (
                  <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                ) : null}
              </div>
              <span className={TAG_CLASS}>{item.tag}</span>
            </div>
          ))}
        </div>
      ) : null}

      {fillerItems.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Tin phụ
          </p>
          {fillerItems.map((item, index) => (
            <div key={index} className={ITEM_CLASS}>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs leading-5">{item.title}</span>
              </div>
              <span className={TAG_CLASS}>{item.tag}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
