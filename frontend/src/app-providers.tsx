import type { ReactNode } from "react"
import {
  hashKey,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/context/auth-provider"

/** Provider tree shared by the browser entry (main.tsx) and the SSR entry. */

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: (key) => hashKey(["api-v2", ...key]),
        staleTime: 30_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

const LIGHT_DEFAULT_PATHS = ["/", "/gioi-thieu", "/about"]

export function defaultThemeFor(pathname: string) {
  return LIGHT_DEFAULT_PATHS.includes(pathname) ? "light" : "dark"
}

export function AppProviders({
  pathname,
  queryClient,
  children,
}: {
  pathname: string
  queryClient: QueryClient
  children: ReactNode
}) {
  return (
    <ThemeProvider defaultTheme={defaultThemeFor(pathname)}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
