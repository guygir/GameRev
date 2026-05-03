import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { steamStoreSearchHits } from '../server/lib/steamPopularity.js'

type GameRow = {
  id: string
  slug: string
  name: string
  steam_app_id: number | null
}

type SteamMetadata = {
  slug: string
  name: string
  matchedSteamName: string | null
  appId: number | null
  developer: string | null
  publisher: string | null
  basePrice: string | null
  steamRating: string | null
  steamReviewScorePercent: number | null
  error?: string
}

const STEAM_UA = 'GameRev/1.0 (metadata backfill; +https://github.com/guygir/GameRev)'

function loadDotenv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function resolveAppId(row: GameRow): Promise<{ appId: number; matchedSteamName: string } | { error: string }> {
  if (typeof row.steam_app_id === 'number' && row.steam_app_id > 0) {
    return { appId: row.steam_app_id, matchedSteamName: `App ${row.steam_app_id}` }
  }
  const hits = await steamStoreSearchHits(row.name, 1)
  if (!Array.isArray(hits)) return hits
  const hit = hits[0]
  if (!hit) return { error: 'No Steam search-page match for that title.' }
  return { appId: hit.appId, matchedSteamName: hit.name }
}

async function fetchSteamReviewScorePercent(appId: number): Promise<number | null> {
  const res = await fetch(
    `https://store.steampowered.com/appreviews/${appId}?json=1&filter=all&language=all&purchase_type=all`,
    { headers: { Accept: 'application/json', 'User-Agent': STEAM_UA } },
  )
  if (!res.ok) return null
  const json = (await res.json()) as {
    query_summary?: { total_reviews?: number; num_reviews?: number; total_positive?: number }
  }
  const total = json.query_summary?.total_reviews ?? json.query_summary?.num_reviews ?? 0
  const positive = json.query_summary?.total_positive
  if (!total || typeof positive !== 'number') return null
  return Math.round((positive / total) * 1000) / 10
}

async function fetchSteamStoreMetadata(
  appId: number,
): Promise<{ developer: string | null; publisher: string | null; basePrice: string | null }> {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US&l=en`, {
    headers: { Accept: 'application/json', 'User-Agent': STEAM_UA },
  })
  if (!res.ok) return { developer: null, publisher: null, basePrice: null }
  const json = (await res.json()) as Record<
    string,
    {
      data?: {
        developers?: string[]
        publishers?: string[]
        is_free?: boolean
        price_overview?: { initial?: number; initial_formatted?: string; final_formatted?: string }
      }
    }
  >
  const data = json[String(appId)]?.data
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
    developer: data?.developers?.[0] ?? null,
    publisher: data?.publishers?.[0] ?? null,
    basePrice,
  }
}

async function fetchMetadata(row: GameRow): Promise<SteamMetadata> {
  const resolved = await resolveAppId(row)
  if ('error' in resolved) {
    return {
      slug: row.slug,
      name: row.name,
      matchedSteamName: null,
      appId: null,
      developer: null,
      publisher: null,
      basePrice: null,
      steamRating: null,
      steamReviewScorePercent: null,
      error: resolved.error,
    }
  }
  const [store, steamReviewScorePercent] = await Promise.all([
    fetchSteamStoreMetadata(resolved.appId),
    fetchSteamReviewScorePercent(resolved.appId),
  ])
  return {
    slug: row.slug,
    name: row.name,
    matchedSteamName: resolved.matchedSteamName,
    appId: resolved.appId,
    developer: store.developer,
    publisher: store.publisher,
    basePrice: store.basePrice,
    steamRating: steamReviewScorePercent == null ? null : `${steamReviewScorePercent}% positive`,
    steamReviewScorePercent,
  }
}

function printMarkdown(rows: SteamMetadata[]) {
  console.log('| Review | Matched Steam app | Developer | Publisher | Base price | Steam rating |')
  console.log('|---|---|---|---|---|---|')
  for (const row of rows) {
    const matched = row.appId == null ? row.error ?? 'ERROR' : `${row.matchedSteamName} (${row.appId})`
    console.log(
      `| ${row.name} | ${matched} | ${row.developer ?? '—'} | ${row.publisher ?? '—'} | ${row.basePrice ?? '—'} | ${row.steamRating ?? '—'} |`,
    )
  }
}

async function main() {
  loadDotenv()
  const write = process.argv.includes('--write')
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || requiredEnv('VITE_SUPABASE_URL')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await sb
    .from('games')
    .select('id, slug, name, steam_app_id')
    .order('catalog_rank', { ascending: true })
  if (error) throw error

  const results: SteamMetadata[] = []
  for (const row of (data ?? []) as GameRow[]) {
    results.push(await fetchMetadata(row))
  }

  printMarkdown(results)

  if (!write) {
    console.log('\nDry run only. Re-run with --write after verifying.')
    return
  }

  for (const row of results) {
    if (row.error) continue
    const { error: updateError } = await sb
      .from('games')
      .update({
        steam_developer: row.developer,
        steam_publisher: row.publisher,
        steam_base_price: row.basePrice,
        steam_review_score_percent: row.steamReviewScorePercent,
      })
      .eq('slug', row.slug)
    if (updateError) throw updateError
  }
  console.log(`\nUpdated ${results.filter((row) => !row.error).length} reviews.`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
