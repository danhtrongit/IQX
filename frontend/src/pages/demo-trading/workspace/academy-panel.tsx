import { BookOpen } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"

/**
 * «Học viện» tool panel.
 *
 * Until the catalog of 13 chapters / 71 lessons is connected this shows an
 * honest empty state: no chapter, lesson or progress figure is invented.
 */
export function AcademyPanel() {
  return (
    <SidebarPanel title="Học viện" description="13 chương · 71 bài học">
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center" data-testid="academy-empty">
        <BookOpen className="size-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium">Danh sách bài học chưa sẵn sàng</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          13 chương và 71 bài học sẽ hiển thị tại đây cùng tiến độ học tập của bạn khi nội dung được mở. Tài khoản của bạn
          đã sẵn sàng; không cần hoàn thành bài học nào để đặt lệnh hay dùng Bot.
        </p>
      </div>
    </SidebarPanel>
  )
}
