/**
 * Fetches Backloggd search → first game → genres + recent user reviews (turbo streams),
 * then derives lightweight suggestions. Optional cloud LLM refines tags, play-if-liked, pros, and cons.
 */

import { refineBackloggdWithLlm } from './backloggdLlmRefine.js'

const BACKLOGGD_ORIGIN = 'https://backloggd.com'
const FETCH_TIMEOUT_MS = 22_000

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const STOP = new Set(
  `a an the this that these those it its if or and but with from for to of in on at by as is was are were been be have has had do does did not no so than then them they their you your we our will would could should just only very much more most some any each every about into out up down over under again further both few such same game games like really also even much way make made go going get got play played playing time times one two feel feels feeling lot bit thing things something nothing`.split(
    /\s+/,
  ),
)

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { ok: false, error: `Backloggd HTTP ${res.status} for ${url}` }
    const text = await res.text()
    if (/checking your browser|cf-browser-verification|challenge-platform/i.test(text)) {
      return { ok: false, error: 'Backloggd returned a bot-check page; try again later or from another network.' }
    }
    return { ok: true, text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Fetch failed'
    return { ok: false, error: /abort/i.test(msg) ? 'Backloggd request timed out.' : msg }
  } finally {
    clearTimeout(t)
  }
}

function firstSearchResultBlock(html: string): string | null {
  const needle = '<div class="col-12 result">'
  const start = html.indexOf(needle)
  if (start < 0) return null
  const from = start + needle.length
  const next = html.indexOf(needle, from)
  const block = next >= 0 ? html.slice(start, next) : html.slice(start, Math.min(html.length, start + 12_000))
  return block
}

function parseFirstSearchHit(html: string): { gameId: string; slug: string; title: string } | null {
  const block = firstSearchResultBlock(html)
  if (!block) return null
  const gid = block.match(/<div class="row" game_id="(\d+)"/)
  if (!gid?.[1]) return null
  let slug: string | null = null
  for (const m of block.matchAll(/href="\/games\/([a-z0-9-]+)\/"/gi)) {
    const s = m[1]
    if (s === 'lib' || s === 'search' || s === 'added') continue
    slug = s
    break
  }
  if (!slug) return null
  const h3 = block.match(/<h3 class="mb-0[^"]*">([\s\S]*?)<\/h3>/i)
  const title = h3 ? stripTags(h3[1]).replace(/\s+\d{4}\s*$/, '').trim() || slug : slug
  return { gameId: gid[1], slug, title }
}

function extractGenresFromGamePage(html: string): string[] {
  const out: string[] = []
  const re = /href="\/games\/lib\/popular\/genre:[^"]+">([^<]+)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const g = stripTags(m[1] ?? '')
    if (g && !out.some((x) => x.toLowerCase() === g.toLowerCase())) out.push(g)
  }
  return out.slice(0, 12)
}

function extractReviewBodiesFromTurbo(html: string): string[] {
  const bodies: string[] = []
  const re = /review-body[^>]*>[\s\S]*?<div[^>]*card-text[^>]*>([\s\S]*?)<\/div>/gi
  for (const m of html.matchAll(re)) {
    const t = stripTags(m[1] ?? '').trim()
    if (t.length >= 12) bodies.push(t)
  }
  return bodies.slice(0, 24)
}

function tokenizeForTags(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/g)
  return raw.filter((w) => w.length >= 4 && !STOP.has(w))
}

function topKeywords(reviews: string[], exclude: Set<string>, max: number): string[] {
  const counts = new Map<string, number>()
  for (const r of reviews) {
    for (const w of tokenizeForTags(r)) {
      if (exclude.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1))
}

const POS_RE =
  /\b(great|awesome|loved|love|perfect|solid|fun|amazing|excellent|brilliant|best|wonderful|enjoyed|masterpiece|incredible|fantastic|well crafted|satisfaction|must play|gorgeous|polished|smooth|clever|charming|atmospheric)\b/i
const NEG_RE =
  /\b(frustrat|disappoint|boring|bad|bugs?|glitch|clunky|repetitive|grind|stuck|confusing|weak|worst|annoying|tedious|slog|unfinished|janky)\b/i

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|[\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16 && s.length <= 320)
}

function suggestPros(reviews: string[], max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of reviews) {
    for (const s of sentences(r)) {
      if (!POS_RE.test(s) || NEG_RE.test(s)) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
      if (out.length >= max) return out
    }
  }
  return out
}

function suggestCons(reviews: string[], max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of reviews) {
    for (const s of sentences(r)) {
      if (!NEG_RE.test(s)) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
      if (out.length >= max) return out
    }
  }
  return out
}

function mergeTagsPreferFirst(primary: string[], fallback: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of primary) {
    const s = t.trim().slice(0, 80)
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= max) return out
  }
  for (const t of fallback) {
    const s = t.trim().slice(0, 80)
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= max) return out
  }
  return out
}

