import { type ComponentProps, type ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ConfigProvider } from "@arco-design/web-react"
import { queryClient } from "@/shared/query/queryClient"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { arcoComponentConfig, arcoLocale } from "@/shared/theme/arco-config"
import { AuthProvider } from "@/features/auth"
import { MarketDataProvider } from "@/features/market-data"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"
import { MarketModalProvider } from "@/shared/contexts/market-modal-context"
import { MarketOverviewModal } from "@/features/market-overview/daily/MarketOverviewModal"

type ConfigProviderProps = ComponentProps<typeof ConfigProvider>

/**
 * Global provider stack (outermost → innermost):
 * Query → Theme → Arco config → Auth → Sidebar.
 * AuthProvider depends on the QueryClient (cross-feature invalidation), so it
 * must sit inside QueryClientProvider.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfigProvider
          componentConfig={arcoComponentConfig as ConfigProviderProps["componentConfig"]}
          locale={arcoLocale as ConfigProviderProps["locale"]}
        >
          <AuthProvider>
            <MarketDataProvider>
              <SidebarProvider defaultPanel="news">
                <MarketModalProvider>
                  <MarketOverviewModal />
                  {children}
                </MarketModalProvider>
              </SidebarProvider>
            </MarketDataProvider>
          </AuthProvider>
        </ConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
