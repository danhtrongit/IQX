# IQX frontend-v2 design system

This file defines the visual and interaction contract for the integrated IQX product. `src/index.css` is the token source of truth. `AGENTS.md` defines implementation rules.

## 1. Product character

IQX is a Vietnamese market intelligence and investing education product. The interface must feel precise, calm, data-dense, and trustworthy.

- **Brain Wave brand spectrum.** Every brand color is sampled from the official mark `public/brand/logo-mark.png`. The mark reads left to right as Electric Cyan `#00D2FC` (0 to 37% of the width) → Azure `#0090F6` (peak near 43%) → Electric Violet `#7800FC` (peak near 69%) → Magenta (body `#E319FB`, highlight `#F66CFC`), with a white neural node in a violet ring `#9003F0` and orchid highlight `#D85AFC`. Cyan is the dominant hue, violet the second, azure the bridge, magenta the end accent. There is no cobalt, gold, or green in the brand.
- **Azure** (`--primary`) is the platform anchor: primary actions, active navigation, focus, links, and the main chart series.
- **Electric Violet** (`--accent`) is the AI and intelligence color: AI triggers, AI badges, AI-generated chart overlays.
- **Cyan and Orchid Magenta** (`--brand-cyan`, `--brand-magenta`) are spectrum colors. They live inside the brand gradient, brand marks, and categorical chart series. They are never standalone action or state colors.
- **Financial state colors are strictly semantic, never decorative.** Vietnamese exchange tokens (`--price-up`, `--price-down`, `--price-ref`, `--price-ceiling`, `--price-floor`) are immutable legal standards and decoupled from the brand. The brand spectrum overlaps two of them (ceiling purple is near violet and magenta, floor cyan is near brand cyan), so section 2.4 forbids brand colors on any market number.
- **Dual-Zone Aesthetic Contract**:
  - **Zone A (Brand & AI Focal Points)**: the brand gradient and the subtle ambient glow (`shadow-brand-glow`) are permitted on brand marks (Header, Mobile Menu, Favicon, Auth, Admin), hero/editorial narrative surfaces (`/`), AI section mastheads and eyebrows (gradient text or a 2 to 3px rule only; AI buttons and badges use solid `accent`), and the single premium or upgrade CTA of a surface.
  - **Zone B (High-Density Analytical Workspaces)**: stock tables, order entry panels, financial reports, price boards (`/bang-gia`), and dense charts remain flat, crisp, and distraction-free: zero glassmorphism, background noise, glow, or heavy drop shadows. Brand color enters Zone B only through solid tokens (`primary`, `accent`, `chart-*`).
- No fabricated metrics, recommendations, testimonials, payment state, or market data.
- Product pages prioritize comprehension and speed. The introduction page may use more editorial spacing, but it must use the same type, color, and component language.

## 2. Tokens

Use semantic Tailwind classes backed by `src/index.css`. Never hardcode theme color values in components. Brand hex values below are documentation of the source; code uses the tokens.

### 2.1 Brand spectrum (sampled from the logo)

| Token | Logo source | Dark theme value | Light theme value | Role |
|---|---|---|---|---|
| `--brand-cyan` | `#00D2FC` | `#00D2FC` (logo exact) | `#0083A8` (deepened for white surfaces) | Gradient start, categorical series `chart-6` |
| `--brand-blue` | `#0090F6` | `#0090F6` (logo exact) | `#0066DB` | Same value as `--primary`, series `chart-1` |
| `--brand-violet` | `#7800FC` | `#9269FF` (lifted for legibility on navy) | `#7020E6` | Same value as `--accent`, series `chart-7` |
| `--brand-magenta` | `#F66CFC` highlight (body `#E319FB`) | `#F66CFC` (logo highlight) | `#AD22C2` | Gradient end, series `chart-8` |
| `--brand-node` | `#D85AFC` node highlight | `#D85AFC` | `#B428D0` | Neural node dot in brand illustrations only |

