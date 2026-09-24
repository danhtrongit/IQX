import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MarketDataProvider } from "@/pages/securities/market/provider"
import { useIndices } from "@/pages/securities/market/hooks"
import { INDEX_NAME_TO_CODE } from "@/pages/securities/market/api"
import { IndexCard } from "@/pages/securities/price-board/components/index-strip"

const indices = [
  { name: "VN-Index", exchange: "HOSE" },
  { name: "VN30", exchange: "HOSE" },
  { name: "HNX-Index", exchange: "HNX" },
  { name: "HNX30", exchange: "HNX" },
  { name: "UPCOM", exchange: "UPCoM" },
]

const indexGroups = [
  { id: "all", label: "Tất cả", items: indices },
  ...(["HOSE", "HNX", "UPCoM"] as const).map((exchange) => ({
    id: exchange,
    label: exchange,
    items: indices.filter((index) => index.exchange === exchange),
  })),
]

export function IndexStack() {
  return <MarketDataProvider><LiveIndexStack /></MarketDataProvider>
}

function LiveIndexStack() {
  const live = useIndices()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-(--panel-header-height) shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div>
          <h2 className="font-heading text-base font-bold">
            Chỉ số thị trường
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Thị trường Việt Nam
          </p>
        </div>
        <span className="shrink-0 rounded-sm border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
          {indices.length} chỉ số
        </span>
      </div>
      <Tabs defaultValue="all" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          aria-label="Lọc chỉ số theo sàn"
          className="h-11! w-full shrink-0 gap-0 border-b border-border px-3 py-0"
        >
          {indexGroups.map((group) => (
            <TabsTrigger
              key={group.id}
              value={group.id}
              className="rounded-none text-xs after:bottom-0! after:bg-primary data-[state=active]:text-primary data-[state=active]:after:opacity-100"
            >
              {group.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {indexGroups.map((group) => (
          <TabsContent
            key={group.id}
            value={group.id}
            className="min-h-0 overflow-hidden"
          >
            <ScrollArea className="h-full" viewportClassName="[&>div]:!block">
              <div className="flex flex-col gap-2 p-(--page-padding)">
                {group.items.map((index) => (
                  <IndexCard key={index.name} name={index.name} quoteSymbol={INDEX_NAME_TO_CODE[index.name]} live={live.indices.find(row => row.name === index.name) ?? null} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
      <p className="shrink-0 border-t border-border px-3 py-2 text-center text-[10px] leading-4 text-muted-foreground">
        {live.updatedAt ? `Cập nhật ${new Date(live.updatedAt).toLocaleTimeString("vi-VN")}` : "Đang tải dữ liệu thị trường"}
      </p>
    </div>
  )
}
