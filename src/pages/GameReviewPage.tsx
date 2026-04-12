import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { GameReviewView, type GameReviewViewModel } from '../components/GameReviewView'
import { CommentsSection } from '../components/CommentsSection'
import type { CommentRow, GameStats, PlayIfLikedStored } from '../types/game'
import { formatHltbHours } from '../lib/formatHltb'
import { getSupabaseBrowser } from '../lib/supabaseClient'
import type { ReviewMode } from '../review/getReviewTheme'
import { formatReviewPublishedLabel } from '../lib/formatReviewPublished'
import { resolveReviewMode, writeReviewModePreference } from '../lib/reviewModePreference'

type GameJoinRow = {
  id: string
  slug: string
  name: string
  subtitle: string
  created_at: string
  release_label: string | null
  cover_image_url: string | null
  platforms: string[] | null
  hltb_main_hours: number | null
  hltb_extras_hours: number | null
  hltb_completionist_hours: number | null
  stats: GameStats
  pros: string[]
  cons: string[]
  play_if_liked: PlayIfLikedStored[]
  game_genres: { genre: string }[] | null
  game_tags: { tag: string }[] | null
}

function isGameStats(raw: unknown): raw is GameStats {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, number>
  const keys = ['Value', 'Architecture', 'Presentation', 'Narrative', 'Novelty', 'Fun']
  for (const k of keys) {
    const v = o[k]
    if (typeof v !== 'number' || Number.isNaN(v)) return false
  }
  return true
}

export function GameReviewPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const mode = useMemo(() => resolveReviewMode(params.get('mode')), [params])

  useEffect(() => {
    const q = params.get('mode')
    if (q === 'dark' || q === 'light') writeReviewModePreference(q)
  }, [params])

  const sb = useMemo(() => getSupabaseBrowser(), [])

  const [vm, setVm] = useState<GameReviewViewModel | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!slug) return
      if (!sb) {
        setError('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
        setLoading(false)
        return
      }
      setError(null)
      setLoading(true)
      const { data: game, error: gErr } = await sb
        .from('games')
        .select(
          `
          id,
          slug,
          name,
          subtitle,
          created_at,
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
          game_genres ( genre ),
          game_tags ( tag )
        `,
        )
        .eq('slug', slug)
        .maybeSingle()

      if (cancelled) return
      if (gErr) {
        setError(gErr.message)
        setLoading(false)
        return
      }
      if (!game) {
        setVm(null)
        setGameId(null)
        setComments([])
        setError('Review not found.')
        setLoading(false)
        return
      }

      const row = game as GameJoinRow
      if (!isGameStats(row.stats)) {
        setError('Invalid review data.')
        setLoading(false)
        return
      }

      const genres = (row.game_genres ?? []).map((r) => r.genre)
      const tags = (row.game_tags ?? []).map((r) => r.tag)
      const playIfLiked = Array.isArray(row.play_if_liked) ? row.play_if_liked : []

      const nextVm: GameReviewViewModel = {
        name: row.name,
        subtitle: row.subtitle,
        releaseLabel: row.release_label,
        publishedAtLabel: formatReviewPublishedLabel(row.created_at),
        coverImageUrl: row.cover_image_url,
        platforms: Array.isArray(row.platforms) ? row.platforms : [],
        hltbMain: formatHltbHours(row.hltb_main_hours),
        hltbExtras: formatHltbHours(row.hltb_extras_hours),
        hltbCompletionist: formatHltbHours(row.hltb_completionist_hours),
        genres,
        tags,
        playIfLiked: playIfLiked.map((p) => ({ name: p.name, slug: p.slug })),
        pros: row.pros ?? [],
        cons: row.cons ?? [],
        stats: row.stats,
        radarLabel: `${row.name} review stats radar chart`,
      }

      setVm(nextVm)
      setGameId(row.id)

      const { data: coms, error: cErr } = await sb
        .from('comments')
        .select('id, game_id, body, author_name, created_at')
        .eq('game_id', row.id)
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (cErr) {
        setComments([])
      } else {
        setComments((coms ?? []) as CommentRow[])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sb, slug])

  const setMode = useCallback(
    (next: ReviewMode) => {
      writeReviewModePreference(next)
      const nextParams = new URLSearchParams(params)
      nextParams.set('mode', next)
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  if (!sb) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-zinc-100">
        <p className="text-sm text-zinc-400">Supabase is not configured.</p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Add <span className="font-mono">VITE_SUPABASE_URL</span> and{' '}
          <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>, run the SQL migration, then reload.
        </p>
        <Link className="mt-8 inline-block text-sm font-semibold text-emerald-300 underline-offset-4 hover:underline" to="/">
          Back home
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-zinc-100">
        <p className="text-sm text-zinc-400">Loading review…</p>
      </div>
    )
  }

  if (error && !vm) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-zinc-100">
        <p className="text-sm text-zinc-300">{error}</p>
        <Link className="mt-8 inline-block text-sm font-semibold text-emerald-300 underline-offset-4 hover:underline" to="/">
          Back home
        </Link>
      </div>
    )
  }

  if (!vm || !gameId || !slug) return null

  return (
    <>
      <GameReviewView
        vm={vm}
        mode={mode}
        onModeChange={setMode}
        showModeToggle
        navCrumbs={[
          { label: 'Home', to: '/' },
          { label: vm.name },
        ]}
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-4 pt-2 md:px-8">
        <Link
          to={`/addgame?edit=${encodeURIComponent(slug)}`}
          className="text-sm font-semibold text-emerald-300/90 underline-offset-4 hover:underline"
        >
          Edit in Add game
        </Link>
        <span className="mx-2 text-zinc-600">·</span>
        <span className="text-xs text-zinc-500">
          Same as choosing this title in the load dropdown on <span className="font-mono">/addgame</span>. JSON:{' '}
          <span className="font-mono">/api/review?slug={slug}</span>
        </span>
      </div>
      <CommentsSection gameId={gameId} mode={mode} initialComments={comments} />
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] w-[min(92vw,360px)] -translate-x-1/2 text-center">
        <Link
          to="/"
          className="pointer-events-auto text-xs font-semibold text-zinc-500 underline-offset-4 hover:underline"
        >
          Back to reviews
        </Link>
      </div>
    </>
  )
}
