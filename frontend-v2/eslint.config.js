import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public/charting_library/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // These modules deliberately colocate components with shared variants,
    // context hooks or domain helpers. Keep the rule active everywhere else.
    files: [
      'src/components/ui/{badge,button-group,button,navigation-menu,tabs,toggle}.tsx',
      'src/context/rail.tsx',
      'src/components/theme-provider.tsx',
      'src/pages/charts/stock/insight/masthead.tsx',
      'src/pages/charts/tool-rail.tsx',
      'src/pages/demo-trading/portfolio/{history-tab,holdings-tab,watchlist-tab}.tsx',
      'src/pages/demo-trading/trading/blocks/alerts.tsx',
      'src/pages/introduction/ui.tsx',
      'src/pages/market-workspace/components/view-rail.tsx',
      'src/pages/market-workspace/financial/bctc-dashboard.tsx',
      'src/pages/market-workspace/market/views/premarket/ato-countdown.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
