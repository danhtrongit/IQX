import { useMemo } from "react"
import { formatNum, formatPct, signedTone } from "../../format"
import type { CommoditiesTab, CommodityFxItem } from "../../types"
import {
  MoEmptyData,
  MoFlashValue,
  MoSubTabs,
  toneToMoClass,
  type MoSubTabOption,
  type WidgetBodyProps,
} from "../shared"

export type CommoditiesFxWidgetProps = WidgetBodyProps<"commodities_fx">

const TAB_OPTIONS: readonly MoSubTabOption<CommoditiesTab>[] = [
  { value: "energy_metals", label: "Năng lượng, kim loại" },
  { value: "agriculture", label: "Nông sản" },
  { value: "gold_fx", label: "Vàng, tỷ giá" },
]

function resolveDecimals(item: CommodityFxItem): number {
  if (item.decimals !== undefined && Number.isFinite(item.decimals)) {
    return item.decimals
  }
  const codeUpper = item.code.trim().toUpperCase()
  const unitUpper = item.unit.trim().toUpperCase()
  if (
    codeUpper === "USDVND" ||
    codeUpper === "USD_VND" ||
    codeUpper === "VCB_FX" ||
    unitUpper === "VND"
  ) {
    return 0
  }
  if (unitUpper.includes("USD/OZ") || codeUpper === "XAU" || codeUpper === "GOLD") {
    return 2
  }
  if (Number.isInteger(item.price) && Math.abs(item.price) >= 1000) {
    return 0
  }
  return 2
}

export function CommoditiesFxWidget({
  state,
  data,
  onStateChange,
}: CommoditiesFxWidgetProps) {
  const activeTab: CommoditiesTab = state.tab ?? data?.tab ?? "energy_metals"
  const items = useMemo(() => data?.items ?? [], [data])

  return (
    <div className="w-full">
      <MoSubTabs
        options={TAB_OPTIONS}
        value={activeTab}
        onChange={(tab) => onStateChange({ tab })}
        ariaLabel="Nhóm hàng hoá và tỷ giá"
      />

      {items.length === 0 ? (
        <MoEmptyData className="py-8" />
      ) : (
        <div>
          {items.map((item) => {
            const pctTone = toneToMoClass(signedTone(item.changePct))
            const decimals = resolveDecimals(item)
            const sectorTone =
              item.mappedSectorChangePct !== null
                ? toneToMoClass(signedTone(item.mappedSectorChangePct))
                : ""

            return (
              <div key={item.code} className="mo-rowit" data-fit="">
                <div className="min-w-0">
                  <span className="mo-code block truncate">{item.name}</span>
                  <span className="mo-sub truncate">
                    {item.unit}
                    {item.mappedSectorName && (
                      <>
                        {` · Ngành ${item.mappedSectorName}`}
                        {item.mappedSectorChangePct !== null && (
                          <span className={`ml-1 font-semibold ${sectorTone}`}>
                            {formatPct(item.mappedSectorChangePct, 2)}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <div className="r shrink-0">
                  <MoFlashValue
                    value={item.price}
                    formatted={formatNum(item.price, decimals)}
                    resetKey={`${activeTab}-${item.code}`}
                    className="mo-b block"
                  />
                  <span className={`mo-note block font-semibold ${pctTone}`}>
                    {formatPct(item.changePct, 2)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
