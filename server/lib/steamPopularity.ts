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

export async function fetchSteamVisibility(
  query: string,
  releaseYear: number | null,
): Promise<SteamVisibilityOk | { error: string }> {
  const q = query.trim()
  if (q.length < 2) return { error: 'Query too short.' }
  if (q.length > 120) return { error: 'Query too long.' }

  const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=US&l=en`
  const searchRes = await fetch(searchUrl, {
    headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
  })
  if (!searchRes.ok) return { error: `Steam search HTTP ${searchRes.status}` }
  const searchJson = (await searchRes.json()) as { total?: number; items?: SteamSearchItem[] }
  const items = Array.isArray(searchJson.items) ? searchJson.items : []
  const first = items.find((it) => typeof it.id === 'number' && it.id > 0)
  if (!first?.id) return { error: 'No Steam store match for that title.' }

  const appId = first.id
  const steamName = typeof first.name === 'string' ? first.name : q

  const revUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=all&language=all&purchase_type=all`
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

  const visibilityScore = computeVisibilityScore(total, releaseYear)

  return { appId, steamName, totalReviews: total, visibilityScore }
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