Light-theme values keep the logo hue and lower lightness so text and 3:1 graphics remain legible on white. Dark-theme values are logo exact wherever contrast on the navy canvas allows it.

Gradients (`110deg`, left to right like the logo, four stops at 0 / 42 / 70 / 100% to match where each hue peaks in the mark):

| Token / class | Stops | Use |
|---|---|---|
| `--brand-gradient` / `bg-brand-gradient`, `text-brand-gradient` | cyan → azure → violet → magenta, display values of the theme. Every stop stays ≥ 4.5:1 on its theme canvas, so `text-brand-gradient` is legible even at small sizes | Brand marks, hero headline accents, AI mastheads and eyebrows, 2 to 3px brand rules. Never behind body text. |
| `--brand-gradient-strong` / `bg-brand-gradient-strong` | `#0077B6` → `#006FD7` → `#7114EB` → `#A30FB8` in both themes | Fills that carry text: `Button variant="brand"`, `Badge variant="brand"`. Every stop is ≥ 4.8:1 against `--brand-foreground` (white). |
| `--brand-gradient-hover` / `hover:bg-brand-gradient-hover` | strong stops darkened about 3 to 4% L | Hover state of strong gradient fills. Always use with the `hover:` variant; the bare class paints the hover gradient permanently |
| `--brand-foreground` / `text-brand-foreground` | white | Text and icons on the strong gradient |
| `--brand-glow` / `shadow-brand-glow`, `border-brand-glow` | dark: cyan + violet halo; light: soft azure + violet shadow | Zone A only |

### 2.2 Semantic roles

| Role | Token or class | Use |
|---|---|---|
| Canvas | `bg-background` | App and page background |
| Primary surface | `bg-card` | Cards, panels, table surfaces |
| Secondary surface | `bg-secondary` | Controls, secondary sections |
| Quiet surface | `bg-muted` | Hover, selected rows, menu highlight, low-emphasis groups |
| Main action | `bg-primary` / `text-primary` | Azure. Primary CTA, active navigation, links, focus ring |
| AI action / highlight | `bg-accent` / `text-accent` | Electric Violet. AI triggers, AI badges, intelligence highlights. Not for menus, not for market data |
| Brand gradient (Zone A) | `bg-brand-gradient`, `text-brand-gradient`, `bg-brand-gradient-strong` | See 2.1 |
| Brand glow (Zone A) | `shadow-brand-glow` / `border-brand-glow` | Subtle luminescence on brand marks and active AI triggers |
| Main text | `text-foreground` | Titles, values, body |
| Secondary text | `text-muted-foreground` | Labels, descriptions, metadata, chart axes |
| Dividers | `border-border` | Hairlines, table separators, chart grid |
| Gain | `text-price-up` | Positive market movement and buy state |
| Loss | `text-price-down` | Negative market movement and sell state |
| Reference | `text-price-ref` | Reference price (Vietnamese exchange yellow/amber, decoupled from brand) |
| Warning | `text-status-warning`, `bg-status-warning/10`, `border-status-warning/50` | Pending, alert, anomaly, waiting states. Amber, never violet |
| Coins and rewards | `text-amber-700 dark:text-chart-2`, `bg-chart-2/10` | Xu balance, stars, trophies, gold mascots. Amber is the reward color, not a brand color |
| Ceiling | `text-price-ceiling` | Exchange ceiling price |
| Floor | `text-price-floor` | Exchange floor price |
| Học viện sub-text | `text-academy-subtle` | Lesson reader, quiz, lesson blocks: secondary lines, captions, card subtitles |
| Học viện chart label | `fill-academy-label` / `text-academy-label` | Lesson chart labels and ticks, locked-button text |

