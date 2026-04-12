import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { HowLongToBeatService } from '@micamerzeau/howlongtobeat'
import { addGameFromBody } from '../api/lib/addGame.js'
import { updateGameFromBody } from '../api/lib/updateGame.js'
import { getServiceSupabase } from '../api/lib/supabaseAdmin.js'
import { fetchIgdbGenreMatches } from '../api/igdb-genres.js'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function getEnv(env: Record<string, string>) {
  return {
    supabaseUrl: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    addGamePassword: env.ADD_GAME_PASSWORD ?? '',
  }
}

function installApiRoutes(
  middlewares: Connect.Server,
  env: Record<string, string>,
  hltb: HowLongToBeatService,
) {
  middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? ''
    if (!rawUrl.startsWith('/api/')) return next()

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const url = new URL(rawUrl, 'http://dev.local')

    try {
      if (req.method === 'GET' && url.pathname === '/api/hltb-search') {
        const q = (url.searchParams.get('q') ?? '').trim()
        if (q.length < 2) {
          sendJson(res, 400, { error: 'Query too short' })
          return
        }
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
        sendJson(res, 200, { results: trimmed })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/hltb-detail') {
        const id = (url.searchParams.get('id') ?? '').trim()
        if (!id) {
          sendJson(res, 400, { error: 'Missing id' })
          return
        }
        const entry = await hltb.detail(id)
        sendJson(res, 200, {
          id: entry.id,
          name: entry.name,
          description: entry.description,
          platforms: entry.platforms,
          imageUrl: entry.imageUrl,
          gameplayMain: entry.gameplayMain,
          gameplayMainExtra: entry.gameplayMainExtra,
          gameplayCompletionist: entry.gameplayCompletionist,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/igdb-genres') {
        const q = (url.searchParams.get('q') ?? '').trim()
        const clientId = env.IGDB_CLIENT_ID ?? ''
        const clientSecret = env.IGDB_CLIENT_SECRET ?? ''
        const matches = await fetchIgdbGenreMatches(q, clientId, clientSecret)
        sendJson(res, 200, { matches })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/add-game') {
        const text = await readBody(req)
        let parsed: unknown
        try {
          parsed = JSON.parse(text || '{}') as unknown
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON' })
          return
        }
        const e = getEnv(env)
        const out = await addGameFromBody(parsed, {
          supabaseUrl: e.supabaseUrl,
          serviceRoleKey: e.serviceRoleKey,
          addGamePassword: e.addGamePassword,
        })
        if (!out.ok) {
          sendJson(res, out.status, { error: out.error })
          return
        }
        sendJson(res, 200, { slug: out.slug })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/update-game') {
        const text = await readBody(req)
        let parsed: unknown
        try {
          parsed = JSON.parse(text || '{}') as unknown
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON' })
          return
        }
        const e = getEnv(env)
        const out = await updateGameFromBody(parsed, {
          supabaseUrl: e.supabaseUrl,
          serviceRoleKey: e.serviceRoleKey,
          addGamePassword: e.addGamePassword,
        })
        if (!out.ok) {
          sendJson(res, out.status, { error: out.error })
          return
        }
        sendJson(res, 200, { slug: out.slug })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/review') {
        const slug = (url.searchParams.get('slug') ?? '').trim()
        if (!slug) {
          sendJson(res, 400, { error: 'Missing slug query parameter' })
          return
        }
        const e = getEnv(env)
        if (!e.supabaseUrl || !e.serviceRoleKey) {
          sendJson(res, 503, { error: 'Supabase is not configured on the server' })
          return
        }
        const sb = getServiceSupabase(e.supabaseUrl, e.serviceRoleKey)
        const { data, error } = await sb
          .from('games')
          .select(
            `
            slug,
            name,
            subtitle,
            release_label,
            cover_image_url,
            platforms,
            hltb_main_hours,
            hltb_extras_hours,
            hltb_completionist_hours,
            stats,
            pros,
            cons,
            play_if_liked,
            created_at,
            game_genres ( genre ),
            game_tags ( tag )
          `,
          )
          .eq('slug', slug)
          .maybeSingle()
        if (error) {
          sendJson(res, 500, { error: error.message })
          return
        }
        if (!data) {
          sendJson(res, 404, { error: 'Review not found' })
          return
        }
        const row = data as {
          slug: string
          name: string
          subtitle: string
          release_label: string | null
          cover_image_url: string | null
          platforms: string[] | null
          hltb_main_hours: number | null
          hltb_extras_hours: number | null
          hltb_completionist_hours: number | null
          stats: unknown
          pros: string[]
          cons: string[]
          play_if_liked: unknown
          created_at: string
          game_genres: { genre: string }[] | null
          game_tags: { tag: string }[] | null
        }
        sendJson(res, 200, {
          paths: { web: `/g/${row.slug}`, api: `/api/review?slug=${encodeURIComponent(row.slug)}` },
          review: {
            slug: row.slug,
            name: row.name,
            subtitle: row.subtitle,
            releaseLabel: row.release_label,
            coverImageUrl: row.cover_image_url,
            platforms: row.platforms ?? [],
            hltbMainHours: row.hltb_main_hours,
            hltbExtrasHours: row.hltb_extras_hours,
            hltbCompletionistHours: row.hltb_completionist_hours,
            stats: row.stats,
            pros: row.pros ?? [],
            cons: row.cons ?? [],
            playIfLiked: row.play_if_liked,
            genres: (row.game_genres ?? []).map((r) => r.genre),
            tags: (row.game_tags ?? []).map((r) => r.tag),
            createdAt: row.created_at,
          },
        })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Server error'
      const status = /not configured/i.test(message) ? 503 : 500
      sendJson(res, status, { error: message })
    }
  })
}

export function gamerevApiPlugin(env: Record<string, string>): Plugin {
  const hltb = new HowLongToBeatService()

  return {
    name: 'gamerev-api',
    configureServer(server) {
      installApiRoutes(server.middlewares, env, hltb)
    },
    configurePreviewServer(server) {
      installApiRoutes(server.middlewares, env, hltb)
    },
  }
}
