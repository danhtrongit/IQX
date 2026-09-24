import { Suspense } from "react"
import { Outlet } from "react-router"

import { RailProvider } from "@/context/rail"
import { PageLoading } from "@/components/layout/page-loading"

import { Header } from "./header"

export function AppShell() {
  return (
    <RailProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-sm">
        <Header />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
        </div>
      </div>
    </RailProvider>
  )
}
