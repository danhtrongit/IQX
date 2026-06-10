# IQX Dashboard — Foundation Contracts (READ FIRST)

This is the **frozen contract** for the Arco Design rebuild. Every feature is ported
from `../dashboard-bak` (the old shadcn/ui app — reference only) onto these primitives.
Do not re-derive; reuse what's here.

## Stack
React 19 · TypeScript (strict) · Vite 8 · React Router 7 · **Arco Design** (`@arco-design/web-react`)
· Tailwind v4 (utilities only, no Preflight) · TanStack Query v5 · ky · recharts · framer-motion · @xyflow/react.

## Golden rules
1. **Arco-first.** Build structure with Arco `Layout/Grid/Space/Divider/Table/Tabs/Card/Modal/Drawer/
   Dropdown/Menu/Form`. Reach for Tailwind utilities only for spacing/positioning Arco can't express.
   Do **not** write `.css` files or override Arco internals. No CVA, no shadcn.
2. **Icons = Arco.** `import { IconSearch, IconUser, ... } from "@arco-design/web-react/icon"`.
   For icons Arco lacks (drawing tools, brand marks), add a custom SVG to `src/shared/icons/index.tsx`
   via `createSvgIcon`. Never reintroduce `lucide-react`.
3. **One HTTP client.** Always `import { api } from "@/shared/http/client"`. Never `fetch()` directly,
   never create another ky instance. Market endpoints return `{ data, meta }` — use `unwrap()`.
4. **Server state = TanStack Query.** No `useEffect`+`useState` fetching, no manual caches. Each feature
   owns `api.ts` (typed endpoint fns) + `hooks.ts` (`useQuery`/`useMutation` wrappers) + local `keys.ts`.
5. **Adapters** (snake_case → camelCase) live in the feature's `api.ts`. Keep UI camelCase.
6. **Density** comes from `ConfigProvider` defaults (`size="small"`) — already global. Dense tables may
   set `size="mini"` per instance. Don't hand-tune padding.
7. **Vietnamese copy.** All user-facing text in Vietnamese (match `dashboard-bak`).
8. **Dark mode** is automatic (Arco `body[arco-theme]`). For Tailwind utilities that need a dark variant,
   use `dark:` (already wired to the same attribute). Prefer Arco CSS vars (`var(--color-text-2)`,
   `var(--color-border-2)`, `var(--color-bg-2)`, …) over hardcoded colors.

## Directory convention (feature-first)
```
src/
  app/        providers.tsx, router.tsx, shell/    ← INTEGRATOR-ONLY (do not edit; see below)
  shared/     http/ query/ theme/ icons/ lib/ contexts/ ui/
  features/<feature>/   api.ts  keys.ts  hooks.ts  types.ts  components/  <Feature>Page.tsx  index.ts
  pages/      thin route entries (compose features)
```

## ⛔ Integrator-only files (DO NOT EDIT in a feature agent — you'll cause merge conflicts)
`src/app/providers.tsx`, `src/app/router.tsx`, `src/app/shell/*`, `src/index.css`, `src/main.tsx`.
If your feature needs a provider or route, **export** it from your feature's `index.ts` and state so in
your summary; the integrator wires it in.

## Available foundation APIs (import and use — already built & verified)

### HTTP — `@/shared/http/client`
- `api` — the ky instance (`prefixUrl: /api/v1`, bearer auth + 401 auto-refresh baked in).
- `unwrap<T>(res)` — strip the `{ data, meta }` market envelope.
- `getErrorMessage(err, fallback?)` → `Promise<string>` — Vietnamese-friendly error text (use in catch).
- `getAccessToken/setAccessToken/clearAuthTokens`, `AUTH_LOGOUT_EVENT`.

