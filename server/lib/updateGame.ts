import { parseCatalogRankPosition, persistCatalogOrder } from './catalogRank.js'
import { getServiceSupabase } from './supabaseAdmin.js'
import {
  buildReviewedLookup,
  normalizePlayIfLiked,
  normalizeStringList,
  normalizeSummaryText,
  optionalSteamAppId,
  optionalSteamReviewCount,
  optionalVisibilityScore01,
  parseStats,
  resolveAccentRowFromBody,
  resolvePlayIfLiked,
  type AddGameBody,
} from './gamePayload.js'

type Env = {
  supabaseUrl: string
  serviceRoleKey: string
  addGamePassword: string
}

function requireEnv(env: Env): string | null {
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    return 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
  }
  if (!env.addGamePassword) return 'Missing ADD_GAME_PASSWORD'
  return null
}

export type UpdateGameBody = AddGameBody & { slug: string }

export async function updateGameFromBody(
  body: unknown,
  env: Env,
): Promise<{ ok: true; slug: string } | { ok: false; status: number; error: string }> {
  const missing = requireEnv(env)
  if (missing) return { ok: false, status: 503, error: missing }

  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid JSON body' }
  }
  const b = body as Partial<UpdateGameBody>

  if (typeof b.password !== 'string' || b.password !== env.addGamePassword) {
    return { ok: false, status: 401, error: 'Invalid password' }
  }

  const slug = typeof b.slug === 'string' ? b.slug.trim() : ''
  if (!slug || slug.length > 120) {
    return { ok: false, status: 400, error: 'Invalid or missing slug' }
  }

  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > 200) {
    return { ok: false, status: 400, error: 'Invalid name' }
  }

  const subtitle = typeof b.subtitle === 'string' ? b.subtitle.trim().slice(0, 500) : ''
  const releaseLabelRaw = typeof b.releaseLabel === 'string' ? b.releaseLabel.trim().slice(0, 48) : ''
  const releaseLabel = releaseLabelRaw || null
  const coverImageUrl =
    typeof b.coverImageUrl === 'string' && b.coverImageUrl.trim()
      ? b.coverImageUrl.trim().slice(0, 2000)
      : null

  const stats = parseStats(b.stats)
  if (!stats) return { ok: false, status: 400, error: 'Invalid stats (need 0–100 per axis)' }

  const shouldPatchAccent =
    Object.prototype.hasOwnProperty.call(b, 'accentHue') ||
    Object.prototype.hasOwnProperty.call(b, 'accentPreset') ||
    Object.prototype.hasOwnProperty.call(b, 'accentGrayLevel')

  const platforms = normalizeStringList(b.platforms, 24, 48)
  const genres = normalizeStringList(b.genres, 24, 80)
  const tags = normalizeStringList(b.tags, 40, 80)
  const pros = normalizeStringList(b.pros, 40, 600)
  const cons = normalizeStringList(b.cons, 40, 600)
  const summary = normalizeSummaryText(b.summary, 12_000)
  const playPicks = normalizePlayIfLiked(b.playIfLiked, 16)

  const rawBody = b as Record<string, unknown>
  const patchSteam =
    'steamAppId' in rawBody || 'steamReviewCount' in rawBody || 'visibilityScore' in rawBody
      ? {
          steam_app_id: optionalSteamAppId(b.steamAppId),
          steam_review_count: optionalSteamReviewCount(b.steamReviewCount),
          visibility_score: optionalVisibilityScore01(b.visibilityScore),
        }
      : null

  const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isNaN(n) || n < 0 || n > 5000) return null
    return n
  }

  const hltbMainHours = numOrNull(b.hltbMainHours)
  const hltbExtrasHours = numOrNull(b.hltbExtrasHours)
  const hltbCompletionistHours = numOrNull(b.hltbCompletionistHours)

  const sb = getServiceSupabase(env.supabaseUrl, env.serviceRoleKey)

  const { data: existing, error: findErr } = await sb.from('games').select('id').eq('slug', slug).maybeSingle()
  if (findErr) return { ok: false, status: 500, error: findErr.message }
  if (!existing?.id) return { ok: false, status: 404, error: 'Review not found' }

  const gameId = existing.id as string

  const { data: gamesForLink, error: gamesErr } = await sb.from('games').select('name, slug')
  if (gamesErr) return { ok: false, status: 500, error: gamesErr.message }

  const reviewed = buildReviewedLookup(gamesForLink ?? [])
  const play_if_liked = resolvePlayIfLiked(playPicks, reviewed)

  for (const g of genres) {
    const { error } = await sb.from('genres').upsert({ name: g }, { onConflict: 'name' })
    if (error) return { ok: false, status: 500, error: error.message }
  }
  for (const t of tags) {
    const { error } = await sb.from('tags').upsert({ name: t }, { onConflict: 'name' })
    if (error) return { ok: false, status: 500, error: error.message }
  }

  const { error: delG } = await sb.from('game_genres').delete().eq('game_id', gameId)
  if (delG) return { ok: false, status: 500, error: delG.message }
  const { error: delT } = await sb.from('game_tags').delete().eq('game_id', gameId)
  if (delT) return { ok: false, status: 500, error: delT.message }

  const accentRowPatch = shouldPatchAccent
    ? (() => {
        const row = resolveAccentRowFromBody(b)
        return {
          accent_hue: row.accent_hue,
          accent_gray_level: row.accent_gray_level,
          accent_preset: null as null,
        }
      })()
    : {}

  const { error: updErr } = await sb
    .from('games')
    .update({
      name,
      subtitle,
      release_label: releaseLabel,
      cover_image_url: coverImageUrl,
      platforms,
      hltb_main_hours: hltbMainHours,
      hltb_extras_hours: hltbExtrasHours,
      hltb_completionist_hours: hltbCompletionistHours,
      stats,
      pros,
      cons,
      summary,
      play_if_liked,
      ...(patchSteam
        ? {
            steam_app_id: patchSteam.steam_app_id,
            steam_review_count: patchSteam.steam_review_count,
            visibility_score: patchSteam.visibility_score,
          }
        : {}),
      ...accentRowPatch,
    })
    .eq('id', gameId)

  if (updErr) return { ok: false, status: 500, error: updErr.message }

  if (genres.length) {
    const { error } = await sb.from('game_genres').insert(genres.map((genre) => ({ game_id: gameId, genre })))
    if (error) return { ok: false, status: 500, error: error.message }
  }
  if (tags.length) {
    const { error } = await sb.from('game_tags').insert(tags.map((tag) => ({ game_id: gameId, tag })))
    if (error) return { ok: false, status: 500, error: error.message }
  }

  const { data: rankRows, error: rankListErr } = await sb
    .from('games')
    .select('id')
    .order('catalog_rank', { ascending: true })
  if (rankListErr) return { ok: false, status: 500, error: rankListErr.message }
  const orderedIds = (rankRows ?? []).map((r) => r.id as string)
  const n = orderedIds.length
  if (n === 0) return { ok: true, slug }

  const newPos = parseCatalogRankPosition(b.catalogRank, 1, n)
  if (newPos == null) {
    return {
      ok: false,
      status: 400,
      error: `Invalid catalogRank: choose a position from 1 (first) through ${n} (last).`,
    }
  }

  const without = orderedIds.filter((id) => id !== gameId)
  if (without.length !== n - 1) {
    return { ok: false, status: 500, error: 'Catalog order is inconsistent with this review.' }
  }
  const nextOrder = [...without.slice(0, newPos - 1), gameId, ...without.slice(newPos - 1)]
  const orderOut = await persistCatalogOrder(sb, nextOrder)
  if (orderOut.ok === false) return { ok: false, status: 500, error: orderOut.error }

  return { ok: true, slug }
}
