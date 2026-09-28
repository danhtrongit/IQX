import { PagePanel } from "@/components/layout/page-panel"
import { useRail } from "@/context/rail"

export function AboutPage() {
  const { activeItem } = useRail()

  return (
    <PagePanel title="Giới thiệu" description={activeItem?.label ?? "IQX"} />
  )
}
