export type HeroDepthTheme = "light" | "dark"
export type Size = { width: number; height: number }

/** Match the scenery's object-fit: cover and object-position: center 62%. */
export function sceneryCover(source: Size, viewport: Size) {
  if (source.width <= 0 || source.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { visibleWidth: 1, visibleHeight: 1, left: 0, top: 0 }
  }
  const scale = Math.max(viewport.width / source.width, viewport.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  return {
    visibleWidth: viewport.width / width,
    visibleHeight: viewport.height / height,
    left: (width - viewport.width) / width / 2,
    top: (height - viewport.height) / height * 0.62,
  }
}

export type HeroDepthEnvironment = {
  matchMedia: (query: string) => { matches: boolean }
  navigator?: { connection?: { saveData?: boolean } }
}

export function canUseHeroDepth(win: HeroDepthEnvironment): boolean {
  if (win.navigator?.connection?.saveData) return false
  if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
  return win.matchMedia("(min-width: 900px) and (pointer: fine)").matches
}

export function textureClassForTheme(theme: HeroDepthTheme): "intro-day" | "intro-night" {
  return theme === "dark" ? "intro-night" : "intro-day"
}
