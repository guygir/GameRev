import { HowLongToBeatService } from '@micamerzeau/howlongtobeat'
import { formatReviewPublishedLabel } from '../../src/lib/formatReviewPublished.js'
import { fetchBackloggdSuggestions } from './backloggdSuggestions.js'
import { addGameFromBody } from './addGame.js'
import { updateGameFromBody } from './updateGame.js'
import { fetchIgdbGenreMatches } from './igdbGenres.js'
import { getServiceSupabase } from './supabaseAdmin.js'
import { sampleCoverAccentFromUrl } from './sampleCoverAccentFromUrl.js'
import { syncReaderCommentToGithub } from './githubGameComments.js'
import { fetchSteamVisibility } from './steamPopularity.js'
import type { ServerProcessEnv } from './serverEnv.js'

const hltb = new HowLongToBeatService()

export type GamerevApiHandlerInput = {
  method: string
  pathname: string
  searchParams: URLSearchParams
  /** Parsed JSON for POST; omit for GET. */
  jsonBody?: unknown
  env: ServerProcessEnv
}

export type GamerevApiHandlerResult = { status: number; body: unknown }

function normalizePath(pathname: string): { route: string } | { error: GamerevApiHandlerResult } {
  const path = pathname.replace(/\/+$/, '') || '/'
  const bits = path.split('/').filter(Boolean)
  if (bits.length < 2 || bits[0] !== 'api') {
    return { error: { status: 404, body: { error: 'Not found' } } }
  }
  if (bits.length > 2) {
    return { error: { status: 404, body: { error: 'Not found' } } }
  }
  return { route: bits[1]! }
}

/**
 * Single dispatch for all `/api/*` routes (one Vercel function on Hobby).
 * URLs stay `/api/add-game`, `/api/hltb-search`, etc.
 */
