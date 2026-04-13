import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { MockNav } from '../components/MockNav'
import { statAxes, statAxisTooltips, type GameStats } from '../review/gameStats'
import {
  ACCENT_PRESET_HUES,
  ACCENT_PRESET_LABELS,
  DEFAULT_DARK_REVIEW_ACCENT_HUE,
} from '../review/reviewDarkAccent'
import { getSupabaseBrowser } from '../lib/supabaseClient'
import { readReviewModePreference } from '../lib/reviewModePreference'

type HltbHit = {
  id: string
  name: string
  imageUrl: string
  platforms?: string[]
  gameplayMain?: number
  gameplayMainExtra?: number
  gameplayCompletionist?: number
  similarity: number
}

function defaultStats(): GameStats {
  return {
    Value: 50,
    Architecture: 50,
    Presentation: 50,
    Narrative: 50,
    Novelty: 50,
    Fun: 50,
  }
}

function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function isGameStats(raw: unknown): raw is GameStats {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, number>
  const keys = ['Value', 'Architecture', 'Presentation', 'Narrative', 'Novelty', 'Fun'] as const
  for (const k of keys) {
    const v = o[k]
    if (typeof v !== 'number' || Number.isNaN(v)) return false
  }
  return true
}

function looksLikeHttpImageUrl(raw: string | null): boolean {
  if (!raw || raw.length > 2048) return false
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

type IgdbGenreRow = {
  title: string
  externalId: string
  genres: string[]
  releaseLabel: string | null
}

type CatalogRankedGame = { name: string; slug: string; catalog_rank: number }

function ChipToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
        active
          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
          : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500',
      )}
    >
      {label}
    </button>
  )
}

