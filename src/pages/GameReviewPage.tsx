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
import { resolveDarkAccentHue } from '../review/reviewDarkAccent'

type GameJoinRow = {
  id: string
  slug: string
  name: string
  subtitle: string
  created_at: string
  release_label: string | null
  accent_hue?: number | null
  accent_preset?: number | null
  accent_gray_level?: number | null
  cover_image_url: string | null
  platforms: string[] | null
  hltb_main_hours: number | null
  hltb_extras_hours: number | null
  hltb_completionist_hours: number | null
  stats: GameStats
  pros: string[]
  cons: string[]
  summary: string | null
  editor_note: string | null
  play_if_liked: PlayIfLikedStored[]
  game_genres: { genre: string }[] | null
  game_tags: { tag: string }[] | null
  visibility_score?: number | null
  steam_developer?: string | null
  steam_publisher?: string | null
  steam_base_price?: string | null
  steam_review_score_percent?: number | null
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

function getOrCreateVisitorKey(): string | null {
  try {
    const existing = window.localStorage.getItem('gamerev:visitor-key')
    if (existing && /^[A-Za-z0-9:_-]{16,128}$/.test(existing)) return existing
    const next =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem('gamerev:visitor-key', next)
    return next
  } catch {
    return null
  }
}

function reviewViewStorageKey(slug: string): string {
  return `gamerev:viewed:${slug}`
}

function hasTrackedReviewToday(slug: string): boolean {
  try {
    const today = new Date().toISOString().slice(0, 10)
    return window.localStorage.getItem(reviewViewStorageKey(slug)) === today
  } catch {
    return false
  }
}

function markTrackedReviewToday(slug: string) {
  try {
    window.localStorage.setItem(reviewViewStorageKey(slug), new Date().toISOString().slice(0, 10))
  } catch {
    /* ignore */
  }
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
          accent_hue,
          accent_preset,
          accent_gray_level,
          cover_image_url,
          platforms,
          hltb_main_hours,
          hltb_extras_hours,
          hltb_completionist_hours,
          stats,
          pros,
          cons,
          summary,
          editor_note,
          play_if_liked,
          game_genres ( genre ),
          game_tags ( tag ),
          visibility_score,
          steam_developer,
          steam_publisher,
          steam_base_price,
          steam_review_score_percent
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
        reviewSummary: row.summary?.trim() ? row.summary.trim() : null,
        editorNote: row.editor_note?.trim() ? row.editor_note.trim() : null,
        stats: row.stats,
        radarLabel: `${row.name} review stats radar chart`,
        accentHue:
          typeof row.accent_gray_level === 'number' &&
          row.accent_gray_level >= 0 &&
          row.accent_gray_level <= 100
            ? null
            : typeof row.accent_hue === 'number' && row.accent_hue >= 0 && row.accent_hue < 360
              ? Math.round(row.accent_hue)
              : null,
        accentPreset:
          typeof row.accent_gray_level === 'number' &&
          row.accent_gray_level >= 0 &&
          row.accent_gray_level <= 100
            ? null
            : typeof row.accent_preset === 'number' && row.accent_preset >= 0 && row.accent_preset <= 4
              ? row.accent_preset
              : null,
        accentGrayLevel:
          typeof row.accent_gray_level === 'number' &&
          row.accent_gray_level >= 0 &&
          row.accent_gray_level <= 100
            ? Math.round(row.accent_gray_level)
            : null,
        visibilityScore:
          typeof row.visibility_score === 'number' && Number.isFinite(row.visibility_score)
            ? Math.min(1, Math.max(0, row.visibility_score))
            : null,
        steamDeveloper: row.steam_developer?.trim() ? row.steam_developer.trim() : null,
        steamPublisher: row.steam_publisher?.trim() ? row.steam_publisher.trim() : null,
        steamBasePrice: row.steam_base_price?.trim() ? row.steam_base_price.trim() : null,
        steamReviewScorePercent:
          typeof row.steam_review_score_percent === 'number' && Number.isFinite(row.steam_review_score_percent)
            ? row.steam_review_score_percent
            : null,
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

  useEffect(() => {
    if (!slug || !gameId || loading || error) return
    if (hasTrackedReviewToday(slug)) return
    const visitorKey = getOrCreateVisitorKey()
    if (!visitorKey) return
    void fetch('/api/review-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, visitorKey }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as
          | { viewCount?: number; inserted?: boolean; error?: string }
          | null
        if (res.ok) {
          markTrackedReviewToday(slug)
          console.debug('[GameRev] review-view tracked', {
            slug,
            inserted: json?.inserted,
            viewCount: json?.viewCount,
          })
          return
        }
        console.warn('[GameRev] review-view failed', {
          slug,
          status: res.status,
          error: json?.error ?? res.statusText,
        })
      })
      .catch((err) => {
        console.warn('[GameRev] review-view request error', {
          slug,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, [error, gameId, loading, slug])

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

  const darkAccentHue = resolveDarkAccentHue(slug, {
    accentHue: vm.accentHue,
    accentPreset: vm.accentPreset,
  })

  return (
    <div
      className={
        mode === 'dark'
          ? 'w-full min-w-0 overflow-x-hidden bg-[#120d0a]'
          : 'w-full min-w-0 overflow-x-hidden bg-[#f4f4f5]'
      }
    >
      <GameReviewView
        vm={vm}
        mode={mode}
        onModeChange={setMode}
        darkAccentHue={darkAccentHue}
        showModeToggle
        navCrumbs={[
          { label: 'Home', to: '/' },
          { label: vm.name },
        ]}
      />
      <CommentsSection
        gameId={gameId}
        mode={mode}
        initialComments={comments}
        darkAccentHue={darkAccentHue}
        accentGrayLevel={vm.accentGrayLevel}
      />
    </div>
  )
}
