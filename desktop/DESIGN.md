# IQX Desktop design system

Visual and interaction contract for the native IQX desktop app (Rust, GPU-rendered UI). Style: **Liquid Glass**, adapted to a data-dense trading product and a hard performance budget.

- Token source of truth: `frontend/src/index.css` (brand, semantic, price colors). Desktop never hand-picks a color that already exists there; `app/src/theme/` mirrors those values and adds the glass tokens below.
- Brand, price semantics, and color separation rules from `frontend/DESIGN.md` §1–2.4 apply unchanged. This file only defines what is different on desktop.

## 1. Principles

1. **Two layers.** A flat, opaque **content layer** (price board, tables, charts, forms, order entry) and a translucent **glass layer** that floats above it (navigation, toolbars, menus, popovers, transient UI). Glass is for controls, never for content.
2. **Numbers never sit on glass.** Any price, change, volume, percentage, or ticker is drawn on an opaque surface. If a market figure must appear inside chrome (status bar index, toolbar ticker), it sits in an opaque data chip (§4.4).
3. **Performance beats effect.** Target 120 fps on a 120 Hz display (8.3 ms frame). Every glass effect has a cost line in §6 and a fallback. When in doubt, ship the fallback.
4. **Calm by default.** Glass gives depth and hierarchy; it does not decorate. No glow, no gradient fills, no animation inside the content layer except the price tick flash (§7).

## 2. Layer model

```
z4  Overlays      dialogs, command palette, toasts          glass.thick
z3  Popovers      menus, selects, tooltips, context menus    glass.thick
z2  Chrome        sidebar, toolbar, floating chart tools     glass.regular
z1  Content       panels, tables, charts, forms              opaque (card / background)
z0  Window        OS backdrop (vibrancy / Mica) or canvas    platform material
```

- Glass at z2 and above may overlap z1. Content at z1 never overlaps glass.
- Only one glass level is blurred at a time. A popover over the sidebar uses `glass.thick` tint without a second blur pass.
- Nested glass is forbidden: no glass card inside a glass panel.

## 3. Materials

### 3.1 Glass tokens

Tints derive from `--background` (dark) and `--card` (light) in `frontend/src/index.css`.

| Token | Dark tint | Light tint | Backdrop blur | Saturation | Use |
|---|---|---|---|---|---|
| `glass.regular` | background @ 72% | white @ 72% | 24 px | 1.4× | Sidebar, toolbar, floating tool palettes |
| `glass.thick` | card @ 88% | white @ 88% | 32 px | 1.3× | Menus, popovers, tooltips, dialogs, palette, toasts |
| `glass.selected` | primary @ 18% over the parent glass | primary @ 12% | inherit | — | Selected sidebar item, active toolbar segment |
| `glass.hover` | foreground @ 6% over the parent glass | foreground @ 5% | inherit | — | Hover on glass controls |

Edge treatment (what makes it read as glass, and costs almost nothing):

| Token | Dark | Light | Spec |
|---|---|---|---|
| `glass.edge.highlight` | white @ 14% | white @ 70% | 1 px inner stroke, top and left edges, fading to 0 by mid-height |
| `glass.edge.hairline` | `--border` @ 60% | `--border` @ 80% | 1 px outer stroke, full perimeter |
| `glass.shadow` | `0 8 24 black @ 35%` | `0 8 24 slate-900 @ 12%` | z2 surfaces |
| `glass.shadow.lifted` | `0 16 40 black @ 45%` | `0 16 40 slate-900 @ 16%` | z3–z4 surfaces |

There is no refraction or lensing. The edge highlight and the saturated blur carry the effect.

### 3.2 Opaque content surfaces

Same roles as the web: `background` (window canvas when no OS material), `card` (panels), `secondary`, `muted` (hover, selected rows), `border` (hairlines). Content panels have no shadow; they separate from glass by the glass shadow and from each other by an 8 px gap.

### 3.3 Platform backdrop (z0)

| Platform | Window material | Fallback |
|---|---|---|
| macOS | System vibrancy behind the window (blurred window background) | Opaque `background` |
| Windows 11 | Mica for the window, Acrylic for transient surfaces | Opaque `background` |
| Windows 10, Linux | — | Opaque `background`; glass becomes tint-only (no blur) |

The exact framework API is fixed during the GPU UI spike; this table defines the visual outcome.

### 3.4 Accessibility fallbacks

- **Reduce transparency** (macOS) or **Transparency effects off** (Windows): every glass token becomes its tint at 100% opacity, no blur. Layout and edges stay.
- **Increase contrast**: hairline becomes `--foreground` @ 40%, highlight is removed, selected state adds a 1 px `primary` outline.
- Text on glass must pass WCAG AA (4.5:1, or 3:1 for icons and 18 px+ text) against the tint composited over **both** a pure black and a pure white backdrop. A token that fails either case is wrong, not the backdrop.

