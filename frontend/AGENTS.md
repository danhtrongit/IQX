# frontend-v2 contributor contract

Rules for every human or agent editing `frontend-v2`. `DESIGN.md` is the visual contract. `src/index.css` is the token source of truth.

## 1. Scope and stack

`frontend-v2` is the integrated IQX web product. It replaces the legacy dashboard and standalone admin frontends without importing their UI systems.

- Vite 8, React 19, TypeScript, React Router
- Tailwind CSS v4
- Customized shadcn components in `src/components/ui`
- Radix primitives through shadcn
- TanStack Query for server state
- Recharts for product charts
- TradingView Charting Library for the advanced chart workspace
- React Markdown and React PDF for learning content
- Alias: `@/` maps to `src/`

Do not edit the legacy `dashboard/` or `admin/` to implement a v2 feature. They are behavioral references only.

## 2. Architecture

```text
src/
  App.tsx                    route tree and lazy page boundaries
  components/
    layout/                  AppShell, AdminLayout, workspace chrome
    ui/                      customized shadcn design system
    charts/                  shared market chart components
  config/chrome.ts           route chrome and rail configuration
  context/                   auth, theme, rail, shared providers
  lib/                       API client, formatting, domain helpers
  pages/
    introduction/
    market-workspace/
    securities/
    charts/
    demo-trading/
    strategy/
    learning/
    account/
    admin/
    system/
```

Use one route folder per domain. Keep API adapters, query hooks, types, and domain components near their page unless they are genuinely shared.

## 3. Canonical routes

Public and authenticated product routes:

| Route | Surface |
|---|---|
| `/` | Product introduction |
| `/thi-truong` | Market brief, stock insight, financial analysis |
| `/co-phieu` | Securities directory |
| `/co-phieu/:symbol` | Full stock detail |
| `/bang-gia` | Live price board |
| `/bieu-do` | Advanced chart workspace |
| `/demo-trading` | Learning journey and virtual trading |
| `/chien-luoc` | Alerts and backtest |
| `/bai-hoc` | Course catalog |
| `/bai-hoc/:slug` | Course detail |
| `/bai-hoc/:slug/:episodeId` | Episode viewer |
| `/kien-thuc` | Knowledge entry using the shared course catalog |
| `/cai-dat` | Account settings |
| `/nang-cap` | Plans, entitlement, and SePay checkout |
| `/quen-mat-khau` | Password recovery request |
| `/reset-password` | Password reset |
| `/payment/success`, `/payment/error`, `/payment/cancel` | Server-verified payment result |
| `/thanh-toan/thanh-cong`, `/thanh-toan/that-bai`, `/thanh-toan/huy` | Vietnamese payment-result routes |

Legacy aliases redirect to the canonical route and preserve meaningful search parameters: `/gioi-thieu`, `/dashboard`, `/dau-truong`, `/canh-bao`, and `/backtest`.

Admin routes are nested under `/admin` and must use `AdminLayout`:

- Dashboard, users, and user detail
- Plans, subscriptions, subscription detail
- Payments, payment detail, and IPN logs
- Virtual trading accounts, account detail, and configuration
- Audit, system health, and alert signals
- Courses and course editor

Do not register an admin page outside this nested layout.

## 4. Routing and code splitting

- Page modules are lazy-loaded in `App.tsx`.
- Heavy viewers such as PDF and Markdown are lazy-loaded inside the episode route.
- Preserve view, symbol, tab, and tour state in URL search parameters where the route already does so.
- Use redirects for legacy aliases. Do not maintain duplicate implementations.
- Unknown routes render the shared 404 state. Service downtime uses `/503`.
- Per-route workspace chrome comes from `handle.chrome` and `src/config/chrome.ts`.

## 5. API and server state

- `src/lib/api.ts` is the HTTP boundary. Reuse it.
- Use `apiResponse` from that module for raw responses such as CSV exports. It shares refresh and expiry behavior with `api`.
- Use TanStack Query for cacheable server state and mutation invalidation.
- Backend responses are authoritative for trading fills, journey evidence, entitlement, payment, and admin mutations.
- Never infer that a payment succeeded from a return URL. Only the server order and IPN state can confirm payment.
- Never manufacture market data, AI analysis, course records, admin metrics, or successful mutations.
- Preserve backend error detail when it is safe for the user.
- Missing numeric data is not zero.
- Keep units and timestamps explicit.
- TradingView `Bar.time` uses milliseconds; history request boundaries use seconds.
- Market index cards use `MarketDataProvider`, never sample index fixtures.
- Persist journey presentation milestones only after a visible animation completes. Hidden panels and mounting alone must not mark them seen.
- Payment polling starts a fresh bounded window for each order reference. Terminal status of that order ends its polling.

Mutation sequence:

1. Validate client input for usability.
2. Submit the real API request.
3. Use the accepted server response.
4. Invalidate every affected query domain.
5. Show concise success or failure feedback.

