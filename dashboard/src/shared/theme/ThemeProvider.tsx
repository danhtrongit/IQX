import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "iqx-theme"

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Read the theme already applied by the pre-paint bootstrap in index.html. */
function getInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.body.getAttribute("arco-theme")
    if (attr === "light" || attr === "dark") return attr
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    /* ignore */
  }
  return "dark"
}

function applyTheme(theme: Theme) {
  // Arco reads `body[arco-theme="dark"]`; our Tailwind `dark:` variant keys off the same.
  document.body.setAttribute("arco-theme", theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  // Pure state setters — no side effects in the updater (StrictMode double-invokes
  // updaters in dev, which would cancel a toggle if it mutated the DOM here).
  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  )

  // The single side-effect site: apply the attribute + persist whenever theme changes.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
