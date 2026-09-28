# @iqx/design-tokens

Typed, cross-platform IQX design tokens for web and mobile clients. The values mirror [`frontend-v2/src/index.css`](../../frontend-v2/src/index.css), which remains the color source of truth.

```ts
import { colors, marketColors, spacing, tokens } from '@iqx/design-tokens';

const primary = colors.dark.primary;
const panelGap = spacing.pagePadding;
```

The package exports semantic light and dark colors, chart and market colors, typography, spacing and geometry, shadows, motion, safe-area insets, and touch target constants. `as const` exports provide literal types for consumers.

Run the parity check from this directory after changing the CSS source:

```sh
npm run check
```

The check parses `:root` and `.dark` declarations, validates required source variables, and prints the current source SHA-256 for traceability.

Current source hash (SHA-256, generated 2026-09-27): `9d7ee894023e5e3cca6c422140b70e7100a02e19444516511b8ca2fe09462bb5`
