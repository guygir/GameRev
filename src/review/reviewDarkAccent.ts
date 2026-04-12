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

/** Resolve final hue: DB `accent_preset` null/undefined → slug hash; 0–4 → preset table. */
export function resolveDarkAccentHue(slug: string, accentPreset: number | null | undefined): number {
  if (accentPreset == null || Number.isNaN(accentPreset)) return slugToAccentHue(slug)
  const i = Math.floor(accentPreset)
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
