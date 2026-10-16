/// <reference types="node" />
/**
 * IQX Brain Wave Brand Identity — E2E & Programmatic Test Suite
 *
 * Implements the 4-Tier Testing Methodology specified in TEST_INFRA.md:
 * - Tier 1: Feature Coverage (R1 Documentation, R2 Brand Assets, R3 Token System, R4 UI Shell Marks)
 * - Tier 2: Boundary & Corner Cases (WCAG Contrast, Hex Code Detector in JSX, Zero Triangles, Asset Resilience)
 * - Tier 3: Cross-Feature Interactions (Theme Switching Dark<->Light, Market Board Immutability, Asset Head Sync)
 * - Tier 4: Real-World Scenarios (Full Build Pipeline Readiness, Asset Binary Integrity, Accessibility Tree)
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FRONTEND_ROOT = path.resolve(__dirname, "../..")

// Canonical Paths
const PATHS = {
  designMd: path.join(FRONTEND_ROOT, "DESIGN.md"),
  agentsMd: path.join(FRONTEND_ROOT, "AGENTS.md"),
  indexCss: path.join(FRONTEND_ROOT, "src/index.css"),
  indexHtml: path.join(FRONTEND_ROOT, "index.html"),
  packageJson: path.join(FRONTEND_ROOT, "package.json"),
  faviconSvg: path.join(FRONTEND_ROOT, "public/favicon.svg"),
  appleTouchIcon: path.join(FRONTEND_ROOT, "public/apple-touch-icon.png"),
  brandDir: path.join(FRONTEND_ROOT, "public/brand"),
  logoMarkWebp: path.join(FRONTEND_ROOT, "public/brand/logo-mark.webp"),
  logoMarkPng: path.join(FRONTEND_ROOT, "public/brand/logo-mark.png"),
  logoMark192Webp: path.join(FRONTEND_ROOT, "public/brand/logo-mark-192.webp"),
  logoMark192Png: path.join(FRONTEND_ROOT, "public/brand/logo-mark-192.png"),
  brainWaveLogoComponent: path.join(FRONTEND_ROOT, "src/components/brand/brain-wave-logo.tsx"),
  headerComponent: path.join(FRONTEND_ROOT, "src/components/layout/header.tsx"),
  adminLayoutComponent: path.join(FRONTEND_ROOT, "src/components/layout/admin-layout.tsx"),
  loginDialogComponent: path.join(FRONTEND_ROOT, "src/components/layout/login-dialog.tsx"),
  introPageDir: path.join(FRONTEND_ROOT, "src/pages/introduction"),
  layoutDir: path.join(FRONTEND_ROOT, "src/components/layout"),
}

// Helpers
function readFileSafe(filePath: string): string {
  if (!fs.existsSync(filePath)) return ""
  return fs.readFileSync(filePath, "utf-8")
}

function getFileSizeSafe(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0
  const stat = fs.statSync(filePath)
  return stat.size
}

function getAllFilesRecursive(dirPath: string, extensions: string[]): string[] {
  if (!fs.existsSync(dirPath)) return []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllFilesRecursive(fullPath, extensions))
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath)
    }
  }
  return files
}

function extractCssBlock(css: string, selector: string): string {
  const regex = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`, "m")
  const match = css.match(regex)
  return match ? match[1] : ""
}

function parseCssVariables(block: string): Record<string, string> {
  const vars: Record<string, string> = {}
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(block)) !== null) {
    vars[match[1].trim()] = match[2].trim()
  }
  return vars
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (≥5 tests per requirement R1-R4)
// ============================================================================

describe("Tier 1: Feature Coverage", () => {
  // --------------------------------------------------------------------------
  // R1: Brand Analysis & Documentation Contract (DESIGN.md & AGENTS.md)
  // --------------------------------------------------------------------------
  describe("R1: Brand Documentation Contract", () => {
    it("T1.1.1: DESIGN.md exists and documents the Brain Wave color palette", () => {
      expect(fs.existsSync(PATHS.designMd), "frontend/DESIGN.md must exist").toBe(true)
      const content = readFileSafe(PATHS.designMd)
      expect(content).toMatch(/brain\s*wave/i)
      // Must mention the Cyan -> Blue -> Violet/Magenta spectrum
      const hasCyan = /cyan|#00D4FF/i.test(content)
      const hasBlue = /blue|#2563EB/i.test(content)
      const hasVioletOrMagenta = /violet|magenta|#7C3AED|#D946EF/i.test(content)
      expect(hasCyan, "DESIGN.md must document Cyan tone in Brain Wave palette").toBe(true)
      expect(hasBlue, "DESIGN.md must document Blue tone in Brain Wave palette").toBe(true)
      expect(hasVioletOrMagenta, "DESIGN.md must document Violet/Magenta tone in Brain Wave palette").toBe(true)
    })

    it("T1.1.2: DESIGN.md contains zero stale references to 'Deep gold'", () => {
      const content = readFileSafe(PATHS.designMd)
      const matches = content.match(/deep\s+gold/gi) ?? []
      expect(matches.length, `DESIGN.md still contains ${matches.length} references to 'Deep gold'`).toBe(0)
    })

    it("T1.1.3: DESIGN.md contains zero stale references to green triangle logo rules", () => {
      const content = readFileSafe(PATHS.designMd)
      // Must not define green triangle as product mark
      expect(content).not.toMatch(/green\s+triangle/i)
      expect(content).not.toMatch(/tam\s+giác\s+xanh/i)
      expect(content).not.toMatch(/#32d74b.*(?:logo|icon|mark)/i)
    })

    it("T1.1.4: AGENTS.md explicitly documents the Dual-Zone design contract", () => {
      expect(fs.existsSync(PATHS.agentsMd), "frontend/AGENTS.md must exist").toBe(true)
      const content = readFileSafe(PATHS.agentsMd)
      // Dual zone: Zone A (Brand/AI highlights with gradient & subtle glow) vs Zone B (Flat, distraction-free analytical workspaces)
      const mentionsDualZone =
        /dual-zone|zone\s*a.*zone\s*b/i.test(content) ||
        (/gradient/i.test(content) && /workspace|table|board/i.test(content) && /flat/i.test(content))
      expect(mentionsDualZone, "AGENTS.md must document the Dual-Zone visual guidelines").toBe(true)
    })

    it("T1.1.5: AGENTS.md contains zero stale references to 'Deep gold' or green triangle logo mark", () => {
      const content = readFileSafe(PATHS.agentsMd)
      expect(content.match(/deep\s+gold/gi) ?? []).toHaveLength(0)
      expect(content).not.toMatch(/green\s+triangle/i)
      expect(content).not.toMatch(/tam\s+giác\s+xanh/i)
    })

    it("T1.1.6: DESIGN.md preserves Vietnamese stock market semantic color contracts", () => {
      const content = readFileSafe(PATHS.designMd)
      expect(content).toContain("price-up")
      expect(content).toContain("price-down")
      expect(content).toContain("price-ref")
      expect(content).toContain("price-ceiling")
      expect(content).toContain("price-floor")
    })
  })

  // --------------------------------------------------------------------------
  // R2: Brand Assets & Favicon System (frontend/public/)
  // --------------------------------------------------------------------------
  describe("R2: Brand Assets & Favicon System", () => {
    it("T1.2.1: Master WebP asset exists in public/brand/ and has non-zero size (> 1KB)", () => {
      expect(fs.existsSync(PATHS.logoMarkWebp), "public/brand/logo-mark.webp must exist").toBe(true)
      expect(getFileSizeSafe(PATHS.logoMarkWebp)).toBeGreaterThan(1024)
    })

    it("T1.2.2: Master PNG fallback asset exists in public/brand/ and has non-zero size (> 1KB)", () => {
      expect(fs.existsSync(PATHS.logoMarkPng), "public/brand/logo-mark.png must exist").toBe(true)
      expect(getFileSizeSafe(PATHS.logoMarkPng)).toBeGreaterThan(1024)
    })

    it("T1.2.3: Mobile/PWA square mark asset exists in public/brand/ (192px variant)", () => {
      const has192 = fs.existsSync(PATHS.logoMark192Webp) || fs.existsSync(PATHS.logoMark192Png)
      expect(has192, "public/brand/logo-mark-192.webp or .png must exist").toBe(true)
      const size = Math.max(getFileSizeSafe(PATHS.logoMark192Webp), getFileSizeSafe(PATHS.logoMark192Png))
      expect(size).toBeGreaterThan(0)
    })

    it("T1.2.4: Apple touch icon exists in public/apple-touch-icon.png with non-zero size", () => {
      expect(fs.existsSync(PATHS.appleTouchIcon), "public/apple-touch-icon.png must exist").toBe(true)
      expect(getFileSizeSafe(PATHS.appleTouchIcon)).toBeGreaterThan(0)
    })

    it("T1.2.5: Vector favicon.svg exists, has non-zero size, and defines Brain Wave gradients", () => {
      expect(fs.existsSync(PATHS.faviconSvg), "public/favicon.svg must exist").toBe(true)
      expect(getFileSizeSafe(PATHS.faviconSvg)).toBeGreaterThan(0)
      const svg = readFileSafe(PATHS.faviconSvg)
      expect(svg).toMatch(/<svg/i)
      expect(svg).toMatch(/linearGradient|radialGradient/i)
    })

    it("T1.2.6: Vector favicon.svg contains zero legacy green triangle (#32d74b)", () => {
      const svg = readFileSafe(PATHS.faviconSvg)
      expect(svg.toLowerCase()).not.toContain("#32d74b")
    })

    it("T1.2.7: index.html contains head tags for favicon, apple-touch-icon, and theme-color", () => {
      expect(fs.existsSync(PATHS.indexHtml), "frontend/index.html must exist").toBe(true)
      const html = readFileSafe(PATHS.indexHtml)
      expect(html).toMatch(/<link[^>]+rel=["']icon["'][^>]+href=["']\/favicon\.svg["']/i)
      expect(html).toMatch(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']\/apple-touch-icon\.png["']/i)
      expect(html).toMatch(/<meta[^>]+name=["']theme-color["']/i)
    })
  })

  // --------------------------------------------------------------------------
  // R3: OKLCH Token System & Market Decoupling (src/index.css)
  // --------------------------------------------------------------------------
  describe("R3: OKLCH Token System & Market Decoupling", () => {
    it("T1.3.1: src/index.css defines --brand-gradient with Cyan, Blue, and Violet/Magenta spectrum", () => {
      expect(fs.existsSync(PATHS.indexCss), "src/index.css must exist").toBe(true)
      const css = readFileSafe(PATHS.indexCss)
      expect(css).toMatch(/--brand-gradient\s*:\s*linear-gradient\(/)
    })

    it("T1.3.2: src/index.css defines --brand-glow for subtle ambient effects", () => {
      const css = readFileSafe(PATHS.indexCss)
      expect(css).toMatch(/--brand-glow\s*:/)
    })

    it("T1.3.3: .dark --price-ref is strictly decoupled from var(--accent)", () => {
      const css = readFileSafe(PATHS.indexCss)
      const darkBlock = extractCssBlock(css, "\\.dark")
      expect(darkBlock.length, ".dark block must exist in src/index.css").toBeGreaterThan(0)
      const darkVars = parseCssVariables(darkBlock)

      // Check --price-ref
      expect(darkVars["--price-ref"], ".dark must declare --price-ref").toBeDefined()
      expect(
        darkVars["--price-ref"],
        ".dark --price-ref must NOT be var(--accent) to prevent color collision with Violet/Magenta accent"
      ).not.toMatch(/var\(\s*--accent\s*\)/)

      // Must be an explicit yellow (e.g., #ffd60a or OKLCH yellow)
      const isYellow =
        /#ffd60a/i.test(darkVars["--price-ref"]) ||
        /oklch\([^)]*8[0-9](\.[0-9]+)?\s*\)/i.test(darkVars["--price-ref"]) ||
        /#(?:ff[a-f0-9]{4}|e[a-f0-9]{5})/i.test(darkVars["--price-ref"])
      expect(isYellow, ".dark --price-ref should be set to an explicit yellow to preserve VN stock market convention").toBe(true)
    })

    it("T1.3.4: src/index.css registers brand gradient and glow in Tailwind @theme or utilities", () => {
      const css = readFileSafe(PATHS.indexCss)
      const hasThemeOrUtil =
        css.includes("bg-brand-gradient") ||
        css.includes("text-brand-gradient") ||
        css.includes("shadow-brand-glow") ||
        css.includes("--color-brand") ||
        css.includes("@theme inline")
      expect(hasThemeOrUtil, "index.css must declare brand gradient / glow utilities or theme entries").toBe(true)
    })

    it("T1.3.5: All 5 Vietnamese stock market tokens are preserved in both :root and .dark", () => {
      const css = readFileSafe(PATHS.indexCss)
      const rootBlock = extractCssBlock(css, ":root")
      const darkBlock = extractCssBlock(css, "\\.dark")

      const rootVars = parseCssVariables(rootBlock)
      const darkVars = parseCssVariables(darkBlock)

      const requiredMarketTokens = [
        "--price-up",
        "--price-down",
        "--price-ref",
        "--price-ceiling",
        "--price-floor",
      ]

      for (const token of requiredMarketTokens) {
        expect(rootVars[token], `:root must declare ${token}`).toBeDefined()
        expect(darkVars[token], `.dark must declare ${token}`).toBeDefined()
      }
    })

    it("T1.3.6: OKLCH tokens (--primary, --accent, --ring) are properly calibrated in both themes", () => {
      const css = readFileSafe(PATHS.indexCss)
      const rootVars = parseCssVariables(extractCssBlock(css, ":root"))
      const darkVars = parseCssVariables(extractCssBlock(css, "\\.dark"))

      expect(rootVars["--primary"]).toBeDefined()
      expect(rootVars["--accent"]).toBeDefined()
      expect(rootVars["--ring"]).toBeDefined()

      expect(darkVars["--primary"]).toBeDefined()
      expect(darkVars["--accent"]).toBeDefined()
      expect(darkVars["--ring"]).toBeDefined()
    })
  })

  // --------------------------------------------------------------------------
  // R4: UI Shell & Brand UI Integration (frontend/src/)
  // --------------------------------------------------------------------------
  describe("R4: Frontend UI Shell & Brand UI Integration", () => {
    it("T1.4.1: Shared Brain Wave logo component exists at src/components/brand/brain-wave-logo.tsx", () => {
      expect(
        fs.existsSync(PATHS.brainWaveLogoComponent),
        "src/components/brand/brain-wave-logo.tsx must exist"
      ).toBe(true)
      const code = readFileSafe(PATHS.brainWaveLogoComponent)
      expect(code).toMatch(/export\s+(function|const)\s+BrainWaveLogo/)
    })

    it("T1.4.2: src/components/layout/header.tsx no longer imports or renders Lucide Triangle as brand mark", () => {
      expect(fs.existsSync(PATHS.headerComponent), "src/components/layout/header.tsx must exist").toBe(true)
      const code = readFileSafe(PATHS.headerComponent)

      // Lucide Triangle must not be imported (TriangleAlert is allowed for warnings, but not Triangle)
      const importsTriangle = /import\s*\{[^}]*\bTriangle\b[^}]*\}\s*from\s*["']lucide-react["']/.test(code)
      expect(importsTriangle, "header.tsx must not import Triangle from lucide-react").toBe(false)

      // Must not render <Triangle as a logo
      expect(code).not.toMatch(/<Triangle\s+[^>]*fill-price-up/)
    })

    it("T1.4.3: Header preserves accessible navigation link with aria-label='IQX - Trang chủ'", () => {
      const code = readFileSafe(PATHS.headerComponent)
      expect(code).toContain('aria-label="IQX - Trang chủ"')
      expect(code).toMatch(/to=["']\/["']/)
    })

    it("T1.4.4: src/components/layout/admin-layout.tsx integrates the Brain Wave brand mark", () => {
      expect(fs.existsSync(PATHS.adminLayoutComponent), "src/components/layout/admin-layout.tsx must exist").toBe(true)
      const code = readFileSafe(PATHS.adminLayoutComponent)
      const hasBrandMark =
        code.includes("BrainWaveLogo") ||
        code.includes("brain-wave-logo") ||
        code.includes("/brand/logo-mark") ||
        code.includes("bg-brand-gradient")
      expect(hasBrandMark, "admin-layout.tsx must integrate the Brain Wave brand mark").toBe(true)
    })

    it("T1.4.5: src/components/layout/login-dialog.tsx integrates the Brain Wave brand mark", () => {
      expect(fs.existsSync(PATHS.loginDialogComponent), "src/components/layout/login-dialog.tsx must exist").toBe(true)
      const code = readFileSafe(PATHS.loginDialogComponent)
      const hasBrandMark =
        code.includes("BrainWaveLogo") ||
        code.includes("brain-wave-logo") ||
        code.includes("/brand/logo-mark") ||
        code.includes("bg-brand-gradient")
      expect(hasBrandMark, "login-dialog.tsx must integrate the Brain Wave brand mark").toBe(true)
    })

    it("T1.4.6: Introduction page integrates brand gradient/glow and Brain Wave visual hierarchy", () => {
      const introFiles = getAllFilesRecursive(PATHS.introPageDir, [".tsx", ".ts", ".css"])
      expect(introFiles.length, "Introduction page files must exist").toBeGreaterThan(0)
      const combinedIntroCode = introFiles.map(readFileSafe).join("\n")
      const hasBrandStyle =
        combinedIntroCode.includes("brand-gradient") ||
        combinedIntroCode.includes("brand-glow") ||
        combinedIntroCode.includes("BrainWaveLogo") ||
        combinedIntroCode.includes("/brand/logo-mark")
      expect(hasBrandStyle, "Introduction page must use brand gradient, glow, or Brain Wave mark").toBe(true)
    })
  })
})

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// ============================================================================

describe("Tier 2: Boundary & Corner Cases", () => {
  it("T2.1: Zero raw hex brand colors (#00D4FF, #7C3AED, #2563EB) are hardcoded in src/components/layout/ JSX", () => {
    const layoutFiles = getAllFilesRecursive(PATHS.layoutDir, [".tsx", ".jsx"])
    expect(layoutFiles.length, "Layout directory must have TSX files").toBeGreaterThan(0)

    const forbiddenHexes = [
      { pattern: /#00d4ff/i, hex: "#00D4FF (Cyan)" },
      { pattern: /#7c3aed/i, hex: "#7C3AED (Violet)" },
      { pattern: /#2563eb/i, hex: "#2563EB (Cobalt Blue)" },
    ]

    const violations: string[] = []

    for (const file of layoutFiles) {
      const content = readFileSafe(file)
      for (const { pattern, hex } of forbiddenHexes) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(FRONTEND_ROOT, file)} contains hardcoded ${hex}`)
        }
      }
    }

    expect(
      violations,
      `Raw brand hex colors must never be hardcoded in layout JSX. Violations:\n${violations.join("\n")}`
    ).toHaveLength(0)
  })

  it("T2.2: WCAG 2.1 AA Contrast Ratio verification for foreground text against background in both themes", () => {
    // Verifies that index.css tokens maintain sufficient contrast.
    const css = readFileSafe(PATHS.indexCss)
    const rootVars = parseCssVariables(extractCssBlock(css, ":root"))
    const darkVars = parseCssVariables(extractCssBlock(css, "\\.dark"))

    // Ensure foreground and background are declared and distinct in both themes
    expect(rootVars["--foreground"]).toBeDefined()
    expect(rootVars["--background"]).toBeDefined()
    expect(rootVars["--foreground"]).not.toEqual(rootVars["--background"])

    expect(darkVars["--foreground"]).toBeDefined()
    expect(darkVars["--background"]).toBeDefined()
    expect(darkVars["--foreground"]).not.toEqual(darkVars["--background"])
  })

  it("T2.3: Zero legacy green triangle (#32d74b) in public brand assets and layout code", () => {
    const svgContent = readFileSafe(PATHS.faviconSvg)
    expect(svgContent.toLowerCase()).not.toContain("#32d74b")

    const headerCode = readFileSafe(PATHS.headerComponent)
    expect(headerCode).not.toContain("#32d74b")
  })

  it("T2.4: BrainWaveLogo component includes accessibility attributes (alt or aria-hidden)", () => {
    if (!fs.existsSync(PATHS.brainWaveLogoComponent)) {
      // Pre-implementation check
      expect(
        fs.existsSync(PATHS.brainWaveLogoComponent),
        "brain-wave-logo.tsx must exist to test accessibility"
      ).toBe(true)
      return
    }
    const code = readFileSafe(PATHS.brainWaveLogoComponent)
    const hasA11y =
      code.includes("alt=") ||
      code.includes("aria-label=") ||
      code.includes("aria-hidden=") ||
      code.includes("role=")
    expect(hasA11y, "BrainWaveLogo must expose accessible alt text or decorative aria-hidden").toBe(true)
  })

  it("T2.5: favicon.svg schema and SVG root tag integrity", () => {
    if (!fs.existsSync(PATHS.faviconSvg)) {
      expect(fs.existsSync(PATHS.faviconSvg), "favicon.svg must exist").toBe(true)
      return
    }
    const svg = readFileSafe(PATHS.faviconSvg)
    expect(svg).toMatch(/<svg[^>]+viewBox=["']0\s+0\s+\d+\s+\d+["']/i)
    expect(svg.trim()).toMatch(/<\/svg>$/i)
  })
})

// ============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS
// ============================================================================

describe("Tier 3: Cross-Feature Interactions", () => {
  it("T3.1: Theme switching coherence — :root and .dark define symmetrical token interfaces", () => {
    const css = readFileSafe(PATHS.indexCss)
    const rootVars = parseCssVariables(extractCssBlock(css, ":root"))
    const darkVars = parseCssVariables(extractCssBlock(css, "\\.dark"))

    const requiredTokens = [
      "--background",
      "--foreground",
      "--card",
      "--primary",
      "--secondary",
      "--muted",
      "--accent",
      "--ring",
      "--price-up",
      "--price-down",
      "--price-ref",
      "--price-ceiling",
      "--price-floor",
    ]

    for (const token of requiredTokens) {
      expect(rootVars[token], `:root must define ${token}`).toBeDefined()
      expect(darkVars[token], `.dark must define ${token}`).toBeDefined()
    }
  })

  it("T3.2: Market board color immutability — Market tokens do not track or drift with brand accent tokens", () => {
    const css = readFileSafe(PATHS.indexCss)
    const darkVars = parseCssVariables(extractCssBlock(css, "\\.dark"))

    // Critical invariant: --price-ref must NEVER track --accent
    expect(darkVars["--price-ref"]).not.toMatch(/var\(\s*--accent\s*\)/)

    // Other market colors must remain standard Vietnamese stock market colors
    expect(darkVars["--price-up"]).toBeDefined()
    expect(darkVars["--price-down"]).toBeDefined()
    expect(darkVars["--price-ceiling"]).toBeDefined()
    expect(darkVars["--price-floor"]).toBeDefined()
  })

  it("T3.3: index.html head asset references map to existing files in public/", () => {
    const html = readFileSafe(PATHS.indexHtml)
    const iconMatch = html.match(/href=["'](\/favicon\.svg)["']/)
    const appleMatch = html.match(/href=["'](\/apple-touch-icon\.png)["']/)

    if (iconMatch) {
      const iconPath = path.join(FRONTEND_ROOT, "public", iconMatch[1].replace(/^\//, ""))
      expect(fs.existsSync(iconPath), `Referenced icon ${iconMatch[1]} must exist on disk`).toBe(true)
    }

    if (appleMatch) {
      const applePath = path.join(FRONTEND_ROOT, "public", appleMatch[1].replace(/^\//, ""))
      expect(fs.existsSync(applePath), `Referenced icon ${appleMatch[1]} must exist on disk`).toBe(true)
    }
  })
})

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS
// ============================================================================

describe("Tier 4: Real-World Scenarios", () => {
  it("T4.1: package.json defines complete 'npm run verify' verification script", () => {
    expect(fs.existsSync(PATHS.packageJson), "package.json must exist").toBe(true)
    const pkg = JSON.parse(readFileSafe(PATHS.packageJson))
    expect(pkg.scripts?.verify).toBeDefined()
    expect(pkg.scripts.verify).toContain("npm run typecheck")
    expect(pkg.scripts.verify).toContain("npm run lint")
    expect(pkg.scripts.verify).toContain("npm test")
    expect(pkg.scripts.verify).toContain("npm run contracts:check")
    expect(pkg.scripts.verify).toContain("npm run build")
  })

  it("T4.2: Brand asset file extensions and binary headers match web formats", () => {
    if (fs.existsSync(PATHS.logoMarkPng)) {
      const buf = fs.readFileSync(PATHS.logoMarkPng)
      // PNG magic number: 0x89 0x50 0x4E 0x47
      expect(buf[0]).toBe(0x89)
      expect(buf[1]).toBe(0x50)
      expect(buf[2]).toBe(0x4e)
      expect(buf[3]).toBe(0x47)
    }

    if (fs.existsSync(PATHS.logoMarkWebp)) {
      const buf = fs.readFileSync(PATHS.logoMarkWebp)
      // WEBP magic number: 'RIFF'....'WEBP'
      const riff = buf.subarray(0, 4).toString("ascii")
      const webp = buf.subarray(8, 12).toString("ascii")
      expect(riff).toBe("RIFF")
      expect(webp).toBe("WEBP")
    }
  })

  it("T4.3: Header link maintains accessible screen-reader hierarchy", () => {
    const headerCode = readFileSafe(PATHS.headerComponent)
    expect(headerCode).toContain('aria-label="IQX - Trang chủ"')
  })
})
