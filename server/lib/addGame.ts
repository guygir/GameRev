import { shiftCatalogRanksUpFrom, parseCatalogRankPosition } from './catalogRank.js'
import { getServiceSupabase } from './supabaseAdmin.js'
import { slugify } from './slug.js'
import { sendNewReviewNewsletter } from './newsletter.js'
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
  maybeRefreshPlayIfLikedMutualCluster,
  type AddGameBody,
} from './gamePayload.js'

type Env = {
  supabaseUrl: string
  serviceRoleKey: string
  addGamePassword: string
  BUTTONDOWN_API_KEY?: string
  PUBLIC_SITE_URL?: string
  SITE_URL?: string
  VERCEL_URL?: string
}

function requireEnv(env: Env): string | null {
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    return 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
  }
  if (!env.addGamePassword) return 'Missing ADD_GAME_PASSWORD'
  return null
}

async function uniqueSlug(sb: ReturnType<typeof getServiceSupabase>, base: string): Promise<string> {
  let slug = base
  let n = 0
  while (n < 50) {
    const { data } = await sb.from('games').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    n += 1
    slug = `${base}-${n + 1}`
  }
  return `${base}-${Date.now()}`
}

export async function addGameFromBody(body: unknown, env: Env): Promise<{ ok: true; slug: string } | { ok: false; status: number; error: string }> {
  const missing = requireEnv(env)
  if (missing) return { ok: false, status: 503, error: missing }

  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid JSON body' }
  }
  const b = body as Partial<AddGameBody>

  if (typeof b.password !== 'string' || b.password !== env.addGamePassword) {
    return { ok: false, status: 401, error: 'Invalid password' }
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

  const { accent_hue, accent_gray_level } = resolveAccentRowFromBody(b)

  const platforms = normalizeStringList(b.platforms, 24, 48)
  const genres = normalizeStringList(b.genres, 24, 80)
  const tags = normalizeStringList(b.tags, 40, 80)
  const pros = normalizeStringList(b.pros, 40, 600)
  const cons = normalizeStringList(b.cons, 40, 600)
  const summary = normalizeSummaryText(b.summary, 12_000)
  const editor_note = normalizeSummaryText(b.editorNote, 600)
  const steam_app_id = optionalSteamAppId(b.steamAppId)
  const steam_review_count = optionalSteamReviewCount(b.steamReviewCount)
  const visibility_score = optionalVisibilityScore01(b.visibilityScore)
  const playPicks = normalizePlayIfLiked(b.playIfLiked, 16)

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

  const { data: gamesForLink, error: gamesErr } = await sb.from('games').select('name, slug')
  if (gamesErr) return { ok: false, status: 500, error: gamesErr.message }

  const existingCount = gamesForLink?.length ?? 0
  const catalogRank = parseCatalogRankPosition(b.catalogRank, 1, existingCount + 1)
  if (catalogRank == null) {
    return {
      ok: false,
      status: 400,
      error: `Invalid catalogRank: choose a position from 1 (first) through ${existingCount + 1} (last).`,
    }
  }

  const shift = await shiftCatalogRanksUpFrom(sb, catalogRank)
  if (shift.ok === false) return { ok: false, status: 500, error: shift.error }

  const reviewed = buildReviewedLookup(gamesForLink ?? [])
  const play_if_liked = resolvePlayIfLiked(playPicks, reviewed)

  const baseSlug = slugify(name)
  const slug = await uniqueSlug(sb, baseSlug)

  for (const g of genres) {
    const { error } = await sb.from('genres').upsert({ name: g }, { onConflict: 'name' })
    if (error) return { ok: false, status: 500, error: error.message }
  }
  for (const t of tags) {
    const { error } = await sb.from('tags').upsert({ name: t }, { onConflict: 'name' })
    if (error) return { ok: false, status: 500, error: error.message }
  }

  const { data: gameRow, error: insertErr } = await sb
    .from('games')
    .insert({
      slug,
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
      editor_note,
      play_if_liked,
      accent_hue,
      accent_gray_level,
      accent_preset: null,
      catalog_rank: catalogRank,
      ...(steam_app_id != null &&
      steam_review_count != null &&
      visibility_score != null
        ? { steam_app_id, steam_review_count, visibility_score }
        : {}),
    })
    .select('id')
    .single()

  if (insertErr || !gameRow) {
    return { ok: false, status: 500, error: insertErr?.message ?? 'Insert failed' }
  }

  const gameId = gameRow.id as string

  if (genres.length) {
    const { error } = await sb.from('game_genres').insert(genres.map((genre) => ({ game_id: gameId, genre })))
    if (error) return { ok: false, status: 500, error: error.message }
  }
  if (tags.length) {
    const { error } = await sb.from('game_tags').insert(tags.map((tag) => ({ game_id: gameId, tag })))
    if (error) return { ok: false, status: 500, error: error.message }
  }

  await maybeRefreshPlayIfLikedMutualCluster(sb, gameId, name, playPicks, play_if_liked)
  void sendNewReviewNewsletter(env, { slug, name, subtitle }).catch(() => {
    /* Publishing succeeds even if newsletter delivery fails. */
  })

  return { ok: true, slug }
}
