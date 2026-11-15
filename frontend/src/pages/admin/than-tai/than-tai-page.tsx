import { useState } from "react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { HanhTab } from "./hanh-tab"
import { LaLibraryTab } from "./la-library-tab"

/**
 * Mục "Thần Tài" của trang quản trị (chỉ quản trị viên): thư viện 64 quẻ với các lá (hào động) và
 * cấu hình 5 hành. Spec: `backend/docs/than-tai/SPEC.md` (Thư viện quẻ, Ngũ hành ngày và ngành).
 */
export function ThanTaiAdminPage() {
  const [tab, setTab] = useState("la")
  return (
    <WorkspacePage
      title="Thần Tài"
      description="Thư viện quẻ Kinh Dịch cho lượt khấn hằng ngày ở Khu giao dịch: mỗi lá là một quẻ với một hào động. Chỉ lá đang bật mới được rút; hạng quyết định tỷ lệ ra (35/30/20/10/5)."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="la">Thư viện quẻ</TabsTrigger>
          <TabsTrigger value="hanh">Ngũ hành</TabsTrigger>
        </TabsList>
        <TabsContent value="la" className="pt-3">
          <LaLibraryTab />
        </TabsContent>
        <TabsContent value="hanh" className="pt-3">
          <HanhTab />
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  )
}
