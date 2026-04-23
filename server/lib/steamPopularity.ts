/**
 * Minimal Steam Store (no API key): search + review totals for a popularity needle.
 */

const STEAM_UA = 'GameRev/1.0 (editorial; +https://github.com/guygir/GameRev)'

export type SteamVisibilityOk = {
  appId: number
  steamName: string
  totalReviews: number
  /** 0 = unknown / niche, 1 = very popular on Steam (log-scaled + release-year tweak). */
  visibilityScore: number
}

/** One row from Steam store search (used for alternate listings). */
export type SteamStoreHit = { appId: number; name: string }

type SteamSearchItem = { id?: number; name?: string }

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/**
 * Map Steam `total_reviews` to 0–1. Log curve + age dampening + slight boost for very new releases.
 */
export function computeVisibilityScore(totalReviews: number, releaseYear: number | null): number {
  const n = Math.max(0, Math.floor(totalReviews))
  const now = new Date().getFullYear()
  const ageYears = releaseYear != null ? Math.max(0, now - releaseYear) : 4
  const ageFactor = 1 / (1 + ageYears * 0.045)
  const x = Math.log1p(n)
  const cap = Math.log1p(250_000)
  let s = (x / cap) * ageFactor
  if (releaseYear != null && now - releaseYear <= 2) s *= 1.1
  return clamp01(s)
}

/**
 * Raw Steam store search hits (same API the client uses for the first match).
 * @param max maximum rows (default 15)
 */
export async function steamStoreSearchHits(
  query: string,
  max = 15,
): Promise<SteamStoreHit[] | { error: string }> {
  const q = query.trim()
  if (q.length < 2) return { error: 'Query too short.' }
  if (q.length > 120) return { error: 'Query too long.' }

  const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=US&l=en`
  const searchRes = await fetch(searchUrl, {
    headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
  })
  if (!searchRes.ok) return { error: `Steam search HTTP ${searchRes.status}` }
  const searchJson = (await searchRes.json()) as { items?: SteamSearchItem[] }
  const items = Array.isArray(searchJson.items) ? searchJson.items : []
  const hits: SteamStoreHit[] = []
  for (const it of items) {
    if (typeof it.id !== 'number' || it.id <= 0) continue
    const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : `App ${it.id}`
    hits.push({ appId: it.id, name })
    if (hits.length >= max) break
  }
  if (!hits.length) return { error: 'No Steam store match for that title.' }
  return hits
}

async function fetchSteamReviewTotal(appId: number): Promise<number | { error: string }> {
  const id = Math.floor(appId)
  if (!Number.isFinite(id) || id <= 0) return { error: 'Invalid Steam app id.' }
  const revUrl = `https://store.steampowered.com/appreviews/${id}?json=1&filter=all&language=all&purchase_type=all`
  const revRes = await fetch(revUrl, {
    headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
  })
  if (!revRes.ok) return { error: `Steam reviews HTTP ${revRes.status}` }
  const revJson = (await revRes.json()) as {
    success?: number
    query_summary?: { total_reviews?: number; num_reviews?: number }
  }
  const total =
    typeof revJson.query_summary?.total_reviews === 'number'
      ? revJson.query_summary.total_reviews
      : typeof revJson.query_summary?.num_reviews === 'number'
        ? revJson.query_summary.num_reviews
        : 0
  return total
}

export type SteamVisibilityResolved = SteamVisibilityOk & {
  /** Other Steam store hits for the same search (excludes the selected `appId`). */
  alternateHits: SteamStoreHit[]
}

export type SteamVisibilityOptions = {
  /** When set, use this app from the search page if present; otherwise still resolve totals for this id. */
  preferAppId?: number
  /** Display name when `preferAppId` is not in the search list (e.g. manual pick). */
  preferSteamName?: string
}

export async function fetchSteamVisibility(
  query: string,
  releaseYear: number | null,
  opts?: SteamVisibilityOptions,
): Promise<SteamVisibilityResolved | { error: string }> {
  const q = query.trim()
  if (q.length < 2) return { error: 'Query too short.' }
  if (q.length > 120) return { error: 'Query too long.' }

  const hitsRes = await steamStoreSearchHits(q, 15)
  if (!Array.isArray(hitsRes)) return hitsRes

  const preferId =
    opts?.preferAppId != null && Number.isFinite(opts.preferAppId) ? Math.floor(opts.preferAppId) : null
  let selected: SteamStoreHit | undefined
  if (preferId != null && preferId > 0) {
    selected = hitsRes.find((h) => h.appId === preferId)
    if (!selected) {
      const fallbackName = (opts?.preferSteamName ?? '').trim() || q || `App ${preferId}`
      selected = { appId: preferId, name: fallbackName }
    }
  }
  if (!selected) selected = hitsRes[0]!

  const totalRes = await fetchSteamReviewTotal(selected.appId)
  if (typeof totalRes !== 'number') return totalRes

  const visibilityScore = computeVisibilityScore(totalRes, releaseYear)
  const alternateHits = hitsRes.filter((h) => h.appId !== selected.appId).slice(0, 12)

  return {
    appId: selected.appId,
    steamName: selected.name,
    totalReviews: totalRes,
    visibilityScore,
    alternateHits,
  }
}

/**
 * First page of public Steam store reviews (English) for heuristic / LLM tagging like Backloggd.
 * @see https://partner.steamgames.com/documentation/community_data
 */
export async function fetchSteamReviewBodies(
  appId: number,
): Promise<{ ok: true; bodies: string[] } | { ok: false; error: string }> {
  const id = Math.floor(appId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid Steam app id.' }

  const url = `https://store.steampowered.com/appreviews/${id}?json=1&filter=all&language=english&review_type=all&purchase_type=all&num_per_page=30`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
  })
  if (!res.ok) return { ok: false, error: `Steam reviews HTTP ${res.status}` }
  let json: { success?: number; reviews?: { review?: string }[] }
  try {
    json = (await res.json()) as { success?: number; reviews?: { review?: string }[] }
  } catch {
    return { ok: false, error: 'Steam reviews response was not valid JSON.' }
  }
  const reviews = Array.isArray(json.reviews) ? json.reviews : []
  const bodies = reviews
    .map((r) => (typeof r?.review === 'string' ? r.review.replace(/\r/g, '').trim() : ''))
    .filter((t) => t.length >= 16)
  return { ok: true, bodies: bodies.slice(0, 24) }
}