Use optimistic updates only when the domain can safely reconcile them. Do not use them for money, access, trading execution, or administrative state transitions.

## 6. Authentication and authorization

- `AuthProvider` owns account, premium, dialog, and session-expiry state.
- Rejected refresh credentials clear the active session and set `sessionExpired`; transient network failures do not. Guest 401 responses and explicit logout do not represent session expiry.
- Authenticated workspaces must show re-login and recovery when the session expires. Never silently remount them as guest state.
- Registration receives the backend trial behavior. Do not fake trial entitlement on the client.
- Client premium checks control presentation only. Backend guards remain authoritative.
- Free journey levels remain usable when their legacy contract is free. Premium gates apply only to the premium analysis feature itself.
- `AdminLayout` checks `user.role === "admin"` for navigation safety.
- Every admin endpoint must still reject non-admin callers. Never treat the layout gate as security.

## 7. Design system

Follow `DESIGN.md`.

- Body and UI: Be Vietnam Pro.
- Headings: Space Grotesk Variable.
- Dark is the default trading theme; light must work.
- Use semantic token classes. No hardcoded theme hex in JSX.
- Use `tabular-nums` for price, volume, quantity, and money.
- Use market semantic colors only for actual market meaning.
- Use Lucide React for interface icons and real SVG for brand artwork.
- No emoji or Unicode glyph used as an icon.
- No gradient, glow, glassmorphism, continuous decorative motion, or nested card clutter.
- Product pages are dense and functional. The introduction route may use editorial spacing without becoming a generic landing template.

## 8. shadcn components

The design system is the customized component set in `src/components/ui`.

When a component is missing:

1. Run `npx shadcn@latest add <name>`.
2. Inspect the generated classes.
3. Reapply IQX tokens, density, radius, focus, and theme rules from `DESIGN.md`.
4. Verify every existing consumer if a shared primitive changed.

Do not:

- Import raw Radix in a page when a local shadcn wrapper exists.
- Add a second component library.
- Add a parallel component kit.
- Ship raw Nova defaults that conflict with IQX.
- Put a Radix scrollbar inside its viewport.

`ScrollArea` supports `orientation="vertical"`, `"horizontal"`, and `"both"`. Use it for sidebars and deliberate overflow. A horizontal financial table must use the custom horizontal orientation. Small navigation strips may use `no-scrollbar` when a visible scrollbar would add noise.

## 9. Layout and responsive rules

- `AppShell` owns the global header and route outlet.
- `WorkspacePage` and `PagePanel` are the default product page structures.
- The trading shell uses a 48px header, 64px panel header, 25rem sidebar, and 5rem rail.
- Admin desktop navigation becomes a Sheet on narrow screens.
- No document-level horizontal overflow.
- Financial tables scroll rather than discard columns.
- Reading and focus order put primary content first.
- Verify 1440x900, 1024x768, and a narrow mobile viewport.

## 10. Component and copy rules

- TypeScript strict. No `any`.
- UI copy is Vietnamese. Code, types, files, and tokens are English.
- Prefer existing formatting helpers and query patterns.
- Interactive elements use semantic buttons, links, inputs, and Radix primitives.
- Icon-only controls need an accessible label or tooltip.
- Decorative icons use `aria-hidden`.
- Loading uses content-shaped skeletons.
- Empty states explain the absence and provide a valid next action.
- Error states offer retry when retry is meaningful.
- Destructive or privileged actions require explicit confirmation.
- Avoid visible em dash and en dash punctuation. Use sentences, colons, commas, or layout.

## 11. Required implementation workflow

Before editing:

1. Read the relevant route, API adapter, query hooks, and existing component pattern.
2. Check all callsites before changing an exported symbol.
3. Confirm backend DTO, guard, and response shape for data-affecting features.

While editing:

1. Fix the source behavior rather than hiding the symptom.
2. Reuse the existing design system.
3. Migrate all callers in the same change.
4. Remove obsolete aliases, helpers, comments, and dead branches.

Before delivery:

1. Exercise the changed route against the real backend.
2. Check loading, empty, error, permission, and success states that apply.
3. Visually check desktop and mobile, plus light and dark for UI changes.
4. Run `npm run build`.
5. Run `npm run lint` and resolve diagnostics in owned source.

For virtual trading or journey behavior, run the focused backend scenario or test that covers execution and progression. For admin behavior, verify both an authorized request and a non-admin denial.

## 12. Forbidden

- Editing legacy apps as the v2 implementation.
- Fake success, fake fallback data, or invented product claims.
- Client-only authorization.
- A second API client or component library.
- Hardcoded brand colors in components.
- Raw native sidebar scrollbars.
- Light-only or dark-only pages.
- Placeholder routes, dead buttons, or TODO implementations.
- New markdown files unless the user explicitly requests them.
