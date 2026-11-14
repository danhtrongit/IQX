/**
 * /admin/saco: Quản lý SACO cho quản trị viên và trưởng nhóm (chat spec "Quản trị SACO",
 * posts spec "Quy tắc nội dung"). Thẻ đang mở nằm trong `?tab=`. Máy chủ giới hạn trưởng
 * nhóm vào SACO của nhóm mình; giao diện chỉ làm mờ và ẩn nút với phần không thuộc nhóm.
 */
import { useSearchParams } from "react-router"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"

import { SacoChatsTab } from "./saco-chats-tab"
import { SacoInvitesTab } from "./saco-invites-tab"
import { SacoOrderTab } from "./saco-order-tab"
import { SacoPostsTab } from "./saco-posts-tab"

const TABS = [
  { value: "order", label: "Thứ tự SACO" },
  { value: "invites", label: "Nhật ký lời mời" },
  { value: "chats", label: "Lịch sử chat" },
  { value: "posts", label: "Nhận định" },
] as const

type TabValue = (typeof TABS)[number]["value"]

const isTab = (value: string | null): value is TabValue => TABS.some((tab) => tab.value === value)

export function SacoManagePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const [params, setParams] = useSearchParams()
  const raw = params.get("tab")
  const tab: TabValue = isTab(raw) ? raw : "order"

  const select = (value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value === "order") next.delete("tab")
      else next.set("tab", value)
      return next
    }, { replace: true })
  }

  return <WorkspacePage
    title="Quản lý SACO"
    description={isAdmin
      ? "Thứ tự khớp chat, nhật ký lời mời, lịch sử chat và bài nhận định của mọi nhóm."
      : "Thứ tự khớp chat, nhật ký lời mời, lịch sử chat và bài nhận định của SACO trong nhóm bạn."}
  >
    <Tabs value={tab} onValueChange={select} className="gap-4">
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <TabsList variant="line" className="w-max">
          {TABS.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
        </TabsList>
      </div>
      <TabsContent value="order"><SacoOrderTab isAdmin={isAdmin} /></TabsContent>
      <TabsContent value="invites"><SacoInvitesTab /></TabsContent>
      <TabsContent value="chats"><SacoChatsTab /></TabsContent>
      <TabsContent value="posts"><SacoPostsTab isAdmin={isAdmin} /></TabsContent>
    </Tabs>
  </WorkspacePage>
}
