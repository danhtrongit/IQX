import { AppRouter } from "@/app/router"
import { AuthModal } from "@/features/auth"
import { TopLoadingBar } from "@/shared/ui/TopLoadingBar"

export default function App() {
  return (
    <>
      {/* Global top progress bar — tracks all TanStack Query activity. */}
      <TopLoadingBar />
      <AppRouter />
      <AuthModal />
    </>
  )
}
