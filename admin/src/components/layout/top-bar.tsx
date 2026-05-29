import { LogOut, ShieldCheck } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { userInitials } from "@/lib/api/users"

export function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      void navigate("/login", { replace: true })
    } catch {
      toast.error("Đăng xuất thất bại")
    }
  }

  const initials = user ? userInitials(user.fullName, user.email) : "A"

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <span className="font-semibold">IQX Admin</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden text-sm text-muted-foreground sm:block">{user.email}</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {user && (
              <>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {user.fullName ?? user.email}
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
              onClick={() => { void handleLogout() }}
            >
              <LogOut className="mr-2 size-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
