import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import {
  hashKey,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/context/auth-provider"

const queryClient = new QueryClient({
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme={
        ["/", "/gioi-thieu"].includes(window.location.pathname)
          ? "light"
          : "dark"
      }
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <App />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
