/**
 * Minimal Steam Store (no API key): search + review totals for a popularity needle.
 */

const STEAM_UA = 'GameRev/1.0 (editorial; +https://github.com/guygir/GameRev)'

export type SteamVisibilityOk = {
  appId: number
  steamName: string
  totalReviews: number
  totalPositive: number | null
  reviewScorePercent: number | null
  /** 0 = unknown / niche, 1 = very popular on Steam (log-scaled + release-year tweak). */
  visibilityScore: number
  developer: string | null
  publisher: string | null
  basePrice: string | null
}

/** One row from Steam store search (used for alternate listings). */
export type SteamStoreHit = {
  appId: number
  name: string
  developer?: string | null
  publisher?: string | null
  basePrice?: string | null
  reviewScorePercent?: number | null
  totalReviews?: number | null
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripHtml(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
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

  const searchUrl = `https://store.steampowered.com/search?term=${encodeURIComponent(q)}`
  const searchRes = await fetch(searchUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': STEAM_UA,
    },
  })
  if (!searchRes.ok) return { error: `Steam search HTTP ${searchRes.status}` }
  const html = await searchRes.text()
  const hits: SteamStoreHit[] = []
  const seen = new Set<number>()
  const rowPattern =
    /<a\b[^>]*href="https:\/\/store\.steampowered\.com\/app\/(\d+)\/[^"]*"[^>]*class="[^"]*\bsearch_result_row\b[^"]*"[\s\S]*?<\/a>/gi
  for (const match of html.matchAll(rowPattern)) {
    const appId = Number(match[1])
    if (!Number.isInteger(appId) || appId <= 0 || seen.has(appId)) continue
    const rowHtml = match[0]
    const titleMatch = rowHtml.match(/<span class="title">([\s\S]*?)<\/span>/i)
    const name = titleMatch ? stripHtml(titleMatch[1]!) : `App ${appId}`
    seen.add(appId)
    hits.push({ appId, name })
    if (hits.length >= max) break
  }
  if (!hits.length) return { error: 'No Steam search-page match for that title.' }
  return hits
}

type SteamReviewSnapshot = {
  totalReviews: number
  totalPositive: number | null
  reviewScorePercent: number | null
}

async function fetchSteamReviewSnapshot(appId: number): Promise<SteamReviewSnapshot | { error: string }> {
  const id = Math.floor(appId)
  if (!Number.isFinite(id) || id <= 0) return { error: 'Invalid Steam app id.' }
  const revUrl = `https://store.steampowered.com/appreviews/${id}?json=1&filter=all&language=all&purchase_type=all`
  const revRes = await fetch(revUrl, {
    headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
  })
  if (!revRes.ok) return { error: `Steam reviews HTTP ${revRes.status}` }
  const revJson = (await revRes.json()) as {
    success?: number
    query_summary?: {
      total_reviews?: number
      num_reviews?: number
      total_positive?: number
      total_negative?: number
    }
  }
  const total =
    typeof revJson.query_summary?.total_reviews === 'number'
      ? revJson.query_summary.total_reviews
      : typeof revJson.query_summary?.num_reviews === 'number'
        ? revJson.query_summary.num_reviews
        : 0
  const totalPositive =
    typeof revJson.query_summary?.total_positive === 'number' ? revJson.query_summary.total_positive : null
  const reviewScorePercent =
    total > 0 && totalPositive != null ? Math.round((totalPositive / total) * 1000) / 10 : null
  return { totalReviews: total, totalPositive, reviewScorePercent }
}

async function fetchSteamStoreMetadata(
  appId: number,
): Promise<{ developer: string | null; publisher: string | null; basePrice: string | null }> {
  const id = Math.floor(appId)
  if (!Number.isFinite(id) || id <= 0) {
    return { developer: null, publisher: null, basePrice: null }
  }
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${id}&cc=US&l=en`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
    })
    if (!res.ok) return { developer: null, publisher: null, basePrice: null }
    const json = (await res.json()) as Record<
      string,
      {
        success?: boolean
        data?: {
          developers?: string[]
          publishers?: string[]
          price_overview?: {
            initial?: number
            initial_formatted?: string
            final_formatted?: string
          }
          is_free?: boolean
        }
      }
    >
    const data = json[String(id)]?.data
    const price = data?.price_overview
    const basePrice =
      data?.is_free === true
        ? 'Free'
        : price?.initial_formatted?.trim()
          ? price.initial_formatted.trim()
          : price?.final_formatted?.trim()
            ? price.final_formatted.trim()
            : typeof price?.initial === 'number' && price.initial > 0
              ? `$${(price.initial / 100).toFixed(2)}`
              : null
    return {
      developer: Array.isArray(data?.developers) && data.developers[0] ? data.developers[0] : null,
      publisher: Array.isArray(data?.publishers) && data.publishers[0] ? data.publishers[0] : null,
      basePrice,
    }
  } catch {
    return { developer: null, publisher: null, basePrice: null }
  }
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

  const [selectedReviews, selectedMeta] = await Promise.all([
    fetchSteamReviewSnapshot(selected.appId),
    fetchSteamStoreMetadata(selected.appId),
  ])
  if ('error' in selectedReviews) return selectedReviews

  const visibilityScore = computeVisibilityScore(selectedReviews.totalReviews, releaseYear)
  const alternateBaseHits = hitsRes.filter((h) => h.appId !== selected.appId).slice(0, 12)
  const alternateHits = await Promise.all(
    alternateBaseHits.map(async (hit) => {
      const [reviews, meta] = await Promise.all([
        fetchSteamReviewSnapshot(hit.appId).catch(() => null),
        fetchSteamStoreMetadata(hit.appId),
      ])
      const reviewSnapshot = reviews && !('error' in reviews) ? reviews : null
      return {
        ...hit,
        ...meta,
        reviewScorePercent: reviewSnapshot?.reviewScorePercent ?? null,
        totalReviews: reviewSnapshot?.totalReviews ?? null,
      }
    }),
  )

  return {
    appId: selected.appId,
    steamName: selected.name,
    totalReviews: selectedReviews.totalReviews,
    totalPositive: selectedReviews.totalPositive,
    reviewScorePercent: selectedReviews.reviewScorePercent,
    visibilityScore,
    ...selectedMeta,
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