export async function handleGamerevApi(input: GamerevApiHandlerInput): Promise<GamerevApiHandlerResult> {
  const { method, searchParams, jsonBody, env } = input
  const norm = normalizePath(input.pathname)
  if ('error' in norm) return norm.error
  const route = norm.route

  try {
    if (method === 'GET' && route === 'hltb-search') {
      const q = (searchParams.get('q') ?? '').trim()
      if (q.length < 2) return { status: 400, body: { error: 'Query too short' } }
      const results = await hltb.search(q)
      const trimmed = results.slice(0, 12).map((r) => ({
        id: r.id,
        name: r.name,
        imageUrl: r.imageUrl,
        platforms: r.platforms ?? [],
        gameplayMain: r.gameplayMain,
        gameplayMainExtra: r.gameplayMainExtra,
        gameplayCompletionist: r.gameplayCompletionist,
        similarity: r.similarity,
      }))
      return { status: 200, body: { results: trimmed } }
    }

    if (method === 'GET' && route === 'hltb-detail') {
      const id = (searchParams.get('id') ?? '').trim()
      if (!id) return { status: 400, body: { error: 'Missing id' } }
      const entry = await hltb.detail(id)
      return {
        status: 200,
        body: {
          id: entry.id,
          name: entry.name,
          description: entry.description,
          platforms: entry.platforms,
          imageUrl: entry.imageUrl,
          gameplayMain: entry.gameplayMain,
          gameplayMainExtra: entry.gameplayMainExtra,
          gameplayCompletionist: entry.gameplayCompletionist,
        },
      }
    }

    if (method === 'GET' && route === 'igdb-genres') {
      const q = (searchParams.get('q') ?? '').trim()
      const clientId = (env.IGDB_CLIENT_ID ?? '').trim()
      const clientSecret = (env.IGDB_CLIENT_SECRET ?? '').trim()
      const matches = await fetchIgdbGenreMatches(q, clientId, clientSecret)
      return { status: 200, body: { matches } }
    }

    if (method === 'POST' && route === 'add-game') {
      const body = jsonBody ?? {}
      const out = await addGameFromBody(body, {
        supabaseUrl: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '',
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        addGamePassword: env.ADD_GAME_PASSWORD ?? '',
      })
      if (out.ok === false) return { status: out.status, body: { error: out.error } }
      return { status: 200, body: { slug: out.slug } }
    }

    if (method === 'POST' && route === 'update-game') {
      const body = jsonBody ?? {}
      const out = await updateGameFromBody(body, {
        supabaseUrl: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '',
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        addGamePassword: env.ADD_GAME_PASSWORD ?? '',
      })
      if (out.ok === false) return { status: out.status, body: { error: out.error } }
      return { status: 200, body: { slug: out.slug } }
    }

    if (method === 'GET' && route === 'steam-visibility') {
      const q = (searchParams.get('q') ?? '').trim()
      const ryRaw = (searchParams.get('releaseYear') ?? '').trim()
      const releaseYear =
        ryRaw && /^\d{4}$/.test(ryRaw) ? parseInt(ryRaw, 10) : null
      const out = await fetchSteamVisibility(q, releaseYear)
      if ('error' in out) return { status: 422, body: { error: out.error } }
      return { status: 200, body: out }
    }

    if (method === 'POST' && route === 'notify-comment') {
      const body = (jsonBody ?? {}) as { commentId?: unknown }
      const id = typeof body.commentId === 'string' ? body.commentId.trim() : ''
      if (!/^[\da-f-]{36}$/i.test(id)) {
        return { status: 400, body: { error: 'Invalid commentId' } }
      }
      const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? ''
      const key = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
      if (!url || !key) {
        return { status: 503, body: { error: 'Supabase is not configured on the server' } }
      }
      const out = await syncReaderCommentToGithub(env, url, key, id)
      if (out.ok === false) return { status: 502, body: { error: out.error } }
      const skipped = out.ok && 'skipped' in out && out.skipped === true
      return { status: 200, body: { ok: true, skipped } }
    }

    if (method === 'POST' && route === 'backloggd-suggestions') {
      const body = (jsonBody ?? {}) as { query?: unknown; useLlm?: unknown }
      const q = typeof body.query === 'string' ? body.query : ''
      const useLlm = body.useLlm === true
      const out = await fetchBackloggdSuggestions(q, { useLlm, env })
      if (out.ok === false) return { status: 422, body: { error: out.error } }
      return { status: 200, body: out.data }
    }

    if (method === 'POST' && route === 'sample-cover-accent') {
      const body = (jsonBody ?? {}) as { url?: unknown }
      const rawUrl = typeof body.url === 'string' ? body.url : ''
      const out = await sampleCoverAccentFromUrl(rawUrl)
      if (out.ok === false) return { status: 422, body: { error: out.error } }
      return { status: 200, body: { hue: out.hue } }
    }

    if (method === 'GET' && route === 'review') {
      const slug = (searchParams.get('slug') ?? '').trim()
      if (!slug) return { status: 400, body: { error: 'Missing slug query parameter' } }
      const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? ''
      const key = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
      if (!url || !key) {
        return { status: 503, body: { error: 'Supabase is not configured on the server' } }
      }
      const sb = getServiceSupabase(url, key)
      const { data, error } = await sb
        .from('games')
        .select(
          `
          slug,
          name,
          subtitle,
          release_label,
          accent_hue,
          accent_preset,
          cover_image_url,
          platforms,
          hltb_main_hours,
          hltb_extras_hours,
          hltb_completionist_hours,
          stats,
          pros,
          cons,
          summary,
          play_if_liked,
          created_at,
          game_genres ( genre ),
          game_tags ( tag ),
          visibility_score
        `,
        )
        .eq('slug', slug)
        .maybeSingle()

      if (error) return { status: 500, body: { error: error.message } }
      if (!data) return { status: 404, body: { error: 'Review not found' } }

      const row = data as {
        slug: string
        name: string
        subtitle: string
        release_label: string | null
        accent_hue: number | null
        accent_preset: number | null
        cover_image_url: string | null
        platforms: string[] | null
        hltb_main_hours: number | null
        hltb_extras_hours: number | null
        hltb_completionist_hours: number | null
        stats: unknown
        pros: string[]
        cons: string[]
        summary: string | null
        play_if_liked: unknown
        created_at: string
        game_genres: { genre: string }[] | null
        game_tags: { tag: string }[] | null
        visibility_score: number | null
      }

      const vis =
        typeof row.visibility_score === 'number' && Number.isFinite(row.visibility_score)
          ? Math.min(1, Math.max(0, row.visibility_score))
          : null

      return {
        status: 200,
        body: {
          paths: { web: `/g/${row.slug}`, api: `/api/review?slug=${encodeURIComponent(row.slug)}` },
          review: {
            slug: row.slug,
            name: row.name,
            subtitle: row.subtitle,
            releaseLabel: row.release_label,
            accentHue: row.accent_hue ?? null,
            accentPreset: row.accent_preset ?? null,
            coverImageUrl: row.cover_image_url,
            platforms: row.platforms ?? [],
            hltbMainHours: row.hltb_main_hours,
            hltbExtrasHours: row.hltb_extras_hours,
            hltbCompletionistHours: row.hltb_completionist_hours,
            stats: row.stats,
            pros: row.pros ?? [],
            cons: row.cons ?? [],
            summary: row.summary?.trim() ? row.summary.trim() : null,
            playIfLiked: row.play_if_liked,
            genres: (row.game_genres ?? []).map((r) => r.genre),
            tags: (row.game_tags ?? []).map((r) => r.tag),
            createdAt: row.created_at,
            publishedAtLabel: formatReviewPublishedLabel(row.created_at),
            visibilityScore: vis,
          },
        },
      }
    }

    return { status: 404, body: { error: 'Not found' } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    const status = /not configured/i.test(message) ? 503 : 500
    return { status, body: { error: message } }
  }
}
