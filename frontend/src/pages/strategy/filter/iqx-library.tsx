import { useIqxFilters, type IqxFilterItem } from "../shared/iqx"
import { IqxCard, IqxCardList, IqxMetaChip } from "../shared/iqx-ui"
import { iqxFilterCounts } from "./iqx"
import type { FilterDefinition } from "./types"

export const FILTER_IQX_FOOTER =
  "Bộ lọc dựng sẵn bởi IQX. Bấm Dùng để điền sẵn vào form, rồi sửa như tự thiết lập. Tham khảo để học, không phải khuyến nghị."

/** Tab IQX of the Bộ lọc library: the shown Bộ lọc IQX, in the admin's order (§2.2). */
export function IqxFilterLibrary({ activeId, onUse }: { activeId: string | null; onUse: (item: IqxFilterItem) => void }) {
  const query = useIqxFilters()
  const items = query.data ?? []
  return (
    <IqxCardList
      loading={query.isPending}
      error={query.isError ? query.error : null}
      onRetry={() => void query.refetch()}
      empty={items.length === 0}
      footer={FILTER_IQX_FOOTER}
    >
      {items.map((item) => (
        <IqxCard key={item.id} testId={`iqx-filter-${item.slug}`} name={item.content.name} idea={item.content.idea} active={activeId === item.id} onUse={() => onUse(item)}>
          {iqxFilterCounts(item.content.definition as FilterDefinition).map((label) => (
            <IqxMetaChip key={label}>{label}</IqxMetaChip>
          ))}
        </IqxCard>
      ))}
    </IqxCardList>
  )
}