Học viện exception: inside the lesson reader, quiz, lesson blocks and lesson charts (`src/pages/academy`), text never uses `muted-foreground`. Long-form reading on a phone needs more contrast than workspace metadata, so sub-text uses `academy-subtle` (#dbe7f3 dark) and chart labels use `academy-label` (#c9d6e4 dark). Lines, grids and bars may stay grey. Source-scan tests enforce it.

Foreground pairs and measured contrast:

| Fill | Dark theme | Light theme |
|---|---|---|
| `primary` + `primary-foreground` | `#0090F6` + navy `#0B1320`, 5.6:1 | `#0066DB` + white, 5.3:1 |
| `accent` + `accent-foreground` | `#9269FF` + navy, 5.0:1 | `#7020E6` + white, 6.8:1 |
| `text-primary` on `card` | 5.3:1 | 5.3:1 |
| `text-accent` on `card` | 4.7:1 | 6.9:1 |

In dark mode the azure and violet fills carry navy text, not white: white on logo azure is only 3.3:1. `*-foreground` tokens are valid only on their own fill. On a transparent or bordered chip, use the base color (`text-accent`), never `text-accent-foreground`.

Both light and dark themes are required. Dark is the default trading experience. A page is incomplete if content, borders, charts, focus states, or semantic market colors fail in either theme.

### 2.3 Buttons and badges

One visual language for every action. Variants are defined once in `src/components/ui/button.tsx` and `badge.tsx`.

| Variant | Fill and text | Use | Limit |
|---|---|---|---|
| `default` | Azure `bg-primary` + `primary-foreground` | The main action of a surface | One per local surface |
| `accent` | Violet `bg-accent` + `accent-foreground` | AI actions: "AI Phân tích", generate insight, AI status | AI meaning only |
| `brand` | `bg-brand-gradient-strong` + white, `hover:bg-brand-gradient-hover`, standard focus ring | Premium, upgrade, hero CTA (Zone A) | At most one per screen. Never in Zone B toolbars |
| `outline` | Card fill, `border-border`, hover border `primary/45` + `bg-muted` | Secondary actions, filters | |
| `secondary` | `bg-secondary` | Neutral toggles, low-emphasis actions | |
| `ghost` | Transparent, hover `bg-muted` | Toolbars, icon buttons, rail | |
| `destructive` | Tinted `destructive/10` + `text-destructive` | Delete, revoke, cancel order. Always with confirmation | |
| `link` | `text-primary`, underline on hover | Inline navigation | |

Badge variants mirror this: `default` (azure), `accent` (AI labels such as "IQX AI"), `brand` (Premium tier), `secondary`, `outline`, `destructive`.

Rules:

- Buy and sell order buttons are market actions, not brand actions: they use `bg-price-up` and `bg-price-down` fills. Never azure, violet, or gradient.
- Focus: `ring-ring/50` (azure) on every variant. Hover: 150ms color change plus `brightness-110`; no lift, no shadow growth.
- Geometry: 32px high, 4px radius (`rounded-sm`). Sizes `xs`, `sm`, `lg`, and `icon*` keep the same color rules.
- Menus, selects, and dropdown items highlight with `bg-muted text-foreground`, never a solid accent fill.
- The retired `gold` variant does not exist. Premium uses `brand`; AI uses `accent`.

### 2.4 Brand and market color separation

Brand cyan sits next to floor cyan, and violet/magenta sit next to ceiling purple. To keep the board unambiguous:

- Never color a price, change, volume, percentage, or ticker with `accent`, `brand-*`, `chart-6`, `chart-7`, or `chart-8`. Market numbers use `foreground` or the five `price-*` tokens. `text-primary` marks links and selected state, not figures.
- In a chart that draws ceiling or floor lines, do not use `chart-6`, `chart-7`, or `chart-8` for other series.
- `--price-ref` is explicit amber in both themes (`#ffd60a` dark, `#8a6b0f` light). It is never bound to `var(--accent)` and never reused as `chart-2`.

### 2.5 Charts

Series tokens (Recharts, SVG, and TradingView overrides read `var(--chart-*)`):

| Token | Dark | Light | Meaning | Fixed by code |
|---|---|---|---|---|
| `chart-1` | `#0090F6` azure | `#0066DB` azure | Main series, the company, total, emphasis fill | `chart-tokens.ts` `accent` (legacy key name meaning chart-1 azure, not the violet `--accent`) |
| `chart-2` | `#D4AF37` amber | `#B8860B` amber | Threshold, warning, neutral or debt band | `chart-tokens.ts` `amber`/`warn` |
| `chart-3` | `price-up` | `price-up` | Good, rising, positive contribution | `good` |
| `chart-4` | `price-down` | `price-down` | Bad, falling, negative contribution | `bad` |
| `chart-5` | `#75889E` slate | `#607489` slate | Median, baseline, reference line, radar grid | `neutral`/`line` |
| `chart-6` | `#00D2FC` cyan | `#0083A8` cyan | Second categorical series, peer or benchmark | |
| `chart-7` | `#9269FF` violet | `#7020E6` violet | AI forecast or AI overlay series | |
| `chart-8` | `#F66CFC` magenta | `#AD22C2` magenta | Fourth categorical series | |

Semantic charts (financial health, waterfall, peer bars, scorecards) use `chart-1` to `chart-5` with the meanings above; `chart-2` must stay amber and `chart-5` must stay neutral. Categorical charts with unrelated series follow the brand order `chart-1`, `chart-6`, `chart-7`, `chart-8`, then `chart-2`, `chart-5`. More than six categories need grouping or direct labels, not more hues.

Chart chrome:

| Element | Token and style |
|---|---|
| Chart title | `font-heading text-sm font-bold tracking-[-0.01em] text-foreground` |
| Title marker | 3 × 16px bar, `rounded-[1px] bg-primary`. An AI-generated chart uses `bg-accent`. Brand-gradient marker only on Zone A surfaces |
| Subtitle, unit, source, timestamp | `text-xs text-muted-foreground`, unit in the subtitle (tỷ VND, %, cổ phiếu) |
| Header tag pill | `rounded-full border-border bg-secondary text-secondary-foreground text-xs font-semibold`; frozen state `bg-muted text-muted-foreground` |
| Axis ticks and labels | `fill-muted-foreground`, 11px, `tabular-nums` |
| Grid and baselines | `stroke-border`, 1px, dashed horizontal grid only where it aids reading |
| Reference line | `chart-5` dashed; reference price line uses `price-ref` |
| Tooltip | `bg-popover text-popover-foreground border-border`, 4px radius, `shadow-2`, values `tabular-nums` |
| Legend | 8px square or 2px line swatch in the series token, label `text-xs text-muted-foreground` |
| Area fill | Series token at 12 to 18% opacity, no gradient glow |

`ChartCard` in `src/pages/market-workspace/market/views/charts/chart-card.tsx` is the reference implementation of title, marker, and tag. Charts stay flat (Zone B): no glow, no gradient fills except a single-hue opacity fade.

## 3. Typography

| Role | Typeface | Rules |
|---|---|---|
| Headings | Space Grotesk Variable | `font-heading`, concise, strong hierarchy |
| UI and prose | Be Vietnam Pro | `font-sans`, Vietnamese copy |
| Prices and quantities | Be Vietnam Pro | Add `tabular-nums`, right-align in tables |

Use weights 400, 500, 600, and 700. Functional text must remain readable at 12px or larger. Ten and eleven pixel text is limited to compact metadata, chart axes, and table overlines.

Default hierarchy:

- Page title: 24 to 32px, `font-heading`, 600 or 700
- Panel title: 18px, `font-heading`, 600 or 700
- Section title: 14 to 16px, 600
- Body and controls: 13 to 14px
- Dense tables: 12px with tabular numbers

## 4. Geometry and density

Root dimensions are tokens:

| Surface | Size |
|---|---|
| Global header | `--header-top: 48px` |
| Workspace panel header | `--panel-header-height: 64px` |
| Right workspace sidebar | `--sidebar-width: 25rem` |
| Workspace rail | `--rail-width: 5rem` |
| Page padding | `--page-padding: 12px` |

Control and surface rules:

- Standard button, input, and select height: 32px
- Compact tab or filter control: 28 to 32px
- Control radius: 4px
- Card radius: 8px
- Cards use subtle dividers or the provided token shadows. Never stack heavy shadows.
- Data tables use sticky headers where useful, compact rows, and visible hover state.
- Full-page workspaces own the available viewport. Do not introduce document scrolling when a panel should scroll.

## 5. Layout families

### Introduction

The `/` page is an editorial product narrative, not a fake SaaS template.

- Lead with product purpose and real capabilities.
- Use asymmetry, strong typography, authentic product diagrams, and generous section rhythm.
- Keep one clear primary action per section.
- Do not add invented social proof, inflated statistics, or decorative floating cards.
- Use real product captures and existing IQX brand artwork. Label static market captures with their capture date.

### Market and analysis workspaces

Routes such as `/thi-truong`, `/bieu-do`, `/co-phieu/:symbol`, and `/demo-trading` use dense terminal-style composition.

- Main analysis surface fills remaining width.
- Optional right sidebar is 25rem.
- Tool rail is 5rem.
- URL search parameters preserve active view, symbol, tab, and tour state when applicable.
- Custom `ScrollArea` is required for sidebars and deliberate overflow regions.
- A wide financial table may scroll horizontally, but its scrollbar must use the customized `ScrollArea` primitive.

### Directory, account, learning, and strategy

These routes use a responsive centered content column or full-width data workspace as their information density requires. Reuse `WorkspacePage`, `PagePanel`, cards, tables, and state components. Do not create a second shell.

### Administration

All `/admin/**` routes live under `AdminLayout`.

- Desktop: persistent navigation sidebar and content canvas.
- Mobile: navigation in the shared Sheet.
- List pages expose filters, pagination, real loading state, and explicit empty state.
- Detail pages expose safe mutations with confirmation and server response.
- The client role gate is navigation safety only. Every admin API remains server-authorized.
- Team leads (`team_lead`) see a reduced layout: the Quản lý group with Tổng quan and Người dùng, a referral code card at the bottom of the navigation, and their name with a secondary "Trưởng nhóm" badge in the top bar. The badge is a plain role label, so it never uses the violet `accent`.
- The team variants of Tổng quan, Người dùng and user detail reuse the admin building blocks (`overview-panels.tsx`, `user-360-body.tsx`, `UserAcademyTab`) so both scopes look the same. Profit columns show a percentage only, coloured with `text-price-up`/`text-price-down` and uncoloured at zero; a missing account reads "Chưa kích hoạt". The team user detail is read-only apart from "Loại khỏi nhóm" and never links to an admin-only page.
- Reason-required confirmations (appoint, policy change, revoke, add, move, or remove a group member) use the shared `ReasonDialog`; the confirm button stays disabled until the reason is filled and, for edits, until something changed.

## 6. Components

Use the components in `src/components/ui`. They are customized shadcn components built on Radix.

| Need | Component and IQX rule |
|---|---|
| Brand emblem | `BrainWaveLogo` component or brand SVG; retires legacy Lucide `<Triangle />` |
| Primary action | `Button`; one primary action per local surface. Variant rules in section 2.3 |
| Destructive action | Destructive `Button` plus confirmation dialog |
| Text entry | `Input` or `Textarea`; visible label and error |
| Choice | `Select`, `Checkbox`, `Switch`, or `RadioGroup`; never build a fake div control |
| Tabs | `Tabs`; line variant inside analytical cards, active indicator `primary` |
| Card | `Card`; 8px radius, restrained border or shadow |
| Table | `Table`; compact, tabular, responsive overflow |
| Overflow | `ScrollArea`; use `orientation="horizontal"` or `"both"` where required |
| Modal | `Dialog`, `AlertDialog`, `Sheet`, or `Drawer` according to task |
| Menu | `DropdownMenu`; compact items, `bg-muted` highlight, never a solid accent fill |
| Feedback | `sonner`; concise success or error message |
| Loading | `Skeleton` shaped like eventual content |
| Empty/error | `PanelState` or an equivalent domain-specific state |
| Icons | Lucide React only for interface icons; do not use interface icons as brand marks |

The legacy Lucide `<Triangle />` logo mark is retired. Brand representation across header, mobile menu, auth dialogs, and admin layout uses the official Brain Wave emblem (`BrainWaveLogo`) with optional subtle ambient glow. Do not use emoji, Unicode arrows, check marks, or punctuation as interface icons. Icons need an accessible name when they act alone. Decorative icons use `aria-hidden`.

## 7. shadcn customization contract

The local files in `src/components/ui` are the design system. Add a missing primitive with `npx shadcn@latest add <name>`, then restyle it to these rules before use.

After a shadcn update, verify:

- Token classes replace hardcoded neutral colors.
- Controls remain 32px high and 4px radius unless their documented variant differs.
- Dropdown, menubar, and select items stay compact with `bg-muted` hover and focus. shadcn's default `focus:bg-accent` must be replaced because `accent` is the violet AI color.
- Dialog overlays remain strong enough to isolate the task.
- Focus rings are visible in both themes.
- `ScrollArea` keeps its custom thin thumb. Horizontal scrollbars are siblings of the Radix viewport, never nested inside it.
- No raw Nova background, radius, ring, or shadow overrides leak into product pages.

Never add another component system or a parallel `iqx-*` component tree.

## 8. Data and state presentation

- Show the server result, not an optimistic fiction, for payment, entitlement, admin, and trading state.
- Keep source and timestamp visible when data recency matters.
- Preserve units in labels: VND, tỷ VND, cổ phiếu, percentage, date, and time.
- Unknown values use a consistent neutral placeholder. Do not convert missing data to zero.
- Market direction is expressed with number sign, semantic color, and text where accessibility needs it.
- Premium gates explain what is unavailable without blocking public or journey-free actions.
- Authentication expiry must show a re-login state. Never silently replace an authenticated journey with guest progress.

Required asynchronous states:

1. Loading: content-shaped skeleton or intentional progress state.
2. Empty: explain why the collection is empty and offer a valid next action.
3. Error: preserve server detail when safe and offer retry.
4. Success: update from the authoritative response and confirm briefly.

## 9. Motion and accessibility

- Motion is functional: 150 to 250ms color, opacity, or small transform.
- Respect `prefers-reduced-motion`.
- Journey mascot motion represents progression, reveal, or bot status. Pause it when hidden and record completion only after the visible presentation.
- Subtle ambient glow (`shadow-brand-glow`) is restricted to Zone A: brand marks, AI mastheads, and the hero. Buttons, including `brand`, never glow. Dense workspaces, financial tables, and analytical cards remain free of glow.
- Continuous decorative animation, heavy pulsating glows, card lift, or scroll hijacking are strictly forbidden.
- Every interactive element is keyboard reachable.
- Visible focus is mandatory.
- Icon-only controls require a tooltip or accessible label.
- Dialogs, menus, and sheets use Radix focus management.
- Text and state colors must meet readable contrast (WCAG AA) in both light and dark themes.

## 10. Responsive behavior

Verify at 1440x900, 1024x768, and a narrow mobile viewport.

- No document-level horizontal overflow.
- Header navigation may use a hidden-scrollbar horizontal strip on narrow screens.
- Tables preserve columns through custom horizontal scrolling instead of collapsing financial meaning.
- Sidebars become Sheets or stack below the main surface.
- Primary content remains first in reading and focus order.
- Touch targets remain practical even when visual controls are compact.

## 11. UI completion checklist

- Real route and real API exercised.
- Light and dark themes checked.
- Desktop and mobile checked.
- Loading, empty, error, and permission states checked.
- No native sidebar scrollbar.
- No emoji or text glyph pretending to be an icon.
- No placeholder records or invented product claims.
- No raw shadcn defaults inconsistent with IQX tokens.
- Color roles respected: `accent` only for AI, amber `status-warning` for warnings, no `*-foreground` off its own fill, no `accent`/`brand-*`/`chart-6` to `chart-8` on market numbers, gradients only in Zone A.
- Build and lint pass for changed source.