### Query — `@/shared/query/*`
- `queryClient` (don't recreate). `sharedKeys` / `userScopedKeys` for cross-feature invalidation.
- Define feature-local keys in `features/<f>/keys.ts` as `const` objects of `readonly` tuples.

### Auth — `@/features/auth` (built)
- `useAuth()` → `{ user, isAuthenticated, isLoading, login, register, logout, refreshUser,
  showAuthModal, setShowAuthModal, authModalTab, setAuthModalTab }`.
- `authApi`, types `AuthUser`, `LoginPayload`, `RegisterPayload`.
- The **auth modal UI** is owned by the auth feature (batch A). Open it via `setShowAuthModal(true)`.

### Theme — `@/shared/theme/ThemeProvider`
- `useTheme()` → `{ theme: "light"|"dark", setTheme, toggleTheme }`.

### UI contexts — `@/shared/contexts/*`
- `useSymbol()` → `{ symbol, setSymbol }` (active ticker; provided per-route from URL).
- `useSidebar()` → dashboard rail state (`activePanel`, `togglePanel`, `isOpen`, forecast window).

### Lib — `@/shared/lib/*`
- `cn(...)` (class merge). `format.ts`: `fmtNumber`, `fmtVnd`, `fmtPrice`, `fmtPercent`, `fmtCompact`, `fmtDuration`.

### Semantic colors (Tailwind tokens, dark-aware): `text-up`/`bg-up` (green), `text-down` (red),
`text-reference` (yellow), `text-ceiling` (purple), `text-floor` (cyan). Price-flash CSS classes
`price-flash-up` / `price-flash-down` exist for live tick animation.

## Cross-feature CONTRACTS to build against (so everything parallelizes)

### `@/features/market-data` (batch B owns the implementation; others only consume)
Preserve `dashboard-bak`'s batched, ref-counted polling but back it with TanStack Query
(one union query, `refetchInterval` 5s prices / 10s indices, paused when tab hidden). Export hooks with
these EXACT signatures (ported from `dashboard-bak/src/contexts/market-data-context.tsx` +
`hooks/use-market-data.ts` + `features/market/api.ts`):
- `usePrice(symbol: string): { data: PriceBoardData | null; isLoading: boolean }`
- `usePrices(symbols: string[]): { priceMap: Record<string, PriceBoardData>; isLoading: boolean }`
- `useIndices(): { indices: IndexData[]; isLoading: boolean }`
- `useSymbolSearch(q: string)` — typeahead for the global search (GET `market-data/reference/symbols/search`).
- Types `PriceBoardData`, `IndexData` (`{ name; value; change; changePercent; trend: "up"|"down"|"flat" }`).
- Exports `MarketDataProvider` (integrator wires into providers.tsx).
Consumers: `import { usePrice } from "@/features/market-data"`.

### `@/features/premium` (batch A)
- `usePremiumStatus()` → `{ isPremium, isTrial, daysRemaining, periodEnd, isLoading }` via `useQuery`
  (key `sharedKeys.premium.me`, `enabled: isAuthenticated`). Replaces the old listener-cache hook.
- `premiumApi` (plans, checkout), `PremiumPage`, `PaymentResultPage`, plus a `<PremiumGate>` wrapper.

## Backend (FastAPI `/api/v1`, unchanged) — key endpoints
auth: `POST auth/login|register|refresh|logout`, `GET auth/me` · users: `GET|PATCH users/me` ·
market-data: `GET reference/symbols(/search)`, `quotes/{s}/ohlcv|intraday|price-depth`,
`POST trading/price-board`, `GET overview/market-index`, `company/{s}/*`, `fundamentals/{s}/{type}`,
`bctc/{s}`, `trading/{s}/foreign-trade|insider-deals`, `insights/ranking/{kind}` ·
premium: `GET plans|me|my-orders`, `POST checkout` · virtual-trading: `account|portfolio|orders` ·
watchlist: `GET|POST|DELETE|PUT` · lessons: `GET courses(/{slug})`, `episodes/{id}/content`,
`POST episodes/{id}/progress` · ai (premium): `POST dashboard/analyze`, `industry/analyze(-batch)`,
`insight/analyze`. All market responses are `{ data, meta }`.

## Routes (rebuild these paths)
`/` & `/dashboard` → Dashboard (terminal) · `/gioi-thieu` → marketing landing · `/thi-truong` →
market overview (16 panels) · `/du-bao` → forecast · `/co-phieu` → stock directory ·
`/co-phieu/:symbol` → stock detail · `/cai-dat` → settings · `/nang-cap` → premium ·
`/thanh-toan/(thanh-cong|that-bai|huy)` & `/payment/(success|error|cancel)` → payment result ·
`/503` → maintenance · `/bai-hoc`, `/bai-hoc/:slug`, `/bai-hoc/:slug/:episodeId` → lessons · `*` → 404.

## Per-feature deliverable
1. Read the corresponding `dashboard-bak` sources; port **logic/behavior/Vietnamese copy** faithfully.
2. Re-express UI with Arco components per the golden rules; migrate icons to Arco.
3. Move data access to feature `api.ts` + TanStack Query `hooks.ts`.
4. Export public surface from `index.ts`; list any provider/route the integrator must wire.
5. Keep it typechecking against these contracts. Return a SHORT summary (files, decisions, blockers) —
   not full code.
