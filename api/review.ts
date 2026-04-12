import type { VercelRequest, VercelResponse } from '@vercel/node'
import { formatReviewPublishedLabel } from '../src/lib/formatReviewPublished.js'
import { getServiceSupabase } from './lib/supabaseAdmin.js'

function firstQueryParam(value: string | string[] | undefined): string {
  if (value == null) return ''
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : String(v)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const slug = firstQueryParam(req.query.slug).trim()
  if (!slug) {
    res.status(400).json({ error: 'Missing slug query parameter' })
    return
  }

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    res.status(503).json({ error: 'Supabase is not configured on the server' })
    return
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
      accent_preset,
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
    res.status(500).json({ error: error.message })
    return
  }
  if (!data) {
    res.status(404).json({ error: 'Review not found' })
    return
  }

  const row = data as {
    slug: string
    name: string
    subtitle: string
    release_label: string | null
    accent_preset: number | null
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

  res.status(200).json({
    paths: { web: `/g/${row.slug}`, api: `/api/review?slug=${encodeURIComponent(row.slug)}` },
    review: {
      slug: row.slug,
      name: row.name,
      subtitle: row.subtitle,
      releaseLabel: row.release_label,
      accentPreset: row.accent_preset ?? null,
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
      publishedAtLabel: formatReviewPublishedLabel(row.created_at),
    },
  })
}
