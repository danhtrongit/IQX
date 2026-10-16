# IQX frontend-v2 design system

This file defines the visual and interaction contract for the integrated IQX product. `src/index.css` is the token source of truth. `AGENTS.md` defines implementation rules.

## 1. Product character

IQX is a Vietnamese market intelligence and investing education product. The interface must feel precise, calm, data-dense, and trustworthy.

- **Brain Wave Brand Spectrum**: The brand visual identity is anchored by the IQX Brain Wave spectrum (Electric Cyan `#00D4FF` → Cobalt/Royal Blue `#2563EB` → Vibrant Violet/Magenta `#7C3AED`–`#D946EF`), representing real-time market wave dynamics and multi-layer neural AI intelligence.
- **Cobalt/Royal Blue** (`--primary`) is the core platform anchor for primary actions, active navigation, and brand chrome.
- **Vibrant Violet/Magenta** (`--accent`) and **Electric Cyan** (`--brand-cyan`) designate high-emphasis actions, AI intelligence highlights, and interactive focal points.
- **Financial state colors are strictly semantic, never decorative**: Vietnamese stock exchange tokens (`--price-up`, `--price-down`, `--price-ref`, `--price-ceiling`, `--price-floor`) are immutable legal standards and strictly decoupled from brand accent colors. Reference prices are represented strictly by `--price-ref` (yellow/amber), never conflated with brand colors.
- **Dual-Zone Aesthetic Contract**:
  - **Zone A (Brand & AI Focal Points)**: Controlled brand gradients (Electric Cyan → Cobalt Blue → Violet/Magenta) and subtle ambient glow (`shadow-brand-glow`) are permitted on brand marks (Header, Favicon, Auth), hero/editorial narrative surfaces (`/`), AI intelligence triggers/badges, and primary CTAs.
  - **Zone B (High-Density Analytical Workspaces)**: Stock tables, order entry panels, financial reports, price boards (`/bang-gia`), and dense charts remain completely flat, crisp, and distraction-free (zero glassmorphism, background noise, or heavy drop shadows).
- No fabricated metrics, recommendations, testimonials, payment state, or market data.
- Product pages prioritize comprehension and speed. The introduction page may use more editorial spacing, but it must use the same type, color, and component language.

## 2. Tokens

Use semantic Tailwind classes backed by `src/index.css`. Never hardcode theme color values in components.

| Role | Token or class | Use |
|---|---|---|
| Canvas | `bg-background` | App and page background |
| Primary surface | `bg-card` | Cards, panels, table surfaces |
| Secondary surface | `bg-secondary` | Controls, secondary sections |
| Quiet surface | `bg-muted` | Hover, selected rows, low-emphasis groups |
| Main action | `bg-primary` | Primary CTA, active navigation, focus |
| High-emphasis action / AI highlight | `bg-accent` | AI triggers, order CTA, and selective financial emphasis |
| Brand gradient (Zone A) | `bg-brand-gradient` / `text-brand-gradient` | Brand marks, hero badges, primary brand CTAs |
| Brand glow (Zone A) | `shadow-brand-glow` / `border-brand-glow` | Subtle ambient luminescence on brand mark and active AI triggers |
| Main text | `text-foreground` | Titles, values, body |
| Secondary text | `text-muted-foreground` | Labels, descriptions, metadata |
| Dividers | `border-border` | Hairlines and table separators |
| Gain | `text-price-up` | Positive market movement only |
| Loss | `text-price-down` | Negative market movement and sell state |
| Reference | `text-price-ref` | Reference price (Vietnamese exchange yellow/amber, decoupled from brand accent) |
| Ceiling | `text-price-ceiling` | Exchange ceiling price |
| Floor | `text-price-floor` | Exchange floor price |

Both light and dark themes are required. Dark is the default trading experience. A page is incomplete if content, borders, charts, focus states, or semantic market colors fail in either theme.

Vietnamese stock market tokens (`--price-up`, `--price-down`, `--price-ref`, `--price-ceiling`, `--price-floor`) are immutable and strictly decoupled from brand accent colors. Specifically, in dark mode `--price-ref` is an explicit amber/yellow token (`#ffd60a`), never bound to `var(--accent)`.

Chart mapping:

- `chart-1`: IQX Cobalt Blue (primary series / main benchmark)
- `chart-2`: IQX Electric Cyan (secondary series / market signals)
- `chart-3`: Positive market movement (`--price-up`)
- `chart-4`: Negative market movement (`--price-down`)
- `chart-5`: IQX Vibrant Violet (AI neural overlay and comparison)

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

## 6. Components

Use the components in `src/components/ui`. They are customized shadcn components built on Radix.

| Need | Component and IQX rule |
|---|---|
| Brand emblem | `BrainWaveLogo` component or brand SVG; retires legacy Lucide `<Triangle />` |
| Primary action | `Button`; one primary action per local surface |
| Destructive action | Destructive `Button` plus confirmation dialog |
| Text entry | `Input` or `Textarea`; visible label and error |
| Choice | `Select`, `Checkbox`, `Switch`, or `RadioGroup`; never build a fake div control |
| Tabs | `Tabs`; line variant inside analytical cards |
| Card | `Card`; 8px radius, restrained border or shadow |
| Table | `Table`; compact, tabular, responsive overflow |
| Overflow | `ScrollArea`; use `orientation="horizontal"` or `"both"` where required |
| Modal | `Dialog`, `AlertDialog`, `Sheet`, or `Drawer` according to task |
| Menu | `DropdownMenu`; compact items and muted hover |
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
- Dropdown and select items stay compact with muted hover.
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
- Permissible subtle ambient glow (`shadow-brand-glow`) is strictly restricted to brand marks and AI intelligence highlights under Zone A. Dense workspaces, financial tables, and analytical cards remain free of glow.
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
- Build and lint pass for changed source.