## 4. Window shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ ● ● ●   ‹ ›  [ Tìm mã, lệnh…  ⌘K ]          toolbar actions   ⚙ 👤  │  toolbar: glass.regular, 52 px
├──────────┬───────────────────────────────────────────┬───────────────┤
│ sidebar  │                                           │  inspector    │
│ glass    │            content (opaque)               │  (opaque)     │
│ 232 px   │                                           │  360 px       │
│          │                                           │               │
├──────────┴───────────────────────────────────────────┴───────────────┤
│ status bar: connection · last tick time · [VNINDEX 1.284,5 +0,6%]   │  28 px, chip opaque
└──────────────────────────────────────────────────────────────────────┘
```

### 4.1 Toolbar (unified title bar)

- 52 px high, `glass.regular`, merged with the title bar. macOS traffic lights inset 20 px from the left; Windows caption buttons on the right, 46 × 32 px each, drawn by the app.
- Contents left to right: back/forward, command search field (capsule, 32 px, opens the palette), context actions for the active view, account.
- The toolbar is a drag region except over controls. Double click maximizes or zooms per platform convention.

### 4.2 Sidebar

- Floating `glass.regular` panel, inset 8 px from the window edges, radius 14 px, width 232 px, resizable 200–300 px.
- Collapses to a 56 px icon rail (⌘\\ / Ctrl+\\). Collapse is a width animation (§7), not a fade.
- Items: 32 px high, capsule hover (`glass.hover`), selected `glass.selected` with `primary` icon and `foreground` label. Group headers 11 px uppercase `muted-foreground`.
- Sections: Thị trường, Bảng giá, Biểu đồ, Danh mục theo dõi, Bộ lọc, Bot, then Tài khoản at the bottom.

### 4.3 Content and inspector

- Content panels are opaque `card`, radius 10 px, 8 px gaps, concentric with the window (§5).
- The inspector (order entry, symbol detail) is content: opaque `card`, 360 px, resizable 320–480 px. It never becomes glass, even when floating.
- Content does not scroll under the sidebar or toolbar. Glass floats over the window backdrop, not over live data.

### 4.4 Status bar and data chips

- 28 px, `glass.regular`. Shows realtime connection state, last tick time, and up to three index chips.
- A **data chip** is an opaque `card` capsule, 20 px high, 8 px horizontal padding, `tabular-nums`, value in `foreground`, change in `price-*`. This is the only way to show market numbers in chrome.

## 5. Geometry

Liquid Glass shapes are concentric: an inner radius equals the outer radius minus the inset.

| Element | Radius | Height / size |
|---|---|---|
| Window (OS) | platform | — |
| Sidebar, floating palettes | 14 px | — |
| Content panel | 10 px | — |
| Popover, menu, dialog | 12 px | — |
| Glass control (toolbar button, segmented, search field) | capsule | 28 or 32 px |
| Content control (button, input, select inside a panel) | 6 px | 28 px dense, 32 px default |
| Table row | 0 | 24 px dense board, 28 px default |
| Data chip, badge | capsule | 20 px |

- Spacing scale: 2, 4, 8, 12, 16, 24, 32 px. Panel padding 12 px; dense tables 8 px horizontal cell padding.
- Minimum window size 1024 × 680. Design and verify at 1280 × 800, 1440 × 900, and 2560 × 1440.
- Hit target never below 24 × 24 px, even when the visible control is smaller.

## 6. Performance budget

| Rule | Limit |
|---|---|
| Frame time | ≤ 8.3 ms at 120 Hz, ≤ 16.6 ms worst case during resize |
| Blurred surfaces visible at once | ≤ 3 (typically toolbar, sidebar, one popover) |
| Blur over realtime regions | Forbidden. Glass never overlaps a region that repaints more than 4×/s (price board, live chart). Floating chart tools use `glass.thick` tint-only, no blur |
| Blur cache | Backdrop blur is recomputed only when the backdrop changes (window move, resize, theme), never per tick |
| Price board | 2 000 rows virtualized, ≤ 1 ms to apply a tick batch; only changed cells repaint |
| Chart | 10 000 bars + 3 indicator panes pan/zoom at 120 fps |
| Fonts | Glyph atlas warm before first paint; Vietnamese diacritics precached |

If a glass effect cannot meet the budget on the reference machine, the tint-only fallback (§3.4) becomes the default for that surface.

## 7. Motion

- Functional only. Durations 120–250 ms. Glass surfaces use a spring (response 0.3 s, damping 0.85); content uses ease-out.
- Popover and menu: scale 0.96 → 1 plus fade, origin at the anchor.
- Sidebar collapse: width spring; labels fade out in the first 80 ms.
- **Price tick flash**: cell background `price-up` or `price-down` @ 22%, fading to 0 over 600 ms. Text color does not animate. No flash when the value is unchanged. Disabled when the OS reduce-motion setting is on (color change only).
- Forbidden: continuous decorative animation, glow pulses, parallax, lift on hover, motion inside charts other than the crosshair.

## 8. Color usage on desktop

- Brand, semantic, chart, and price tokens: as `frontend/DESIGN.md` §2. Dark is the default theme; both themes are required.
- `primary` (azure): selection on glass, focus ring, primary button, links.
- `accent` (violet): AI only.
- Brand gradient (Zone A) is allowed only on: sign-in window, About window, onboarding, and the single upgrade CTA. Never on glass chrome, never in content panels.
- Glass never tints market colors. Buy and sell buttons are opaque `price-up` / `price-down` fills, inside the content layer.

## 9. Typography

| Role | Typeface | Size / weight |
|---|---|---|
| Window and view titles | Space Grotesk Variable | 20 px / 600 |
| Panel titles | Space Grotesk Variable | 15 px / 600 |
| UI, labels, body | Be Vietnam Pro | 13 px / 400–500 |
| Sidebar items, menus | Be Vietnam Pro | 13 px / 500 |
| Dense tables, price board | Be Vietnam Pro, tnum | 12 px / 500, right-aligned |
| Metadata, axes, group headers | Be Vietnam Pro | 11 px / 500 |

- Use the patched Be Vietnam Pro with `tnum` (`frontend/scripts/patch-be-vietnam-tnum.py`), bundled in `app/assets/fonts/`. Every numeric column enables `tnum`.
- Text on glass uses weight ≥ 500 below 14 px; thin text on blur loses legibility.
- Numbers use Vietnamese formatting: `.` for thousands, `,` for decimals (`1.284,56`), formatted in `app/src/utils/`.

## 10. Components

Components live in `app/src/components/`, tokens in `app/src/theme/`. One component per need; no parallel variants.

| Component | Layer | Rule |
|---|---|---|
| `GlassPanel` | z2 | Applies `glass.regular` + edges + shadow. The only way to create glass chrome |
| `GlassPopover` | z3 | `glass.thick`, 12 px radius, anchored, closes on Escape and outside click |
| `Toolbar`, `ToolbarButton`, `Segmented` | z2 | Capsule controls, icon 16 px, tooltip with shortcut |
| `Sidebar`, `SidebarItem` | z2 | §4.2 |
| `CommandPalette` | z4 | ⌘K / Ctrl+K, `glass.thick`, 640 px wide, fuzzy search over symbols, views, actions |
| `Panel` | z1 | Opaque `card`, 10 px radius, optional header 40 px |
| `DataTable` | z1 | Virtualized, sticky header, 24/28 px rows, `muted` hover, keyboard row navigation |
| `PriceCell` | z1 | tnum, right-aligned, `price-*` color, tick flash (§7) |
| `DataChip` | z2 host, opaque | §4.4 |
| `Button` | z1 | Variants as web §2.3, 6 px radius |
| `Input`, `Select`, `Checkbox`, `Switch` | z1 | 6 px radius, visible label, error text below |
| `Dialog` | z4 | `glass.thick` card over a dimmed scrim (black @ 40%), focus trapped |
| `Toast` | z4 | `glass.thick`, bottom-right, auto-dismiss 4 s, errors persist until closed |

Icons: Lucide, 16 px in chrome and 14 px in dense tables, stroke 1.75. No emoji or glyphs as icons.

## 11. Interaction

- Every action is reachable by keyboard; every frequent action has a shortcut shown in its tooltip and the command palette.
- Focus ring: 2 px `primary` outside the control, offset 2 px, visible on glass and content in both themes.
- Native conventions: macOS app menu and ⌘ shortcuts; Windows Ctrl shortcuts and Alt menu access. Right-click opens a context menu wherever a row or chart object has actions.
- Multiple windows: a symbol or chart can be torn off into its own window; each window keeps the same shell minus the sidebar.
- Data states follow `frontend/DESIGN.md` §8: skeleton loading, explicit empty and error states, server result over optimistic state, timestamp visible on realtime data, missing values never shown as zero.

## 12. Completion checklist

- Both themes, reduce-transparency, and increase-contrast modes checked.
- macOS and Windows 11 checked; Linux opens with the tint-only fallback.
- No market number on glass; data chips used in chrome.
- No glass over a realtime region; ≤ 3 blurred surfaces visible.
- Frame budget measured on the price board and the chart, not estimated.
- Text on glass passes AA over black and white backdrops.
- Keyboard path and focus ring verified for every new control.
- Colors come from `app/src/theme/`, never literals in views or components.
