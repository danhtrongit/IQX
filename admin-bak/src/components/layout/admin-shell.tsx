import { Outlet } from "react-router"
import { TopBar } from "./top-bar"
import { Sidebar } from "./sidebar"
import { Breadcrumbs } from "./breadcrumbs"

export function AdminShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="border-b border-border bg-card px-6 py-2.5">
            <Breadcrumbs />
          </div>
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
