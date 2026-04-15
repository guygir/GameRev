import type { CSSProperties } from 'react'

/** FNV-1a–style hash → stable hue per slug (0–359). */
export function slugToAccentHue(slug: string): number {
  let h = 2166136261
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 360
}

/** Original Pack-1 editorial gold (matches preset 0). */
export const DEFAULT_DARK_REVIEW_ACCENT_HUE = 38

/** Fixed dark accents in /addgame — same editorial structure, different leading hue. */
export const ACCENT_PRESET_LABELS = ['Amber', 'Lagoon', 'Violet', 'Moss', 'Rose'] as const

export const ACCENT_PRESET_HUES = [38, 198, 268, 145, 328] as const

export type AccentPresetIndex = 0 | 1 | 2 | 3 | 4

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

/** Closest preset index for a dominant hue (0–359). */
export function nearestAccentPresetIndex(hue: number): AccentPresetIndex {
  let best: AccentPresetIndex = 0
  let bestD = Infinity
  for (let i = 0; i < ACCENT_PRESET_HUES.length; i++) {
    const d = hueDistance(hue, ACCENT_PRESET_HUES[i]!)
    if (d < bestD) {
      bestD = d
      best = i as AccentPresetIndex
    }
  }
  return best
}

export type DarkAccentSource = {
  /** DB `accent_hue` (0–359). Takes precedence over legacy preset. */
  accentHue?: number | null
  /** Legacy DB `accent_preset` (0–4) when `accent_hue` is unset. */
  accentPreset?: number | null
}

function normalizeStoredHue(v: unknown): number | null {
  if (v == null || typeof v !== 'number' || Number.isNaN(v)) return null
  let h = Math.round(v) % 360
  if (h < 0) h += 360
  return h
}

/** Final dark accent: stored hue → legacy preset → slug hash. */
export function resolveDarkAccentHue(slug: string, source?: DarkAccentSource | null): number {
  const fromHue = normalizeStoredHue(source?.accentHue)
  if (fromHue != null) return fromHue
  const preset = source?.accentPreset
  if (preset == null || Number.isNaN(preset)) return slugToAccentHue(slug)
  const i = Math.floor(preset)
  if (i < 0 || i >= ACCENT_PRESET_HUES.length) return slugToAccentHue(slug)
  return ACCENT_PRESET_HUES[i as AccentPresetIndex]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sh = s / 100
  const sl = l / 100
  const c = (1 - Math.abs(2 * sl - 1)) * sh
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = sl - c / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) {
    rp = c
    gp = x
  } else if (h < 120) {
    rp = x
    gp = c
  } else if (h < 180) {
    gp = c
    bp = x
  } else if (h < 240) {
    gp = x
    bp = c
  } else if (h < 300) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  return [Math.round((rp + m) * 255), Math.round((gp + m) * 255), Math.round((bp + m) * 255)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, s, l)
  return rgbToHex(r, g, b)
}

/** CSS variables consumed by dark editorial theme classes (Tailwind arbitrary `var(...)`). */
export function reviewDarkAccentCssVars(hue: number): CSSProperties {
  const h = ((hue % 360) + 360) % 360
  return {
    '--review-accent': `hsl(${h} 56% 62%)`,
    '--review-accent-bright': `hsl(${h} 70% 80%)`,
    '--review-accent-soft': `hsl(${h} 38% 54%)`,
    '--review-accent-glow': `hsl(${h} 50% 55% / 0.16)`,
    '--review-accent-glow-2': `hsl(${(h + 148) % 360} 42% 38% / 0.2)`,
    '--review-accent-border': `hsl(${h} 42% 42% / 0.42)`,
    '--review-accent-surface': `hsl(${h} 28% 16% / 0.38)`,
  } as CSSProperties
}

/** Same variable names as dark; tuned for light review shells (off-white / zinc paper). */
export function reviewLightAccentCssVars(hue: number): CSSProperties {
  const h = ((hue % 360) + 360) % 360
  return {
    '--review-accent': `hsl(${h} 48% 42%)`,
    '--review-accent-bright': `hsl(${h} 46% 32%)`,
    '--review-accent-soft': `hsl(${h} 40% 52%)`,
    '--review-accent-glow': `hsl(${h} 55% 54% / 0.22)`,
    '--review-accent-glow-2': `hsl(${(h + 148) % 360} 48% 52% / 0.16)`,
    '--review-accent-border': `hsl(${h} 34% 82% / 0.95)`,
    '--review-accent-surface': `hsl(${h} 42% 97% / 0.92)`,
  } as CSSProperties
}

export type HomeCatalogSurface = 'dark' | 'light'

/**
 * Home review list cards: same HSL recipe as dark review accents (saturation/lightness), hue from the game.
 * Keeps a soft “glow” via translucent surfaces + hover shadow.
 */
export function homeCatalogCardCssVars(hue: number, surface: HomeCatalogSurface): CSSProperties {
  const h = ((hue % 360) + 360) % 360
  if (surface === 'dark') {
    return {
      '--home-catalog-border': `hsl(${h} 42% 42% / 0.36)`,
      '--home-catalog-border-hover': `hsl(${h} 56% 58% / 0.55)`,
      '--home-catalog-surface': `hsl(${h} 28% 16% / 0.42)`,
      '--home-catalog-surface-hover': `hsl(${h} 30% 18% / 0.54)`,
      '--home-catalog-thumb-border': `hsl(${h} 40% 40% / 0.32)`,
      '--home-catalog-title-hover': `hsl(${h} 70% 80%)`,
      '--home-catalog-subtitle': `hsl(${h} 38% 74% / 0.8)`,
      '--home-catalog-cta': `hsl(${h} 65% 72% / 0.92)`,
      '--home-catalog-glow': `hsl(${h} 52% 52% / 0.28)`,
    } as CSSProperties
  }
  return {
    '--home-catalog-border': `hsl(${h} 28% 90% / 1)`,
    '--home-catalog-border-hover': `hsl(${h} 42% 72% / 0.55)`,
    '--home-catalog-surface': '#ffffff',
    '--home-catalog-surface-hover': '#ffffff',
    '--home-catalog-thumb-border': `hsl(${h} 24% 91% / 1)`,
    '--home-catalog-title-hover': `hsl(${h} 42% 36%)`,
    '--home-catalog-subtitle': `hsl(${h} 18% 42% / 0.9)`,
    '--home-catalog-cta': `hsl(${h} 44% 40%)`,
    '--home-catalog-glow': `hsl(${h} 55% 54% / 0.22)`,
  } as CSSProperties
}

export function darkRadarFromHue(hue: number): {
  fill: string
  stroke: string
  grid: string
  label: string
} {
  const h = ((hue % 360) + 360) % 360
  return {
    fill: hslToHex(h, 58, 58),
    stroke: hslToHex(h, 62, 78),
    grid: '#c4b8a8',
    label: '#b8aa9a',
  }
}

/** Radar on white / light gray: slightly deeper fill for contrast. */
export function lightRadarFromHue(hue: number): {
  fill: string
  stroke: string
  grid: string
  label: string
} {
  const h = ((hue % 360) + 360) % 360
  return {
    fill: hslToHex(h, 52, 48),
    stroke: hslToHex(h, 48, 64),
    grid: '#94a3b8',
    label: '#64748b',
  }
}
