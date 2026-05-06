import { Link } from "react-router"
import { useSEO } from "@/hooks/use-seo"
import { Home, SearchX } from "lucide-react"

export default function NotFoundPage() {
  useSEO({
    title: "404 - Không tìm thấy trang | IQX",
    description: "Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.",
  })

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl opacity-50 bg-primary/20 rounded-full scale-150" />
            <SearchX className="size-20 text-primary relative z-10" strokeWidth={1.5} />
          </div>
        </div>
        
        <div className="space-y-2 relative z-10">
          <h1 className="text-6xl font-bold tracking-tighter">404</h1>
          <h2 className="text-2xl font-semibold tracking-tight">Không tìm thấy trang</h2>
          <p className="text-muted-foreground text-sm mt-3">
            Lạc đường rồi nhà đầu tư ơi! Trang bạn tìm kiếm không tồn tại hoặc đã được dời sang một không gian khác.
          </p>
        </div>

        <div className="pt-4 relative z-10">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 hover:shadow-primary/50 rounded-md min-h-11"
          >
            <Home className="size-4" />
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  )
}
