import { useEffect, useState } from "react"
import { Menu, Moon, Sun, Triangle, X } from "lucide-react"
import { Link, NavLink, useLocation } from "react-router"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { HEADER_NAV } from "@/config/chrome"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"
import { headerDestination, isHeaderLinkActive } from "@/lib/header-navigation"

import { LoginDialog } from "./login-dialog"

const activeNavClass = "flex shrink-0 items-center bg-primary px-3 text-xs font-semibold tracking-wide whitespace-nowrap text-primary-foreground uppercase transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
const navClass = "flex shrink-0 items-center px-3 text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
const mobileNavClass = "flex min-h-11 items-center rounded-sm px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"

type HeaderNavItem = { readonly to: string; readonly label: string }

function HeaderLinks({ items, mobile = false, onNavigate }: {
  items: readonly HeaderNavItem[]
  mobile?: boolean
  onNavigate?: () => void
}) {
  const location = useLocation()
  const linkClass = (active: boolean) => mobile
    ? `${mobileNavClass} ${active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`
    : active ? activeNavClass : navClass

  return items.map(item => (
    <Link key={item.to} to={headerDestination(item.to, location)}
      aria-current={isHeaderLinkActive(item.to, location) ? "page" : undefined}
      className={linkClass(isHeaderLinkActive(item.to, location))} onClick={onNavigate}>
      {item.label}
    </Link>
  ))
}

function MobileHeaderMenu({ items, isIntroduction }: {
  items: readonly HeaderNavItem[]
  isIntroduction: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)")
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 xl:hidden" aria-label="Mở menu điều hướng">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="gap-0 data-[side=right]:w-[min(20rem,85vw)] motion-reduce:animate-none motion-reduce:transition-none">
        <SheetHeader className="border-b border-border pr-14">
          <SheetTitle>Điều hướng IQX</SheetTitle>
          <SheetDescription className="sr-only">Truy cập các công cụ và hành trình học đầu tư.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav aria-label="Điều hướng di động" className="grid gap-1 p-3">
            <HeaderLinks items={items} mobile onNavigate={() => setOpen(false)} />
          </nav>
        </ScrollArea>
        {isIntroduction && (
          <SheetFooter className="border-t border-border">
            <SheetClose asChild>
              <Button asChild className="min-h-11 w-full">
                <Link to="/demo-trading?view=journey">Bắt đầu ngay</Link>
              </Button>
            </SheetClose>
          </SheetFooter>
        )}
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-9" aria-label="Đóng menu điều hướng">
            <X aria-hidden="true" />
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  )
}

export function Header() {
  const { setTheme } = useTheme()
  const resolved = useResolvedTheme()
  const { pathname, key: locationKey } = useLocation()
  const isIntroduction = pathname === "/" || pathname === "/gioi-thieu"

  return (
    <header className="flex h-(--header-top) shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-4 sm:px-4">
      <NavLink
        to="/"
        aria-label="IQX - Trang chủ"
        className="flex shrink-0 items-center gap-1.5 border-r border-border pr-4"
      >
        <span className="font-heading text-lg font-bold tracking-tight">
          IQX
        </span>
        <Triangle
          aria-hidden="true"
          className="size-3 fill-price-up text-price-up"
        />
      </NavLink>
      <ScrollArea className="hidden h-full min-w-0 flex-1 xl:block" orientation="horizontal">
        <nav
          aria-label="Điều hướng chính"
          className="flex h-[calc(var(--header-top)-1px)] w-max items-stretch"
        >
          <HeaderLinks items={HEADER_NAV} />
        </nav>
      </ScrollArea>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={resolved === "dark" ? "Chế độ sáng" : "Chế độ tối"}
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        >
          {resolved === "dark" ? <Sun /> : <Moon />}
        </Button>
        <div className="min-w-0 [&>button]:max-w-28 sm:[&>button]:max-w-40">
          <LoginDialog />
        </div>
        {isIntroduction && (
          <Button asChild className="hidden xl:inline-flex">
            <Link to="/demo-trading?view=journey">Bắt đầu ngay</Link>
          </Button>
        )}
        <MobileHeaderMenu key={locationKey} items={HEADER_NAV} isIntroduction={isIntroduction} />
      </div>
    </header>
  )
}
