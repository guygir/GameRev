import type { SupabaseClient } from '@supabase/supabase-js'
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
  /** 0–100 achromatic accent (B&amp;W cover path); when set, `accent_hue` is stored null. */
  accentGrayLevel?: number | null
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
  /** Optional capsule summary for `/g/:slug` (stored as `games.summary`). */
  summary?: string | null
  /** Optional short kicker; stored as `games.editor_note`, shown under the title on the review when set. */
  editorNote?: string | null
  playIfLiked: { name: string }[]
  /** 1-based position in the catalog (1 = first). Required on add/update from the editor. */
  catalogRank?: number
  /** Steam popularity (set from editor after `/api/steam-visibility`). */
  steamAppId?: number | null
  steamReviewCount?: number | null
  visibilityScore?: number | null
  steamDeveloper?: string | null
  steamPublisher?: string | null
  steamBasePrice?: string | null
  steamReviewScorePercent?: number | null
}

export function optionalSteamAppId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 2_147_483_647) return null
  return n
}

export function optionalSteamReviewCount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 500_000_000) return null
  return n
}

export function optionalVisibilityScore01(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) return null
  return n
}

export function optionalSteamMetadataText(raw: unknown, maxLen: number): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  return t.slice(0, maxLen)
}

export function optionalSteamReviewScorePercent(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
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

/** Trims and caps length; empty input becomes null for nullable DB columns. */
export function normalizeSummaryText(raw: unknown, maxLen: number): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  return t.slice(0, maxLen)
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

type GamePlayRow = { id: string; name: string; slug: string; play_if_liked: unknown }

function playIfLikedListsName(raw: unknown, nameLower: string): boolean {
  if (!Array.isArray(raw)) return false
  const want = nameLower.trim().toLowerCase()
  if (!want) return false
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const n = String((item as { name?: unknown }).name ?? '')
      .trim()
      .toLowerCase()
    if (n === want) return true
  }
  return false
}

/** True if some catalog row Y matches a pick and Y’s stored list names this review (cross-link). */
export function hasMutualPlayIfLikedPair(
  rows: GamePlayRow[],
  selfId: string,
  selfName: string,
  playPicks: { name: string }[],
): boolean {
  const selfKey = selfName.trim().toLowerCase()
  if (!selfKey) return false
  for (const pick of playPicks) {
    const pk = pick.name.trim().toLowerCase()
    if (!pk) continue
    const y = rows.find((r) => r.id !== selfId && r.name.trim().toLowerCase() === pk)
    if (!y) continue
    if (playIfLikedListsName(y.play_if_liked, selfKey)) return true
  }
  return false
}

function playIfLikedJsonStable(a: PlayIfLikedStored[]): string {
  return JSON.stringify(a)
}

function asPlayIfLikedStored(raw: unknown): PlayIfLikedStored[] {
  if (!Array.isArray(raw)) return []
  const out: PlayIfLikedStored[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const name = String((item as { name?: unknown }).name ?? '').trim()
    if (!name) continue
    const slugRaw = (item as { slug?: unknown }).slug
    const slug =
      slugRaw === null || slugRaw === undefined || slugRaw === ''
        ? null
        : typeof slugRaw === 'string'
          ? slugRaw
          : null
    out.push({ name, slug })
  }
  return out
}

function mutualPartnerIds(
  rows: GamePlayRow[],
  selfId: string,
  selfName: string,
  playPicks: { name: string }[],
): string[] {
  const selfKey = selfName.trim().toLowerCase()
  if (!selfKey) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const pick of playPicks) {
    const pk = pick.name.trim().toLowerCase()
    if (!pk) continue
    const y = rows.find((r) => r.id !== selfId && r.name.trim().toLowerCase() === pk)
    if (!y || seen.has(y.id)) continue
    if (!playIfLikedListsName(y.play_if_liked, selfKey)) continue
    seen.add(y.id)
    out.push(y.id)
  }
  return out
}

/**
 * Re-resolve one row’s `play_if_liked` when it forms a mutual pair with another review (same
 * editor picks + DB), so slugs catch up after both titles exist in the catalog.
 */
async function maybeRefreshPlayIfLikedAfterMutualPair(
  sb: SupabaseClient,
  gameId: string,
  selfName: string,
  playPicks: { name: string }[],
  storedPlayIfLiked: PlayIfLikedStored[],
): Promise<void> {
  const { data: rows, error } = await sb.from('games').select('id, name, slug, play_if_liked')
  if (error || !rows?.length) return
  const typed = rows as GamePlayRow[]
  if (!hasMutualPlayIfLikedPair(typed, gameId, selfName, playPicks)) return
  const reviewed = buildReviewedLookup(typed.map((r) => ({ name: r.name, slug: r.slug })))
  const next = resolvePlayIfLiked(playPicks, reviewed)
  if (playIfLikedJsonStable(next) === playIfLikedJsonStable(storedPlayIfLiked)) return
  const { error: u } = await sb.from('games').update({ play_if_liked: next }).eq('id', gameId)
  if (u) {
    console.warn('[maybeRefreshPlayIfLikedAfterMutualPair] update failed:', u.message)
  }
}

/**
 * After saving review G: refresh G’s links if mutual; then refresh each mutual partner P so
 * e.g. older rows pick up slugs once the counterpart review exists.
 */
export async function maybeRefreshPlayIfLikedMutualCluster(
  sb: SupabaseClient,
  gameId: string,
  selfName: string,
  playPicks: { name: string }[],
  storedPlayIfLiked: PlayIfLikedStored[],
): Promise<void> {
  try {
    await maybeRefreshPlayIfLikedAfterMutualPair(sb, gameId, selfName, playPicks, storedPlayIfLiked)

    const { data: rows, error } = await sb.from('games').select('id, name, slug, play_if_liked')
    if (error || !rows?.length) return
    const typed = rows as GamePlayRow[]
    const partnerIds = mutualPartnerIds(typed, gameId, selfName, playPicks)
    for (const pid of partnerIds) {
      const P = typed.find((r) => r.id === pid)
      if (!P) continue
      const pStored = asPlayIfLikedStored(P.play_if_liked)
      const pPicks = pStored.map((p) => ({ name: p.name }))
      await maybeRefreshPlayIfLikedAfterMutualPair(sb, P.id, P.name, pPicks, pStored)
    }
  } catch (e) {
    console.warn(
      '[maybeRefreshPlayIfLikedMutualCluster]',
      e instanceof Error ? e.message : String(e),
    )
  }
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

/** 0–100 grayscale accent level, or null = not grayscale. */
export function parseAccentGrayLevel(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, Math.round(n)))
}

/**
 * DB row: grayscale wins when `accentGrayLevel` is a number in the body.
 * Otherwise chromatic `accent_hue` from hue/preset (or null = auto).
 */
export function resolveAccentRowFromBody(b: Partial<AddGameBody>): {
  accent_hue: number | null
  accent_gray_level: number | null
} {
  if (Object.prototype.hasOwnProperty.call(b, 'accentGrayLevel')) {
    const raw = b.accentGrayLevel
    if (raw !== undefined && raw !== null) {
      const gl = parseAccentGrayLevel(raw)
      if (gl !== null) {
        return { accent_hue: null, accent_gray_level: gl }
      }
    }
  }
  const hr = resolveAccentHueFromBody(b)
  return {
    accent_hue: hr === undefined ? null : hr,
    accent_gray_level: null,
  }
}

/**
 * Resolves `accent_hue` only (chromatic). Prefers `accentHue` over legacy `accentPreset`.
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
