import { useSEO } from "@/hooks/use-seo"
import { Cog, RefreshCcw } from "lucide-react"

export default function MaintenancePage() {
  useSEO({
    title: "503 - Đang bảo trì hệ thống | IQX",
    description: "Hệ thống đang được nâng cấp để phục vụ bạn tốt hơn.",
  })

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl opacity-50 bg-amber-500/20 rounded-full scale-150" />
            <Cog className="size-20 text-amber-500 animate-[spin_4s_linear_infinite] relative z-10" />
          </div>
        </div>
        
        <div className="space-y-2 relative z-10">
          <h1 className="text-6xl font-bold tracking-tighter">503</h1>
          <h2 className="text-2xl font-semibold tracking-tight">Hệ thống đang bảo trì</h2>
          <p className="text-muted-foreground text-sm mt-3">
            Hệ thống IQX Core AI đang được nâng cấp để tối ưu hóa hiệu năng và mang lại trải nghiệm phân tích tốt hơn. 
            Quá trình này sẽ diễn ra nhanh thôi, quý nhà đầu tư vui lòng quay lại sau nhé!
          </p>
        </div>

        <div className="pt-4 relative z-10">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-border bg-background shadow-sm hover:bg-muted hover:text-foreground rounded-md min-h-11"
          >
            <RefreshCcw className="size-4" />
            Thử lại
          </button>
        </div>
      </div>
    </div>
  )
}
