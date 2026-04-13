import type { GameStats } from '../../src/review/gameStats.js'
import { statAxes } from '../../src/review/gameStats.js'
import { ACCENT_PRESET_HUES } from '../../src/review/reviewDarkAccent.js'
import type { PlayIfLikedStored } from '../../src/types/game.js'

export type AddGameBody = {
  password: string
  name: string
  subtitle: string
  /** Month + year label (from IGDB or typed), e.g. "October 2022". */
  releaseLabel: string | null
  /** Dark review leading hue 0–359; null/omit = auto from slug. */
  accentHue?: number | null
  /** @deprecated Prefer accentHue; 0–4 maps to fixed hues on save. */
  accentPreset?: number | null
  coverImageUrl: string | null
  platforms: string[]
  hltbMainHours: number | null
  hltbExtrasHours: number | null
  hltbCompletionistHours: number | null
  stats: GameStats
  genres: string[]
  tags: string[]
  pros: string[]
  cons: string[]
  playIfLiked: { name: string }[]
}

export function parseStats(raw: unknown): GameStats | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const out = {} as GameStats
  for (const axis of statAxes) {
    const v = o[axis]
    if (typeof v !== 'number' || Number.isNaN(v)) return null
    const n = Math.round(v)
    if (n < 0 || n > 100) return null
    out[axis] = n
  }
  return out
}

export function normalizeStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (!t || t.length > maxLen) continue
    out.push(t)
    if (out.length >= maxItems) break
  }
  return out
}

export function normalizePlayIfLiked(raw: unknown, maxItems: number): { name: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { name: string }[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const name = String((item as { name?: unknown }).name ?? '').trim()
    if (!name || name.length > 120) continue
    out.push({ name })
    if (out.length >= maxItems) break
  }
  return out
}

export function resolvePlayIfLiked(
  picks: { name: string }[],
  reviewed: Map<string, { slug: string; name: string }>,
): PlayIfLikedStored[] {
  const out: PlayIfLikedStored[] = []
  for (const pick of picks) {
    const key = pick.name.trim().toLowerCase()
    const hit = reviewed.get(key)
    if (hit) {
      out.push({ name: hit.name, slug: hit.slug })
    } else {
      out.push({ name: pick.name.trim(), slug: null })
    }
  }
  return out
}

export function buildReviewedLookup(rows: { name: string; slug: string }[]): Map<string, { slug: string; name: string }> {
  const m = new Map<string, { slug: string; name: string }>()
  for (const r of rows) {
    m.set(r.name.trim().toLowerCase(), { slug: r.slug, name: r.name })
  }
  return m
}

/** `null` = auto from slug; 0–4 = preset index. Invalid values become null. */
export function parseAccentPreset(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i < 0 || i > 4) return null
  return i
}

/** Integer hue 0–359, or null = auto. */
export function parseAccentHue(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  let h = Math.round(n) % 360
  if (h < 0) h += 360
  return h
}

/**
 * Resolves `accent_hue` for DB. Prefers `accentHue` over legacy `accentPreset`.
 * Returns `undefined` when neither field is present (update: do not patch accent).
 */
export function resolveAccentHueFromBody(b: Partial<AddGameBody>): number | null | undefined {
  const hasHue = Object.prototype.hasOwnProperty.call(b, 'accentHue')
  const hasPreset = Object.prototype.hasOwnProperty.call(b, 'accentPreset')
  if (!hasHue && !hasPreset) return undefined
  if (hasHue) return parseAccentHue(b.accentHue)
  const p = parseAccentPreset(b.accentPreset)
  if (p == null) return null
  return ACCENT_PRESET_HUES[p]
}