function suggestPlayIfLiked(reviews: string[], max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    let t = s.replace(/\s+/g, ' ').trim().replace(/^[,.\s]+|[,.\s]+$/g, '')
    if (t.length < 3 || t.length > 56) return
    t = t.split(/[.!?]/)[0]?.trim() ?? t
    if (t.length < 3 || t.length > 56) return
    const k = t.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }

  const joined = reviews.join('\n')
  for (const m of joined.matchAll(/([^.\n]{2,44})\s+meets\s+([^.\n]{2,44})(?=\.|!|\n|$)/gi)) {
    push(m[1])
    push(m[2])
    if (out.length >= max) return out.slice(0, max)
  }

  const like = /\b(?:similar to|if you liked|if you enjoy|fans of|reminds me of)\s+([^.!?\n]{3,52})/gi
  for (const m of joined.matchAll(like)) {
    push(m[1].trim().replace(/[,;:]+$/, ''))
    if (out.length >= max) return out
  }

  const vs = /\b(?:mix of|blend of|cross between)\s+([^.!?\n]{6,56})/gi
  for (const m of joined.matchAll(vs)) {
    push(m[1].trim())
    if (out.length >= max) return out
  }

  return out.slice(0, max)
}

export type BackloggdSuggestionsResult = {
  backloggdGameUrl: string
  backloggdTitle: string
  backloggdSlug: string
  reviewSnippets: string[]
  suggestedTags: string[]
  suggestedPlayIfLiked: string[]
  suggestedPros: string[]
  suggestedCons: string[]
  /** When `useLlm` was requested but refinement failed or no API key. */
  llmError?: string
}

export async function fetchBackloggdSuggestions(
  rawQuery: string,
  options: { useLlm?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<{ ok: true; data: BackloggdSuggestionsResult } | { ok: false; error: string }> {
  const query = rawQuery.trim()
  if (query.length < 2) return { ok: false, error: 'Query too short (need at least 2 characters).' }
  if (query.length > 120) return { ok: false, error: 'Query too long.' }

  const searchUrl = `${BACKLOGGD_ORIGIN}/search/results.turbo_stream?page=1&query=${encodeURIComponent(query)}&type=games`
  const searchRes = await fetchText(searchUrl)
  if (!searchRes.ok) return searchRes

  const hit = parseFirstSearchHit(searchRes.text)
  if (!hit) {
    return { ok: false, error: 'No game results on Backloggd for that search (first page).' }
  }

  const gameUrl = `${BACKLOGGD_ORIGIN}/games/${hit.slug}/`
  const gameRes = await fetchText(gameUrl)
  if (!gameRes.ok) return gameRes

  const genres = extractGenresFromGamePage(gameRes.text)
  const reviewsUrl = `${BACKLOGGD_ORIGIN}/reviews/fetch/recent.turbo_stream?game_id=${encodeURIComponent(hit.gameId)}`
  const reviewsRes = await fetchText(reviewsUrl)
  if (!reviewsRes.ok) return reviewsRes

  const reviewBodies = extractReviewBodiesFromTurbo(reviewsRes.text)

  if (!reviewBodies.length) {
    return {
      ok: true,
      data: {
        backloggdGameUrl: gameUrl,
        backloggdTitle: hit.title,
        backloggdSlug: hit.slug,
        reviewSnippets: [],
        suggestedTags: genres.slice(0, 10),
        suggestedPlayIfLiked: [],
        suggestedPros: [],
        suggestedCons: [],
      },
    }
  }

  const genreLower = new Set(genres.map((g) => g.toLowerCase()))
  const keywordTags = topKeywords(reviewBodies, new Set([...STOP, ...genreLower]), 8)
  let suggestedTags = [...genres]
  for (const t of keywordTags) {
    if (!suggestedTags.some((x) => x.toLowerCase() === t.toLowerCase())) suggestedTags.push(t)
  }

  let suggestedPlayIfLiked = suggestPlayIfLiked(reviewBodies, 10)
  let suggestedPros = suggestPros(reviewBodies, 8)
  let suggestedCons = suggestCons(reviewBodies, 8)
  let llmError: string | undefined

  if (options.useLlm && options.env) {
    const refined = await refineBackloggdWithLlm(options.env, {
      gameTitle: hit.title,
      genres: suggestedTags.slice(0, 12),
      reviewSnippets: reviewBodies.slice(0, 8),
    })
    if (refined.ok) {
      suggestedTags = mergeTagsPreferFirst(refined.data.suggestedTags, suggestedTags, 16)
      suggestedPlayIfLiked = refined.data.suggestedPlayIfLiked
      suggestedPros = refined.data.suggestedPros
      suggestedCons = refined.data.suggestedCons
    } else {
      llmError = refined.error
    }
  }

  return {
    ok: true,
    data: {
      backloggdGameUrl: gameUrl,
      backloggdTitle: hit.title,
      backloggdSlug: hit.slug,
      reviewSnippets: reviewBodies.slice(0, 5).map((s) => (s.length > 420 ? `${s.slice(0, 417)}…` : s)),
      suggestedTags: suggestedTags.slice(0, 16),
      suggestedPlayIfLiked,
      suggestedPros,
      suggestedCons,
      ...(llmError ? { llmError } : {}),
    },
  }
}