export function AddGamePage() {
  const sb = useMemo(() => getSupabaseBrowser(), [])
  const [searchParams, setSearchParams] = useSearchParams()
  const loadReviewSlug = useMemo(() => (searchParams.get('edit') ?? '').trim(), [searchParams])

  const [poolGenres, setPoolGenres] = useState<string[]>([])
  const [poolTags, setPoolTags] = useState<string[]>([])
  const [reviewedGames, setReviewedGames] = useState<{ name: string; slug: string }[]>([])
  const [rankedCatalogGames, setRankedCatalogGames] = useState<CatalogRankedGame[]>([])
  const [catalogRankPosition, setCatalogRankPosition] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [releaseLabel, setReleaseLabel] = useState('')
  const [password, setPassword] = useState('')

  const [hltbQuery, setHltbQuery] = useState('')
  const [hltbHits, setHltbHits] = useState<HltbHit[]>([])
  const [hltbBusy, setHltbBusy] = useState(false)
  const [hltbDetailBusy, setHltbDetailBusy] = useState(false)
  const [hltbError, setHltbError] = useState<string | null>(null)
  const [reviewPlatforms, setReviewPlatforms] = useState<string[]>([])
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [coverPreviewFailed, setCoverPreviewFailed] = useState(false)
  /** null = auto (slug hash); 0–359 = saved dark accent hue. */
  const [accentHue, setAccentHue] = useState<number | null>(null)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)
  const [coverAccentBusy, setCoverAccentBusy] = useState(false)
  const [hltbMainHours, setHltbMainHours] = useState<number | null>(null)
  const [hltbExtrasHours, setHltbExtrasHours] = useState<number | null>(null)
  const [hltbCompletionistHours, setHltbCompletionistHours] = useState<number | null>(null)

  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set())
  const [genreDraft, setGenreDraft] = useState('')
  const [extGenreQuery, setExtGenreQuery] = useState('')
  const [igdbMatches, setIgdbMatches] = useState<IgdbGenreRow[]>([])
  const [igdbBusy, setIgdbBusy] = useState(false)
  const [igdbErr, setIgdbErr] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagDraft, setTagDraft] = useState('')

  const [stats, setStats] = useState<GameStats>(() => defaultStats())

  const [playIfLikedText, setPlayIfLikedText] = useState('')
  const [prosText, setProsText] = useState('')
  const [consText, setConsText] = useState('')

  const [submitStatus, setSubmitStatus] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editLoadError, setEditLoadError] = useState<string | null>(null)

  /** Tracks last loaded edit slug so we only reset the form when switching away from an edit, not on first paint. */
  const lastLoadedEditSlugRef = useRef<string>('')
  /** New-review default: first time the catalog has rows, default to last slot (append). */
  const catalogDefaultAppendDoneRef = useRef(false)

  const resetNewReviewForm = useCallback(() => {
    setName('')
    setSubtitle('')
    setReleaseLabel('')
    setPassword('')
    setHltbQuery('')
    setHltbHits([])
    setHltbBusy(false)
    setHltbDetailBusy(false)
    setHltbError(null)
    setReviewPlatforms([])
    setCoverImageUrl(null)
    setCoverPreviewFailed(false)
    setAccentHue(null)
    setAccentMsg(null)
    setCoverAccentBusy(false)
    setHltbMainHours(null)
    setHltbExtrasHours(null)
    setHltbCompletionistHours(null)
    setSelectedGenres(new Set())
    setGenreDraft('')
    setExtGenreQuery('')
    setIgdbMatches([])
    setIgdbBusy(false)
    setIgdbErr(null)
    setSelectedTags(new Set())
    setTagDraft('')
    setStats(defaultStats())
    setPlayIfLikedText('')
    setProsText('')
    setConsText('')
    setSubmitStatus(null)
    setSavedSlug(null)
    catalogDefaultAppendDoneRef.current = true
    setCatalogRankPosition(rankedCatalogGames.length > 0 ? rankedCatalogGames.length + 1 : 1)
  }, [rankedCatalogGames])

  useEffect(() => {
    const client = sb
    if (!client) return
    let cancelled = false
    async function loadPools() {
      if (!client) return
      const [gRes, tRes, gamesRes] = await Promise.all([
        client.from('genres').select('name').order('name'),
        client.from('tags').select('name').order('name'),
        client.from('games').select('name, slug, catalog_rank').order('name'),
      ])
      if (cancelled) return
      setPoolGenres((gRes.data ?? []).map((r) => r.name as string))
      setPoolTags((tRes.data ?? []).map((r) => r.name as string))
      const gameRows = (gamesRes.data ?? []) as CatalogRankedGame[]
      setReviewedGames(gameRows.map(({ name, slug }) => ({ name, slug })))
      setRankedCatalogGames([...gameRows].sort((a, b) => a.catalog_rank - b.catalog_rank))
    }
    void loadPools()
    return () => {
      cancelled = true
    }
  }, [sb])

  useEffect(() => {
    if (loadReviewSlug) return
    const n = rankedCatalogGames.length
    const max = n > 0 ? n + 1 : 1
    if (!catalogDefaultAppendDoneRef.current && n > 0) {
      catalogDefaultAppendDoneRef.current = true
      setCatalogRankPosition(max)
      return
    }
    setCatalogRankPosition((p) => {
      if (p == null) return max
      return Math.min(Math.max(1, p), max)
    })
  }, [loadReviewSlug, rankedCatalogGames])

  useEffect(() => {
    if (!sb) return
    if (!loadReviewSlug) {
      if (lastLoadedEditSlugRef.current !== '') {
        resetNewReviewForm()
      }
      lastLoadedEditSlugRef.current = ''
      setEditLoading(false)
      setEditLoadError(null)
      return
    }
    let cancelled = false
    setEditLoading(true)
      setEditLoadError(null)
      setSubmitStatus(null)
      setSavedSlug(null)
      setAccentMsg(null)
      setCatalogRankPosition(null)
    void (async () => {
      type GameEditRow = {
        name: string
        subtitle: string
        catalog_rank: number
        release_label: string | null
        accent_hue?: number | null
        accent_preset?: number | null
        cover_image_url: string | null
        platforms: string[] | null
        hltb_main_hours: number | null
        hltb_extras_hours: number | null
        hltb_completionist_hours: number | null
        stats: unknown
        pros: string[]
        cons: string[]
        play_if_liked: { name: string; slug?: string | null }[] | null
        game_genres: { genre: string }[] | null
        game_tags: { tag: string }[] | null
      }
      const { data, error } = await sb
        .from('games')
        .select(
          `
          name,
          subtitle,
          catalog_rank,
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
          play_if_liked,
          game_genres ( genre ),
          game_tags ( tag )
        `,
        )
        .eq('slug', loadReviewSlug)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setEditLoadError(error.message)
        setEditLoading(false)
        return
      }
      if (!data) {
        setEditLoadError('Review not found.')
        setEditLoading(false)
        return
      }
      const row = data as GameEditRow
      setName(row.name)
      setSubtitle(row.subtitle)
      setCatalogRankPosition(
        typeof row.catalog_rank === 'number' && row.catalog_rank >= 1 ? row.catalog_rank : 1,
      )
      setReleaseLabel(row.release_label?.trim() ?? '')
      setCoverImageUrl(row.cover_image_url)
      let ah: number | null = null
      if (typeof row.accent_hue === 'number' && row.accent_hue >= 0 && row.accent_hue < 360) {
        ah = Math.round(row.accent_hue)
      } else if (typeof row.accent_preset === 'number' && row.accent_preset >= 0 && row.accent_preset <= 4) {
        ah = ACCENT_PRESET_HUES[row.accent_preset]
      }
      setAccentHue(ah)
      setReviewPlatforms(Array.isArray(row.platforms) ? [...row.platforms] : [])
      setHltbMainHours(row.hltb_main_hours)
      setHltbExtrasHours(row.hltb_extras_hours)
      setHltbCompletionistHours(row.hltb_completionist_hours)
      if (isGameStats(row.stats)) setStats(row.stats)
      else setStats(defaultStats())
      const gList = (row.game_genres ?? []).map((r) => r.genre)
      const tList = (row.game_tags ?? []).map((r) => r.tag)
      setSelectedGenres(new Set(gList))
      setSelectedTags(new Set(tList))
      setPoolGenres((prev) => [...new Set([...prev, ...gList])].sort((a, b) => a.localeCompare(b)))
      setPoolTags((prev) => [...new Set([...prev, ...tList])].sort((a, b) => a.localeCompare(b)))
      setProsText((row.pros ?? []).join('\n'))
      setConsText((row.cons ?? []).join('\n'))
      const pil = Array.isArray(row.play_if_liked) ? row.play_if_liked : []
      setPlayIfLikedText(pil.map((p) => p.name).join('\n'))
      setExtGenreQuery(row.name)
      setHltbQuery(row.name)
      setIgdbMatches([])
      setIgdbErr(null)
      lastLoadedEditSlugRef.current = loadReviewSlug
      setEditLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [sb, loadReviewSlug, resetNewReviewForm])

  useEffect(() => {
    const q = hltbQuery.trim()
    if (q.length < 2) {
      setHltbHits([])
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setHltbBusy(true)
        setHltbError(null)
        try {
          const res = await fetch(`/api/hltb-search?q=${encodeURIComponent(q)}`)
          const json = (await res.json()) as { results?: HltbHit[]; error?: string }
          if (!res.ok) throw new Error(json.error ?? 'Search failed')
          setHltbHits(json.results ?? [])
        } catch (e) {
          setHltbHits([])
          setHltbError(e instanceof Error ? e.message : 'Search failed')
        } finally {
          setHltbBusy(false)
        }
      })()
    }, 400)
    return () => window.clearTimeout(t)
  }, [hltbQuery])

  useEffect(() => {
    setCoverPreviewFailed(false)
  }, [coverImageUrl])

  const toggleGenre = useCallback((g: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }, [])

  const toggleTag = useCallback((t: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [])

  const addGenreDraft = useCallback(() => {
    const v = genreDraft.trim()
    if (!v) return
    setPoolGenres((prev) => (prev.includes(v) ? prev : [...prev, v].sort((a, b) => a.localeCompare(b))))
    setSelectedGenres((prev) => new Set(prev).add(v))
    setGenreDraft('')
  }, [genreDraft])

  const addExternalGenres = useCallback((labels: string[]) => {
    const cleaned = [...new Set(labels.map((s) => s.trim()).filter(Boolean))]
    if (!cleaned.length) return
    setPoolGenres((prev) => {
      const next = new Set(prev)
      for (const g of cleaned) next.add(g)
      return [...next].sort((a, b) => a.localeCompare(b))
    })
    setSelectedGenres((prev) => {
      const next = new Set(prev)
      for (const g of cleaned) next.add(g)
      return next
    })
  }, [])

  const extSearchQ = useCallback(() => (extGenreQuery.trim() || name.trim()), [extGenreQuery, name])

  const rankSelectOptions = useMemo(() => {
    if (loadReviewSlug) {
      return rankedCatalogGames.map((g, i) => ({
        value: i + 1,
        label: `${i + 1}. ${g.name}${g.slug === loadReviewSlug ? ' (this review)' : ''}`,
      }))
    }
    if (rankedCatalogGames.length === 0) {
      return [{ value: 1, label: '1 — First review on the site' }]
    }
    const out: { value: number; label: string }[] = []
    out.push({ value: 1, label: `1 — First (before “${rankedCatalogGames[0].name}”)` })
    for (let i = 1; i < rankedCatalogGames.length; i++) {
      const after = rankedCatalogGames[i - 1]
      out.push({ value: i + 1, label: `${i + 1} — After “${after.name}”` })
    }
    const last = rankedCatalogGames[rankedCatalogGames.length - 1]
    out.push({
      value: rankedCatalogGames.length + 1,
      label: `${rankedCatalogGames.length + 1} — Last (after “${last.name}”)`,
    })
    return out
  }, [loadReviewSlug, rankedCatalogGames])

  const runIgdbSearch = useCallback(async (explicitQuery: string) => {
    const q = explicitQuery.trim()
    if (q.length < 2) {
      setIgdbErr('Need at least 2 characters for IGDB search.')
      setIgdbMatches([])
      return
    }
    setExtGenreQuery(q)
    setIgdbBusy(true)
    setIgdbErr(null)
    try {
      const res = await fetch(`/api/igdb-genres?q=${encodeURIComponent(q)}`)
      const raw = await res.text()
      let json: { matches?: IgdbGenreRow[]; error?: string }
      try {
        json = JSON.parse(raw) as { matches?: IgdbGenreRow[]; error?: string }
      } catch {
        throw new Error(
          res.ok
            ? 'IGDB response was not valid JSON. Check Vercel function logs.'
            : `IGDB request failed (${res.status}). The server did not return JSON—often an HTML error page. Check Vercel logs and IGDB env vars.`,
        )
      }
      if (!res.ok) throw new Error(json.error ?? 'IGDB request failed')
      setIgdbMatches(
        (json.matches ?? []).map((m) => ({
          title: m.title,
          externalId: m.externalId,
          genres: Array.isArray(m.genres) ? m.genres : [],
          releaseLabel: m.releaseLabel ?? null,
        })),
      )
    } catch (e) {
      setIgdbErr(e instanceof Error ? e.message : 'IGDB failed')
      setIgdbMatches([])
    } finally {
      setIgdbBusy(false)
    }
  }, [])

  const searchIgdbGenres = useCallback(() => {
    void runIgdbSearch(extSearchQ())
  }, [extSearchQ, runIgdbSearch])

  const addTagDraft = useCallback(() => {
    const v = tagDraft.trim()
    if (!v) return
    setPoolTags((prev) => (prev.includes(v) ? prev : [...prev, v].sort((a, b) => a.localeCompare(b))))
    setSelectedTags((prev) => new Set(prev).add(v))
    setTagDraft('')
  }, [tagDraft])

  const applyHltb = useCallback(async (hit: HltbHit) => {
    setName(hit.name)
    setCoverImageUrl(hit.imageUrl)
    setReviewPlatforms(hit.platforms?.length ? [...hit.platforms] : [])
    setHltbMainHours(hit.gameplayMain ?? null)
    setHltbExtrasHours(hit.gameplayMainExtra ?? null)
    setHltbCompletionistHours(hit.gameplayCompletionist ?? null)
    setHltbHits([])
    setHltbQuery(hit.name)
    setHltbDetailBusy(true)
    try {
      const res = await fetch(`/api/hltb-detail?id=${encodeURIComponent(hit.id)}`)
      const json = (await res.json()) as {
        description?: string
        platforms?: string[]
        gameplayMain?: number
        gameplayMainExtra?: number
        gameplayCompletionist?: number
        error?: string
      }
      if (res.ok) {
        if (typeof json.description === 'string') {
          const t = json.description.trim()
          if (t) setSubtitle(t.slice(0, 500))
        }
        if (Array.isArray(json.platforms) && json.platforms.length) {
          setReviewPlatforms([...json.platforms])
        }
        if (json.gameplayMain != null) setHltbMainHours(json.gameplayMain)
        if (json.gameplayMainExtra != null) setHltbExtrasHours(json.gameplayMainExtra)
        if (json.gameplayCompletionist != null) setHltbCompletionistHours(json.gameplayCompletionist)
      }
    } catch {
      /* subtitle / detail optional */
    } finally {
      setHltbDetailBusy(false)
    }
    await runIgdbSearch(hit.name)
  }, [runIgdbSearch])

  const suggestCoverAccent = useCallback(async () => {
    if (!coverImageUrl?.trim()) {
      setAccentMsg('Set a cover URL first.')
      return
    }
    setAccentMsg(null)
    setCoverAccentBusy(true)
    try {
      const res = await fetch('/api/sample-cover-accent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: coverImageUrl }),
      })
      const rawText = await res.text()
      let json: { hue?: number; error?: string } = {}
      try {
        json = JSON.parse(rawText) as { hue?: number; error?: string }
      } catch {
        /* e.g. HTML if /api was rewritten to index.html — fix vercel.json */
      }
      if (res.ok && typeof json.hue === 'number' && Number.isFinite(json.hue)) {
        let h = Math.round(json.hue) % 360
        if (h < 0) h += 360
        setAccentHue(h)
        return
      }
      setAccentMsg(json.error ?? 'Could not sample this cover. Set a hue manually.')
    } catch {
      setAccentMsg('Could not sample this cover. Set a hue manually.')
    } finally {
      setCoverAccentBusy(false)
    }
  }, [coverImageUrl])

  const submit = useCallback(async () => {
    setSubmitStatus(null)
    if (!name.trim()) {
      setSubmitStatus('Game name is required.')
      return
    }
    if (loadReviewSlug && (editLoading || editLoadError)) {
      setSubmitStatus('Wait for the review to finish loading, or fix the load error above.')
      return
    }
    if (catalogRankPosition == null || !Number.isInteger(catalogRankPosition)) {
      setSubmitStatus('Choose a catalog rank (wait for the list to load if needed).')
      return
    }
    const maxRank = loadReviewSlug ? rankedCatalogGames.length : rankedCatalogGames.length + 1
    if (catalogRankPosition < 1 || catalogRankPosition > maxRank) {
      setSubmitStatus('Catalog rank is out of range—reload the page and pick a position again.')
      return
    }
    setSubmitBusy(true)
    try {
      const playIfLiked = linesToList(playIfLikedText).map((n) => ({ name: n }))
      const body = {
        password: password,
        name: name.trim(),
        subtitle: subtitle.trim(),
        releaseLabel: releaseLabel.trim() || null,
        coverImageUrl,
        platforms: reviewPlatforms,
        hltbMainHours,
        hltbExtrasHours,
        hltbCompletionistHours,
        stats,
        genres: [...selectedGenres],
        tags: [...selectedTags],
        pros: linesToList(prosText),
        cons: linesToList(consText),
        playIfLiked,
        accentHue,
        catalogRank: catalogRankPosition,
        ...(loadReviewSlug ? { slug: loadReviewSlug } : {}),
      }
      const url = loadReviewSlug ? '/api/update-game' : '/api/add-game'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { slug?: string; error?: string }
      if (!res.ok) {
        const hint =
          /platforms|release_label|accent_preset|accent_hue|catalog_rank|schema cache/i.test(json.error ?? '')
            ? ' Run pending Supabase migrations (see supabase/migrations), especially `20260413000000_ensure_games_review_columns.sql`, `20260414120000_accent_preset.sql`, `20260415120000_accent_hue.sql`, and `20260416100000_catalog_rank.sql`.'
            : ''
        throw new Error((json.error ?? 'Save failed') + hint)
      }
      if (!json.slug) throw new Error('Missing slug in response')
      setSavedSlug(json.slug)
      setAccentMsg(null)
      setSubmitStatus(loadReviewSlug ? 'Updated.' : 'Saved.')
      if (sb) {
        const refresh = await sb.from('games').select('name, slug, catalog_rank').order('name')
        const gameRows = (refresh.data ?? []) as CatalogRankedGame[]
        setReviewedGames(gameRows.map(({ name, slug }) => ({ name, slug })))
        setRankedCatalogGames([...gameRows].sort((a, b) => a.catalog_rank - b.catalog_rank))
      }
    } catch (e) {
      setSubmitStatus(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitBusy(false)
    }
  }, [
    accentHue,
    catalogRankPosition,
    consText,
    coverImageUrl,
    editLoadError,
    editLoading,
    loadReviewSlug,
    rankedCatalogGames.length,
    sb,
    hltbCompletionistHours,
    hltbExtrasHours,
    hltbMainHours,
    name,
    password,
    playIfLikedText,
    prosText,
    releaseLabel,
    reviewPlatforms,
    selectedGenres,
    selectedTags,
    stats,
    subtitle,
  ])

  if (!sb) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 px-4 py-14 text-zinc-100">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-zinc-400">Supabase env vars are missing.</p>
          <Link to="/" className="mt-6 inline-block text-sm font-semibold text-emerald-300 underline-offset-4 hover:underline">
            Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 px-4 py-14 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-10">
        <header>
          <div className="mb-8 border-b border-zinc-800 pb-5">
            <MockNav
              crumbs={[{ label: 'Home', to: '/' }, { label: 'Add game' }]}
              className="text-sm text-zinc-400"
            />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{loadReviewSlug ? 'Edit review' : 'Add a review'}</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Use <span className="font-semibold text-zinc-300">Load review to edit</span> below to pick an existing post, then{' '}
            <span className="font-semibold text-zinc-300">Save changes</span>. Leave it on “New review” to publish a new one.
            HLTB and IGDB run on <span className="font-mono">/api/*</span>. You need{' '}
            <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> and <span className="font-mono">ADD_GAME_PASSWORD</span>.
            IGDB: <span className="font-mono">IGDB_CLIENT_ID</span> + <span className="font-mono">IGDB_CLIENT_SECRET</span>. Public
            URL: <span className="font-mono">/g/your-slug</span>; JSON: <span className="font-mono">GET /api/review?slug=…</span>.
          </p>
          <label className="mt-6 block text-sm text-zinc-300">
            <span className="font-medium text-zinc-200">Load review to edit</span>
            <select
              className="mt-2 w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 focus:ring-2"
              value={loadReviewSlug}
              onChange={(e) => {
                const v = e.target.value.trim()
                if (!v) {
                  setSearchParams({}, { replace: true })
                } else {
                  setSearchParams({ edit: v }, { replace: true })
                }
              }}
            >
              <option value="">New review (publish)</option>
              {reviewedGames.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              Slug and first publish date stay the same when you update. Comments stay on the review.
            </span>
          </label>
          {loadReviewSlug ? (
            <p className="mt-2 text-xs text-zinc-500">
              Editing <span className="font-mono text-zinc-400">{loadReviewSlug}</span>
            </p>
          ) : null}
          {editLoading ? <p className="mt-3 text-sm text-zinc-400">Loading review…</p> : null}
          {editLoadError ? (
            <p className="mt-3 text-sm text-rose-300">
              {editLoadError}{' '}
              <Link to="/" className="font-semibold text-emerald-300 underline-offset-4 hover:underline">
                Home
              </Link>
            </p>
          ) : null}
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-emerald-300 underline-offset-4 hover:underline">
            Back home
          </Link>
        </header>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Home catalog rank</h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            Required. Sets where this review appears when visitors use <strong className="text-zinc-400">Sort → Rank</strong>{' '}
            on the home page. Rank <span className="font-mono text-zinc-400">1</span> is the top of the list. New reviews
            default to the last slot; change the dropdown to insert elsewhere.
          </p>
          <label className="block text-sm font-medium text-zinc-300">Position for this review</label>
          <select
            className="mt-1 w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={catalogRankPosition ?? ''}
            disabled={catalogRankPosition == null || (!!loadReviewSlug && (editLoading || !!editLoadError))}
            onChange={(e) => setCatalogRankPosition(Number(e.target.value))}
          >
            {catalogRankPosition == null ? (
              <option value="">Loading catalog…</option>
            ) : (
              rankSelectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            )}
          </select>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current order</p>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
            {rankedCatalogGames.length === 0 ? (
              <p className="text-sm text-zinc-500">No published reviews yet—this one will be rank 1.</p>
            ) : (
              <ol className="space-y-2 text-sm text-zinc-200">
                {rankedCatalogGames.map((g) => (
                  <li key={g.slug} className="flex gap-2">
                    <span className="w-8 shrink-0 font-mono text-zinc-500 tabular-nums">{g.catalog_rank}.</span>
                    <span className={g.slug === loadReviewSlug ? 'font-semibold text-emerald-200' : undefined}>
                      {g.name}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">HowLongToBeat</h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            Search returns title, cover image URL, platform list, time buckets, and a <strong className="text-zinc-400">title match</strong>{' '}
            score (see each row). Picking a row fills cover, platforms, and hours; it then loads the HLTB game page for
            the <strong className="text-zinc-400">subtitle</strong> blurb and can refine hours/platforms.
          </p>
          <p className="text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-400">Title match</strong> is 0–100% from comparing your search text to the
            game title (roughly: longer common spelling = higher). Example: search{' '}
            <span className="font-mono">signalis</span> vs <span className="font-mono">Signalis</span> →{' '}
            <strong className="text-zinc-400">100%</strong>. Search <span className="font-mono">nioh</span> vs{' '}
            <span className="font-mono">Nioh: Complete Edition</span> → lower (more extra characters in the title).
          </p>
          <label className="block text-sm font-medium text-zinc-300">Search title</label>
          <input
            value={hltbQuery}
            onChange={(e) => setHltbQuery(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Type at least 2 characters…"
          />
          {hltbBusy ? <p className="text-xs text-zinc-500">Searching…</p> : null}
          {hltbDetailBusy ? <p className="text-xs text-zinc-500">Loading game page for subtitle…</p> : null}
          {hltbError ? <p className="text-xs text-rose-300">{hltbError}</p> : null}
          {hltbHits.length ? (
            <ul className="mt-2 max-h-64 space-y-2 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              {hltbHits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => void applyHltb(h)}
                    disabled={hltbDetailBusy}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-800/80 disabled:opacity-50"
                  >
                    <img src={h.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 font-medium text-zinc-100">{h.name}</span>
                    <span
                      className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-500"
                      title="How close your search string is to this game title (not quality of the game)."
                    >
                      {Math.round((h.similarity ?? 0) * 100)}% match
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Review copy</h2>
          <label className="block text-sm font-medium text-zinc-300">Game name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
          />
          <label className="mt-4 block text-sm font-medium text-zinc-300">
            Cover image URL <span className="font-normal text-zinc-500">(HLTB fills this; shown large on the review)</span>
          </label>
          <input
            value={coverImageUrl ?? ''}
            onChange={(e) => setCoverImageUrl(e.target.value.trim() ? e.target.value.trim() : null)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="https://…"
          />
          {looksLikeHttpImageUrl(coverImageUrl) && coverImageUrl ? (
            <div className="mt-3">
              {!coverPreviewFailed ? (
                <img
                  key={coverImageUrl}
                  src={coverImageUrl}
                  alt="Cover preview"
                  className="max-h-64 max-w-[min(100%,20rem)] rounded-lg border border-zinc-600 object-contain shadow-md"
                  onError={() => setCoverPreviewFailed(true)}
                />
              ) : (
                <p className="text-xs text-rose-300">Could not load an image from this URL (blocked, wrong link, or CORS).</p>
              )}
            </div>
          ) : coverImageUrl?.trim() ? (
            <p className="mt-2 text-xs text-zinc-500">Enter a full <span className="font-mono">https://</span> URL to see a preview.</p>
          ) : null}

          <div className="mt-6 rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-4">
            <p className="text-sm font-medium text-zinc-200">Dark mode leading color</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Shown in dark review mode. <span className="text-zinc-400">Auto</span> uses a stable hue from the URL slug.
              <span className="text-zinc-400"> Custom</span> saves the exact hue (0–359°); the review reuses the same HSL
              recipe as always, so every game can have its own accent.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="accentHueMode"
                  className="border-zinc-600 text-emerald-500 focus:ring-emerald-500/40"
                  checked={accentHue === null}
                  onChange={() => {
                    setAccentHue(null)
                    setAccentMsg(null)
                  }}
                />
                Auto (from slug)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="accentHueMode"
                  className="border-zinc-600 text-emerald-500 focus:ring-emerald-500/40"
                  checked={accentHue !== null}
                  onChange={() => {
                    setAccentHue((h) => (h == null ? DEFAULT_DARK_REVIEW_ACCENT_HUE : h))
                    setAccentMsg(null)
                  }}
                />
                Custom hue
              </label>
            </div>
            {accentHue !== null ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={accentHue}
                    onChange={(e) => {
                      setAccentHue(Number(e.target.value))
                      setAccentMsg(null)
                    }}
                    className="h-2 min-w-[min(100%,12rem)] flex-1 cursor-pointer accent-emerald-500"
                  />
                  <input
                    type="number"
                    min={0}
                    max={359}
                    value={accentHue}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isFinite(v)) return
                      let h = Math.round(v) % 360
                      if (h < 0) h += 360
                      setAccentHue(h)
                      setAccentMsg(null)
                    }}
                    className="w-16 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-center text-sm text-zinc-200"
                  />
                  <span className="text-xs text-zinc-500">°</span>
                </div>
                <p className="text-xs text-zinc-500">Shortcuts (editorial picks):</p>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESET_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setAccentHue(ACCENT_PRESET_HUES[i])
                        setAccentMsg(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-600 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900"
                    >
                      <span
                        className="h-2 w-2 rounded-full ring-1 ring-white/15"
                        style={{ backgroundColor: `hsl(${ACCENT_PRESET_HUES[i]} 58% 52%)` }}
                        aria-hidden
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void suggestCoverAccent()}
                disabled={coverAccentBusy || !looksLikeHttpImageUrl(coverImageUrl)}
                className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {coverAccentBusy ? 'Sampling cover…' : 'Suggest from cover'}
              </button>
              <span className="text-xs text-zinc-500">
                Server reads the HowLongToBeat JPEG and sets <span className="text-zinc-400">custom hue</span> to the
                dominant color (not Auto).
              </span>
            </div>
            {accentMsg ? <p className="mt-2 text-xs text-amber-200/90">{accentMsg}</p> : null}
            {accentHue !== null ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-3 py-2.5">
                <div
                  className="h-11 w-11 shrink-0 rounded-lg ring-2 ring-white/10"
                  style={{
                    backgroundColor: `hsl(${accentHue} 56% 52%)`,
                    boxShadow: `0 0 24px hsl(${accentHue} 50% 45% / 0.35)`,
                  }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">
                    Saved accent preview
                    <span className="ml-2 font-normal text-zinc-500">custom hue</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    <span className="text-zinc-300">{accentHue}°</span>
                    <span className="text-zinc-600"> — </span>
                    <span className="text-zinc-500">hsl({accentHue} 56% 52%)</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-zinc-600">
                <span className="text-zinc-500">Auto:</span> dark accent comes from the slug when you save (see the live
                review).
              </p>
            )}
          </div>

          <label className="mt-4 block text-sm font-medium text-zinc-300">
            Platforms <span className="font-normal text-zinc-500">(one per line; saved on the review)</span>
          </label>
          <textarea
            value={reviewPlatforms.join('\n')}
            onChange={(e) => setReviewPlatforms(linesToList(e.target.value).slice(0, 24))}
            rows={4}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder={'PC\nPlayStation 4'}
          />
          <label className="mt-4 block text-sm font-medium text-zinc-300">
            Subtitle <span className="font-normal text-zinc-500">(one line under the title)</span>
          </label>
          <textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="e.g. A survival horror love letter to late PS1 dread"
          />
          <label className="mt-4 block text-sm font-medium text-zinc-300">
            Release <span className="font-normal text-zinc-500">(month and year, optional)</span>
          </label>
          <input
            value={releaseLabel}
            onChange={(e) => setReleaseLabel(e.target.value)}
            placeholder="e.g. October 2022 — use “Use IGDB release” on a result below"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
          />
          <p className="text-xs text-zinc-500">
            Cover URL, platforms, and hours come from search; picking a result can refine them and fills subtitle from
            the HLTB game page when available. Release comes from IGDB when you use the button on a match.
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Hexagon stats (0–100)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {statAxes.map((axis) => (
              <label key={axis} className="block text-sm">
                <span className="text-zinc-300">{axis}</span>
                <p className="mt-0.5 text-xs leading-snug text-zinc-500">{statAxisTooltips[axis]}</p>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={stats[axis]}
                  title={statAxisTooltips[axis]}
                  onChange={(e) =>
                    setStats((s) => ({ ...s, [axis]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))
                  }
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Genres</h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            Pick chips below, type your own, or search{' '}
            <a className="text-emerald-400/90 underline-offset-2 hover:underline" href="https://api-docs.igdb.com/" target="_blank" rel="noreferrer">
              IGDB
            </a>{' '}
            (Twitch <span className="font-mono">IGDB_CLIENT_ID</span> + <span className="font-mono">IGDB_CLIENT_SECRET</span> on the server). Choosing a HowLongToBeat result runs IGDB automatically for that title; use Search below to try another query.
          </p>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">IGDB genre lookup</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1 text-sm text-zinc-300">
                Search query
                <input
                  value={extGenreQuery}
                  onChange={(e) => setExtGenreQuery(e.target.value)}
                  placeholder="Defaults to game name if empty"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <button
                type="button"
                onClick={() => setExtGenreQuery(name.trim())}
                className="shrink-0 rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Use game name
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={igdbBusy}
                onClick={searchIgdbGenres}
                className="rounded-lg bg-violet-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {igdbBusy ? 'Searching…' : 'Search IGDB'}
              </button>
            </div>
            {igdbErr ? <p className="mt-2 text-xs text-rose-300">{igdbErr}</p> : null}
            <div className="mt-4">
              {igdbMatches.length === 0 ? (
                <p className="text-xs text-zinc-600">No results yet.</p>
              ) : (
                <ul className="space-y-3">
                  {igdbMatches.map((m) => (
                    <li key={`igdb-${m.externalId}`} className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
                      <p className="text-sm font-semibold text-zinc-100">{m.title}</p>
                      {m.releaseLabel ? (
                        <p className="mt-1 text-xs text-zinc-400">
                          IGDB release: <span className="text-zinc-300">{m.releaseLabel}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-600">No first release date in IGDB for this listing.</p>
                      )}
                      {m.releaseLabel ? (
                        <button
                          type="button"
                          onClick={() => setReleaseLabel(m.releaseLabel ?? '')}
                          className="mt-1 text-xs font-semibold text-violet-300/90 underline-offset-2 hover:underline"
                        >
                          Use IGDB release
                        </button>
                      ) : null}
                      {m.genres.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.genres.map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => addExternalGenres([g])}
                              className="rounded-md border border-violet-500/30 bg-violet-950/40 px-2 py-1 text-xs font-medium text-violet-100 hover:bg-violet-900/60"
                            >
                              + {g}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">No genres on this listing.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => addExternalGenres(m.genres)}
                        className="mt-2 text-xs font-semibold text-violet-300/90 underline-offset-2 hover:underline"
                      >
                        Add all from this title
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            New genre names appear in this form right away; they hit the shared pool in Supabase only when you post the
            review.
          </p>
          <div className="flex flex-wrap gap-2">
            {poolGenres.map((g) => (
              <ChipToggle key={g} label={g} active={selectedGenres.has(g)} onClick={() => toggleGenre(g)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={genreDraft}
              onChange={(e) => setGenreDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addGenreDraft()
                }
              }}
              placeholder="Add new genre…"
              className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={addGenreDraft}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Add
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Tags</h2>
          <p className="text-xs text-zinc-500">
            Same as genres: local list updates immediately; Supabase gets the new tag rows on successful POST only.
          </p>
          <div className="flex flex-wrap gap-2">
            {poolTags.map((t) => (
              <ChipToggle key={t} label={t} active={selectedTags.has(t)} onClick={() => toggleTag(t)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTagDraft()
                }
              }}
              placeholder="Add new tag…"
              className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={addTagDraft}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Add
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Play this if you liked</h2>
          <p className="text-xs text-zinc-500">
            One game per line. Names are matched case-insensitively to reviewed games on the site (
            {reviewedGames.length} right now) to create links.
          </p>
          <textarea
            value={playIfLikedText}
            onChange={(e) => setPlayIfLikedText(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder={'Alien Isolation\nPathologic 2'}
          />
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Pros and cons</h2>
          <p className="text-xs text-zinc-500">One bullet per line.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-300">Pros</label>
              <textarea
                value={prosText}
                onChange={(e) => setProsText(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300">Cons</label>
              <textarea
                value={consText}
                onChange={(e) => setConsText(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Publish password</h2>
          <p className="text-xs text-zinc-500">Same <span className="font-mono">ADD_GAME_PASSWORD</span> for new reviews and edits.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Password"
          />
          <button
            type="button"
            disabled={
              submitBusy ||
              catalogRankPosition == null ||
              (!!loadReviewSlug && (!!editLoadError || editLoading))
            }
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitBusy ? 'Saving…' : loadReviewSlug ? 'Save changes' : 'Publish review'}
          </button>
          {submitStatus ? (
            <p className="text-sm text-zinc-300">
              {submitStatus}{' '}
              {savedSlug ? (
                <Link
                  className="font-semibold text-emerald-300 underline-offset-4 hover:underline"
                  to={`/g/${savedSlug}?mode=${readReviewModePreference()}`}
                >
                  Open review
                </Link>
              ) : null}{' '}
              {savedSlug ? (
                <Link className="ml-2 font-semibold text-zinc-400 underline-offset-4 hover:underline" to="/">
                  Home
                </Link>
              ) : null}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
