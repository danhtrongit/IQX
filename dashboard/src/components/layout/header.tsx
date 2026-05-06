import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import {
  Search,
  Bell,
  Settings,
  Moon,
  Sun,
  ChevronDown,
  LayoutGrid,
  Newspaper,
  BrainCircuit,
  CircleHelp,
  LogOut,
  LogIn,
  UserPlus,
  Crown,
  TrendingUp,

} from "lucide-react"
import { StockLogo } from "@/components/stock/stock-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/auth-context"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

interface StockResult {
  symbol: string
  name?: string
  nameEn?: string
  exchange?: string
  sectorName?: string
}

const NAV_ITEMS = [
  { label: "Thị trường", href: "/thi-truong" },
]

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function getTierLabel(role: string): string {
  switch (role) {
    case "premium": return "Premium"
    case "admin": return "Admin"
    default: return "Free"
  }
}

// ── Stock Search Component ──

function StockSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StockResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const searchStocks = async (q: string) => {
    if (q.length < 1) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      // New backend: GET /market-data/reference/symbols/search?q=...&page_size=8&include_indices=true
      const resp = await fetch(`${API_BASE}/market-data/reference/symbols/search?q=${encodeURIComponent(q)}&page_size=8&include_indices=true`)
      if (resp.ok) {
        const json = await resp.json()
        const rawItems = json?.data || json?.items || json || []
        // Adapt snake_case response to UI shape
        const items: StockResult[] = (Array.isArray(rawItems) ? rawItems : []).map((r: any) => ({
          symbol: (r.symbol || r.ticker || "").toUpperCase(),
          name: r.name || r.organ_name || r.organName || "",
          nameEn: r.name_en || r.nameEn || "",
          exchange: r.exchange || "",
          sectorName: r.sector_name || r.sectorName || "",
        }))
        setResults(items)
        setIsOpen(items.length > 0)
        setActiveIndex(-1)
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchStocks(value), 250)
  }

  const selectStock = (symbol: string) => {
    setQuery("")
    setResults([])
    setIsOpen(false)
    navigate(`/co-phieu/${symbol.toUpperCase()}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        selectStock(query.trim())
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
        break
      case "Enter":
        e.preventDefault()
        if (activeIndex >= 0 && results[activeIndex]) {
          selectStock(results[activeIndex].symbol)
        } else if (query.trim()) {
          selectStock(query.trim())
        }
        break
      case "Escape":
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  // Global ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={containerRef} className="relative" id="header-search">
      <div className="relative flex items-center w-32 focus-within:w-48 md:w-56 md:focus-within:w-72 transition-all duration-200">
        <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none z-10" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder="Tìm mã CK, tin tức... ⌘K"
          className="h-7 pl-7 pr-8 text-xs bg-muted/50 border-transparent focus:border-primary/30 focus:bg-background"
        />
        {isLoading ? (
          <div className="absolute right-2 size-3 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        ) : (
          <kbd className="absolute right-2 pointer-events-none text-[10px] text-muted-foreground bg-muted px-1 rounded font-mono">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider border-b border-border">
            Kết quả ({results.length})
          </div>
          {results.map((stock, index) => (
            <button
              key={stock.symbol}
              onClick={() => selectStock(stock.symbol)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${
                index === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              }`}
            >
              <StockLogo symbol={stock.symbol} size={28} className="rounded-md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    {stock.symbol}
                  </span>
                  {stock.exchange && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-normal">
                      {stock.exchange}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {stock.name || stock.nameEn || ""}
                </p>
              </div>
              <TrendingUp className="size-3 text-muted-foreground/40 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Header() {
  const [isDark, setIsDark] = useState(true)
  const {
    user,
    isAuthenticated,
    logout,
    setShowAuthModal,
    setAuthModalTab,
  } = useAuth()
  const navigate = useNavigate()
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/"

  const openLogin = () => {
    setAuthModalTab("login")
    setShowAuthModal(true)
  }

  const openRegister = () => {
    setAuthModalTab("register")
    setShowAuthModal(true)
  }

  return (
    <header
      id="app-header"
      className="flex h-11 shrink-0 items-center border-b border-border bg-card px-2 gap-1.5"
    >
      {/* Logo */}
      <a
        href="/"
        id="header-logo"
        className="flex items-center gap-1.5 px-2 font-bold text-base tracking-tight shrink-0"
        onClick={(e) => { e.preventDefault(); navigate("/") }}
      >
        <div className="size-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground text-xs font-black">
          IQ
        </div>
        <span className="text-foreground">
          IQX
          <span className="text-primary font-extrabold">.</span>
        </span>
      </a>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Navigation */}
      <nav id="header-nav" className="hidden md:flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={(e) => { e.preventDefault(); navigate(item.href) }}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              currentPath === item.href
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <StockSearch />

      <Separator orientation="vertical" className="hidden md:block h-5 mx-1" />

      {/* Utility Icons */}
      <div id="header-utilities" className="hidden md:flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                setIsDark(!isDark)
                document.documentElement.classList.toggle("dark")
              }}
            >
              {isDark ? (
                <Sun className="size-3.5" />
              ) : (
                <Moon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{isDark ? "Chế độ sáng" : "Chế độ tối"}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Auth / User */}
      <div id="header-auth" className="flex items-center gap-1">
        {isAuthenticated && user ? (
          /* ── Logged in state ── */
          <>
            {user.role === "user" && (
              <Button
                size="sm"
                onClick={() => navigate("/nang-cap")}
                className="h-7 text-[10px] gap-1 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold tracking-wide mr-1 shadow-sm border-none"
              >
                <Crown className="size-3" />
                Nâng cấp Premium
              </Button>
            )}
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-7 gap-1.5 px-1.5 text-xs"
              >
                <Avatar className="size-5">
                  <AvatarFallback className="text-[10px] bg-primary/15 text-primary font-bold">
                    {getInitials(user.fullName, user.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium max-w-20 truncate">
                  {user.fullName || user.email.split("@")[0]}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* User info header */}
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium truncate">
                  {user.fullName || "Chưa đặt tên"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/cai-dat")}>
                Tài khoản
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/nang-cap")}>
                <Crown className="size-3.5 mr-2 text-amber-500" />
                Gói dịch vụ
                <Badge
                  variant={user.role === "user" ? "secondary" : "default"}
                  className="ml-auto text-[10px]"
                >
                  {getTierLabel(user.role)}
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="size-3.5 mr-2" />
                Đăng xuất
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
        ) : (
          /* ── Guest state ── */
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => navigate("/nang-cap")}
              className="h-7 text-[10px] gap-1 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold tracking-wide shadow-sm border-none"
            >
              <Crown className="size-3" />
              Premium
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
              onClick={openLogin}
            >
              <LogIn className="size-3" />
              Đăng nhập
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 px-2.5 font-medium"
              onClick={openRegister}
            >
              <UserPlus className="size-3" />
              Đăng ký
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
