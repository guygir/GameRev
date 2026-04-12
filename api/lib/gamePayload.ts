import type { GameStats } from '../../src/review/gameStats'
import { statAxes } from '../../src/review/gameStats'
import type { PlayIfLikedStored } from '../../src/types/game'

export type AddGameBody = {
  password: string
  name: string
  subtitle: string
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
