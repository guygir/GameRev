import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { MockNav } from '../components/MockNav'
import { statAxes, statAxisTooltips, type GameStats } from '../review/gameStats'
import {
  ACCENT_PRESET_HUES,
  ACCENT_PRESET_LABELS,
  DEFAULT_DARK_REVIEW_ACCENT_HUE,
  reviewDarkGrayscaleCssVars,
} from '../review/reviewDarkAccent'
import { getSupabaseBrowser } from '../lib/supabaseClient'
import { readReviewModePreference } from '../lib/reviewModePreference'
import { parseReleaseYearFromLabel } from '../lib/parseReleaseYearFromLabel'
import { BACKLOGGD_GEMINI_MODEL_SELECT_OPTIONS } from '../lib/geminiBackloggdModels'
import type { CommentRow } from '../types/game'

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

/** Split for multiline editors: keeps blank lines so Enter / new paragraphs work while typing. */
function splitLinesKeepEmpty(text: string): string[] {
  if (!text) return []
  return text.split(/\r?\n/).map((l) => l.trim())
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

type BackloggdSuggestPayload = {
  backloggdGameUrl: string
  backloggdTitle: string
  backloggdSlug: string
  alternateBackloggdGames: { slug: string; title: string; url: string }[]
  reviewSnippets: string[]
  suggestedTags: string[]
  suggestedPlayIfLiked: string[]
  suggestedPros: string[]
  suggestedCons: string[]
  refinedWithCloudLlm: boolean
  llmError?: string
}

/** Steam store review–derived suggestions (bundle or future single-fetch). */
type SteamReviewSuggestState = {
  storeUrl: string
  reviewSnippets: string[]
  suggestedTags: string[]
  suggestedPlayIfLiked: string[]
  suggestedPros: string[]
  suggestedCons: string[]
  refinedWithCloudLlm: boolean
  llmError?: string
  fetchError?: string
}

type EditorLookupBundleJson = {
  query: string
  igdb: { ok: true; matches: IgdbGenreRow[] } | { ok: false; error: string }
  backloggd: { ok: true; data: BackloggdSuggestPayload } | { ok: false; error: string }
  steam:
    | {
        ok: true
        appId: number
        steamName: string
        totalReviews: number
        visibilityScore: number
        storeUrl: string
        alternateHits: { appId: number; name: string }[]
        suggestions: {
          reviewSnippets: string[]
          suggestedTags: string[]
          suggestedPlayIfLiked: string[]
          suggestedPros: string[]
          suggestedCons: string[]
          refinedWithCloudLlm: boolean
          llmError?: string
        } | null
        suggestionsError?: string
      }
    | { ok: false; error: string }
}

type EditorLookupBundleOverrides = {
  steamPreferAppId?: number
  steamPreferSteamName?: string
  backloggdSlug?: string
}

function appendUniqueLines(current: string, lines: string[]): string {
  const exist = new Set(linesToList(current).map((s) => s.toLowerCase()))
  const add: string[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (exist.has(k)) continue
    exist.add(k)
    add.push(t)
  }
  if (!add.length) return current
  return [...linesToList(current), ...add].join('\n')
}

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
  /** null = auto (slug hash); 0–359 = saved chromatic accent when `accentGrayLevel` is null. */
  const [accentHue, setAccentHue] = useState<number | null>(null)
  /** null = not grayscale; 0–100 = saved achromatic accent (neutral grays on the live review). */
  const [accentGrayLevel, setAccentGrayLevel] = useState<number | null>(null)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)
  const [coverAccentBusy, setCoverAccentBusy] = useState(false)
  /** Bias for JPEG sampling only (when not already in grayscale accent mode). */
  const [coverBalanceBias, setCoverBalanceBias] = useState(50)
  const [prosTidyBusy, setProsTidyBusy] = useState(false)
  const [consTidyBusy, setConsTidyBusy] = useState(false)
  const [prosTidyErr, setProsTidyErr] = useState<string | null>(null)
  const [consTidyErr, setConsTidyErr] = useState<string | null>(null)
  const [prosTidyNonAi, setProsTidyNonAi] = useState(false)
  const [consTidyNonAi, setConsTidyNonAi] = useState(false)
  const [hltbMainHours, setHltbMainHours] = useState<number | null>(null)
  const [hltbExtrasHours, setHltbExtrasHours] = useState<number | null>(null)
  const [hltbCompletionistHours, setHltbCompletionistHours] = useState<number | null>(null)

  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set())
  const [genreDraft, setGenreDraft] = useState('')
  const [extGenreQuery, setExtGenreQuery] = useState('')
  const [igdbMatches, setIgdbMatches] = useState<IgdbGenreRow[]>([])
  const [igdbBusy, setIgdbBusy] = useState(false)
  const [igdbErr, setIgdbErr] = useState<string | null>(null)
  const [backloggdBusy, setBackloggdBusy] = useState(false)
  const [backloggdErr, setBackloggdErr] = useState<string | null>(null)
  const [backloggdData, setBackloggdData] = useState<BackloggdSuggestPayload | null>(null)
  /** When Gemini is used (after OpenAI if configured), try this model first — free-tier Flash only. */
  const [cloudLlmGeminiModel, setCloudLlmGeminiModel] = useState('')
  const [summarySuggestBusy, setSummarySuggestBusy] = useState(false)
  const [summarySuggestErr, setSummarySuggestErr] = useState<string | null>(null)
  /** Last successful summary request used heuristic text, not cloud LLM output. */
  const [summaryNotFromCloudAi, setSummaryNotFromCloudAi] = useState(false)
  const [summaryEnglishBusy, setSummaryEnglishBusy] = useState(false)
  const [summaryEnglishErr, setSummaryEnglishErr] = useState<string | null>(null)
  const [outlineFromSummaryBusy, setOutlineFromSummaryBusy] = useState(false)
  const [outlineFromSummaryErr, setOutlineFromSummaryErr] = useState<string | null>(null)
  /** Last successful outline-from-summary used heuristic data, not cloud LLM output. */
  const [outlineNotFromCloudAi, setOutlineNotFromCloudAi] = useState(false)
  const [editorNoteFromSummaryBusy, setEditorNoteFromSummaryBusy] = useState(false)
  const [editorNoteFromSummaryErr, setEditorNoteFromSummaryErr] = useState<string | null>(null)
  const [editorNoteFromSummaryNonAi, setEditorNoteFromSummaryNonAi] = useState(false)
  const [editorNoteCloudTrace, setEditorNoteCloudTrace] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagDraft, setTagDraft] = useState('')

  const [stats, setStats] = useState<GameStats>(() => defaultStats())

  const [playIfLikedText, setPlayIfLikedText] = useState('')
  const [prosText, setProsText] = useState('')
  const [consText, setConsText] = useState('')
  const [summaryText, setSummaryText] = useState('')
  const [editorNoteText, setEditorNoteText] = useState('')

  const [steamAppId, setSteamAppId] = useState<number | null>(null)
  const [steamReviewCount, setSteamReviewCount] = useState<number | null>(null)
  /** 0–1 saved with the review; may differ from `steamSuggestedVisibility` after you tune the slider. */
  const [visibilityScore, setVisibilityScore] = useState<number | null>(null)
  /** Set only after a fresh Steam fetch — server suggestion, not loaded from DB on edit. */
  const [steamSuggestedVisibility, setSteamSuggestedVisibility] = useState<number | null>(null)
  const [steamResolvedName, setSteamResolvedName] = useState<string | null>(null)
  const [steamBusy, setSteamBusy] = useState(false)
  const [steamErr, setSteamErr] = useState<string | null>(null)
  const [steamReviewSuggest, setSteamReviewSuggest] = useState<SteamReviewSuggestState | null>(null)
  /** Other Steam store rows for the last name-based search (GET or bundle). */
  const [steamAlternateHits, setSteamAlternateHits] = useState<{ appId: number; name: string }[]>([])
  const [editorBundleBusy, setEditorBundleBusy] = useState(false)
  const [editorBundleErr, setEditorBundleErr] = useState<string | null>(null)

  const [submitStatus, setSubmitStatus] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editLoadError, setEditLoadError] = useState<string | null>(null)
  const [editComments, setEditComments] = useState<CommentRow[]>([])
  const [editCommentsErr, setEditCommentsErr] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

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
    setAccentGrayLevel(null)
    setCoverBalanceBias(50)
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
    setBackloggdData(null)
    setBackloggdErr(null)
    setSelectedTags(new Set())
    setTagDraft('')
    setStats(defaultStats())
    setPlayIfLikedText('')
    setProsText('')
    setConsText('')
    setSummaryText('')
    setEditorNoteText('')
    setSummaryEnglishErr(null)
    setSummaryEnglishBusy(false)
    setOutlineFromSummaryErr(null)
    setOutlineFromSummaryBusy(false)
    setEditorNoteFromSummaryErr(null)
    setEditorNoteFromSummaryBusy(false)
    setEditorNoteFromSummaryNonAi(false)
    setEditorNoteCloudTrace(null)
    setSteamAppId(null)
    setSteamReviewCount(null)
    setVisibilityScore(null)
    setSteamSuggestedVisibility(null)
    setSteamResolvedName(null)
    setSteamBusy(false)
    setSteamErr(null)
    setSteamReviewSuggest(null)
    setSteamAlternateHits([])
    setEditorBundleBusy(false)
    setEditorBundleErr(null)
    setSubmitStatus(null)
    setSavedSlug(null)
    setEditComments([])
    setEditCommentsErr(null)
    setDeletingCommentId(null)
    catalogDefaultAppendDoneRef.current = true
    setCatalogRankPosition(rankedCatalogGames.length > 0 ? rankedCatalogGames.length + 1 : 1)
  }, [rankedCatalogGames])

  /** Avoid putting `resetNewReviewForm` in effect deps — it changes when `rankedCatalogGames` updates and would re-run edit load after save, wiping success UI. */
  const resetNewReviewFormRef = useRef(resetNewReviewForm)
  resetNewReviewFormRef.current = resetNewReviewForm

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
        resetNewReviewFormRef.current()
      }
      lastLoadedEditSlugRef.current = ''
      setEditLoading(false)
      setEditLoadError(null)
      setEditComments([])
      setEditCommentsErr(null)
      setDeletingCommentId(null)
      return
    }
    let cancelled = false
    setEditLoading(true)
      setEditLoadError(null)
      setSubmitStatus(null)
      setSavedSlug(null)
      setAccentMsg(null)
      setCatalogRankPosition(null)
      setEditComments([])
      setEditCommentsErr(null)
      setDeletingCommentId(null)
    void (async () => {
      type GameEditRow = {
        id: string
        name: string
        subtitle: string
        catalog_rank: number
        release_label: string | null
        accent_hue?: number | null
        accent_preset?: number | null
        accent_gray_level?: number | null
        cover_image_url: string | null
        platforms: string[] | null
        hltb_main_hours: number | null
        hltb_extras_hours: number | null
        hltb_completionist_hours: number | null
        stats: unknown
        pros: string[]
        cons: string[]
        summary: string | null
        editor_note: string | null
        play_if_liked: { name: string; slug?: string | null }[] | null
        game_genres: { genre: string }[] | null
        game_tags: { tag: string }[] | null
        steam_app_id: number | null
        steam_review_count: number | null
        visibility_score: number | null
      }
      const { data, error } = await sb
        .from('games')
        .select(
          `
          id,
          name,
          subtitle,
          catalog_rank,
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
          steam_app_id,
          steam_review_count,
          visibility_score
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
      const { data: commentRows, error: commentsErr } = await sb
        .from('comments')
        .select('id, game_id, body, author_name, created_at')
        .eq('game_id', row.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (commentsErr) {
        setEditComments([])
        setEditCommentsErr(commentsErr.message)
      } else {
        setEditComments((commentRows ?? []) as CommentRow[])
        setEditCommentsErr(null)
      }
      setName(row.name)
      setSubtitle(row.subtitle)
      setCatalogRankPosition(
        typeof row.catalog_rank === 'number' && row.catalog_rank >= 1 ? row.catalog_rank : 1,
      )
      setReleaseLabel(row.release_label?.trim() ?? '')
      setCoverImageUrl(row.cover_image_url)
      let gray: number | null = null
      if (
        typeof row.accent_gray_level === 'number' &&
        row.accent_gray_level >= 0 &&
        row.accent_gray_level <= 100
      ) {
        gray = Math.round(row.accent_gray_level)
      }
      setAccentGrayLevel(gray)
      if (gray != null) {
        setAccentHue(null)
      } else {
        let ah: number | null = null
        if (typeof row.accent_hue === 'number' && row.accent_hue >= 0 && row.accent_hue < 360) {
          ah = Math.round(row.accent_hue)
        } else if (typeof row.accent_preset === 'number' && row.accent_preset >= 0 && row.accent_preset <= 4) {
          ah = ACCENT_PRESET_HUES[row.accent_preset]
        }
        setAccentHue(ah)
      }
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
      setSummaryText(row.summary?.trim() ?? '')
      setEditorNoteText(row.editor_note?.trim() ?? '')
      const pil = Array.isArray(row.play_if_liked) ? row.play_if_liked : []
      setPlayIfLikedText(pil.map((p) => p.name).join('\n'))
      setExtGenreQuery(row.name)
      setHltbQuery(row.name)
      setIgdbMatches([])
      setIgdbErr(null)
      setBackloggdData(null)
      setBackloggdErr(null)
      setSteamReviewSuggest(null)
      setSteamErr(null)
      setSteamSuggestedVisibility(null)
      if (typeof row.steam_app_id === 'number' && row.steam_app_id > 0) {
        setSteamAppId(row.steam_app_id)
        setSteamReviewCount(
          typeof row.steam_review_count === 'number' && row.steam_review_count >= 0
            ? row.steam_review_count
            : 0,
        )
        setVisibilityScore(
          typeof row.visibility_score === 'number' && Number.isFinite(row.visibility_score)
            ? Math.min(1, Math.max(0, row.visibility_score))
            : 0,
        )
        setSteamResolvedName(null)
      } else {
        setSteamAppId(null)
        setSteamReviewCount(null)
        setVisibilityScore(null)
        setSteamResolvedName(null)
      }
      lastLoadedEditSlugRef.current = loadReviewSlug
      setEditLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [sb, loadReviewSlug])

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
    if (rankedCatalogGames.length === 0) {
      return [{ value: 1, label: '1 — First review on the site' }]
    }

    if (loadReviewSlug) {
      const others = rankedCatalogGames.filter((g) => g.slug !== loadReviewSlug)
      const n = rankedCatalogGames.length
      const currentSlot = rankedCatalogGames.findIndex((g) => g.slug === loadReviewSlug) + 1
      if (n === 1) {
        return [{ value: 1, label: '1 — Only review (rank 1)' }]
      }
      const out: { value: number; label: string }[] = []
      out.push({
        value: 1,
        label: `1 — First (before “${others[0]?.name ?? '—'}”)${currentSlot === 1 ? ' — current' : ''}`,
      })
      for (let pos = 2; pos <= n; pos++) {
        const after = others[pos - 2]
        out.push({
          value: pos,
          label: `${pos} — After “${after?.name ?? '—'}”${pos === currentSlot ? ' — current' : ''}`,
        })
      }
      return out
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

  const runBackloggdSuggestions = useCallback(
    async (backloggdSlug?: string) => {
      const q = name.trim()
      if (q.length < 2) {
        setBackloggdErr('Set the game name first (at least 2 characters).')
        return
      }
      setBackloggdBusy(true)
      setBackloggdErr(null)
      try {
        const res = await fetch('/api/backloggd-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
            ...(backloggdSlug ? { backloggdSlug } : {}),
          }),
        })
        const json = (await res.json()) as BackloggdSuggestPayload & { error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Backloggd request failed')
        setBackloggdData({
          ...json,
          alternateBackloggdGames: Array.isArray(json.alternateBackloggdGames)
            ? json.alternateBackloggdGames
            : [],
        })
      } catch (e) {
        setBackloggdData(null)
        setBackloggdErr(e instanceof Error ? e.message : 'Backloggd request failed')
      } finally {
        setBackloggdBusy(false)
      }
    },
    [name, cloudLlmGeminiModel],
  )

  const runReviewSummarySuggest = useCallback(async () => {
    const gameName = name.trim()
    if (gameName.length < 2) {
      setSummarySuggestErr('Set the game name first (at least 2 characters).')
      return
    }
    const pros = prosText.trim()
    const cons = consText.trim()
    if (!pros && !cons) {
      setSummarySuggestErr('Add some Pros or Cons text first.')
      return
    }
    setSummarySuggestBusy(true)
    setSummarySuggestErr(null)
    setSummaryEnglishErr(null)
    setSummaryNotFromCloudAi(false)
    try {
      const res = await fetch('/api/review-summary-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName,
          pros,
          cons,
          ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
        }),
      })
      const json = (await res.json()) as { summary?: string; usedHeuristicFallback?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Summary suggestion failed')
      const s = typeof json.summary === 'string' ? json.summary.trim() : ''
      if (!s) throw new Error('Empty summary from server')
      setSummaryText(s)
      setSummaryNotFromCloudAi(json.usedHeuristicFallback === true)
    } catch (e) {
      setSummarySuggestErr(e instanceof Error ? e.message : 'Summary suggestion failed')
    } finally {
      setSummarySuggestBusy(false)
    }
  }, [name, prosText, consText, cloudLlmGeminiModel])

  const runAdjustSummaryEnglish = useCallback(
    async (direction: 'up' | 'down') => {
      const trimmed = summaryText.trim()
      if (trimmed.length < 30) {
        setSummaryEnglishErr('Add more summary text first (at least ~30 characters).')
        return
      }
      setSummaryEnglishBusy(true)
      setSummaryEnglishErr(null)
      setSummarySuggestErr(null)
      try {
        const res = await fetch('/api/review-summary-english-level', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction,
            paragraph: trimmed,
            ...(name.trim().length >= 2 ? { gameName: name.trim() } : {}),
            ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
          }),
        })
        const json = (await res.json()) as { summary?: string; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'English level adjustment failed')
        const s = typeof json.summary === 'string' ? json.summary.trim() : ''
        if (!s) throw new Error('Empty summary from server')
        setSummaryText(s)
        setSummaryNotFromCloudAi(false)
      } catch (e) {
        setSummaryEnglishErr(e instanceof Error ? e.message : 'English level adjustment failed')
      } finally {
        setSummaryEnglishBusy(false)
      }
    },
    [summaryText, name, cloudLlmGeminiModel],
  )

  const runEditorNoteFromSummary = useCallback(async () => {
    const summary = summaryText.trim()
    if (summary.length < 20) {
      setEditorNoteFromSummaryErr('Write more summary text first (at least ~20 characters).')
      return
    }
    setEditorNoteFromSummaryBusy(true)
    setEditorNoteFromSummaryErr(null)
    setEditorNoteFromSummaryNonAi(false)
    setEditorNoteCloudTrace(null)
    try {
      const res = await fetch('/api/editor-note-from-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: name.trim(),
          summary,
          ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
        }),
      })
      const json = (await res.json()) as {
        editorNote?: string
        usedHeuristicFallback?: boolean
        cloudTrace?: string
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? 'Editor note generation failed')
      const line = typeof json.editorNote === 'string' ? json.editorNote.trim() : ''
      if (!line) throw new Error('Empty editor note from server')
      setEditorNoteText(line)
      setEditorNoteFromSummaryNonAi(json.usedHeuristicFallback === true)
      setEditorNoteCloudTrace(
        typeof json.cloudTrace === 'string' && json.cloudTrace.trim() ? json.cloudTrace.trim() : null,
      )
    } catch (e) {
      setEditorNoteFromSummaryErr(e instanceof Error ? e.message : 'Editor note generation failed')
    } finally {
      setEditorNoteFromSummaryBusy(false)
    }
  }, [summaryText, name, cloudLlmGeminiModel])

  const runOutlineFromSummary = useCallback(async () => {
    const gameName = name.trim()
    if (gameName.length < 2) {
      setOutlineFromSummaryErr('Set the game name first (at least 2 characters).')
      return
    }
    const summary = summaryText.trim()
    if (summary.length < 40) {
      setOutlineFromSummaryErr('Write a longer summary first (at least a few sentences).')
      return
    }
    setOutlineFromSummaryBusy(true)
    setOutlineFromSummaryErr(null)
    setSummaryEnglishErr(null)
    setOutlineNotFromCloudAi(false)
    try {
      const res = await fetch('/api/review-outline-from-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName,
          summary,
          ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
        }),
      })
      const json = (await res.json()) as {
        pros?: unknown
        cons?: unknown
        playIfLiked?: unknown
        stats?: unknown
        usedHeuristicFallback?: boolean
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? 'Outline inference failed')
      const pros = Array.isArray(json.pros) ? json.pros.filter((x): x is string => typeof x === 'string') : []
      const cons = Array.isArray(json.cons) ? json.cons.filter((x): x is string => typeof x === 'string') : []
      const pil = Array.isArray(json.playIfLiked)
        ? json.playIfLiked.filter((x): x is string => typeof x === 'string')
        : []
      if (!pros.length && !cons.length && !pil.length) {
        throw new Error('Model returned no pros, cons, or play-if-liked lines.')
      }
      setProsText(
        pros
          .map((s) => s.trim())
          .filter(Boolean)
          .join('\n'),
      )
      setConsText(
        cons
          .map((s) => s.trim())
          .filter(Boolean)
          .join('\n'),
      )
      setPlayIfLikedText(
        pil
          .map((s) => s.trim())
          .filter(Boolean)
          .join('\n'),
      )
      if (json.stats && typeof json.stats === 'object' && json.stats !== null) {
        if (isGameStats(json.stats)) {
          setStats(json.stats)
        } else {
          setStats((prev) => {
            const next = { ...prev }
            const box = json.stats as Record<string, unknown>
            for (const axis of statAxes) {
              const v = box[axis]
              if (typeof v === 'number' && Number.isFinite(v)) {
                next[axis] = Math.min(100, Math.max(0, Math.round(v)))
              }
            }
            return next
          })
        }
      }
      setOutlineNotFromCloudAi(json.usedHeuristicFallback === true)
    } catch (e) {
      setOutlineFromSummaryErr(e instanceof Error ? e.message : 'Outline inference failed')
    } finally {
      setOutlineFromSummaryBusy(false)
    }
  }, [name, summaryText, cloudLlmGeminiModel])

  const addSuggestedTag = useCallback((tag: string) => {
    const t = tag.trim()
    if (!t) return
    setPoolTags((prev) => (prev.includes(t) ? prev : [...prev, t].sort((a, b) => a.localeCompare(b))))
    setSelectedTags((prev) => new Set(prev).add(t))
  }, [])

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
      const monoBias = accentGrayLevel != null ? accentGrayLevel : coverBalanceBias
      const res = await fetch('/api/sample-cover-accent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: coverImageUrl, monoBias }),
      })
      const rawText = await res.text()
      let json: { hue?: number; grayLevel?: number; source?: string; error?: string } = {}
      try {
        json = JSON.parse(rawText) as { hue?: number; grayLevel?: number; source?: string; error?: string }
      } catch {
        /* e.g. HTML if /api was rewritten to index.html — fix vercel.json */
      }
      if (res.ok && json.source === 'saturated' && typeof json.hue === 'number' && Number.isFinite(json.hue)) {
        let h = Math.round(json.hue) % 360
        if (h < 0) h += 360
        setAccentHue(h)
        setAccentGrayLevel(null)
        setAccentMsg(null)
        return
      }
      if (res.ok && json.source === 'mono' && typeof json.grayLevel === 'number' && Number.isFinite(json.grayLevel)) {
        const gl = Math.min(100, Math.max(0, Math.round(json.grayLevel)))
        setAccentHue(null)
        setAccentGrayLevel(gl)
        setAccentMsg(
          'This cover has almost no saturated color — saved accent is grayscale (neutral grays on the review). Use the balance slider and click again to nudge, then save.',
        )
        return
      }
      setAccentMsg(json.error ?? 'Could not sample this cover. Set a hue manually.')
    } catch {
      setAccentMsg('Could not sample this cover. Set a hue manually.')
    } finally {
      setCoverAccentBusy(false)
    }
  }, [coverImageUrl, coverBalanceBias, accentGrayLevel])

  const runProsTidy = useCallback(async () => {
    const raw = prosText.trim()
    if (!raw) {
      setProsTidyErr('Add at least one pro line first.')
      return
    }
    setProsTidyBusy(true)
    setProsTidyErr(null)
    setProsTidyNonAi(false)
    try {
      const res = await fetch('/api/review-pros-cons-tidy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: name.trim(),
          side: 'pros',
          lines: prosText,
          ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
        }),
      })
      const json = (await res.json()) as { lines?: string; usedHeuristicFallback?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Tidy failed')
      const next = typeof json.lines === 'string' ? json.lines.trimEnd() : ''
      if (!next) throw new Error('Empty result from server')
      setProsText(next)
      setProsTidyNonAi(json.usedHeuristicFallback === true)
    } catch (e) {
      setProsTidyErr(e instanceof Error ? e.message : 'Tidy failed')
    } finally {
      setProsTidyBusy(false)
    }
  }, [name, prosText, cloudLlmGeminiModel])

  const runConsTidy = useCallback(async () => {
    const raw = consText.trim()
    if (!raw) {
      setConsTidyErr('Add at least one con line first.')
      return
    }
    setConsTidyBusy(true)
    setConsTidyErr(null)
    setConsTidyNonAi(false)
    try {
      const res = await fetch('/api/review-pros-cons-tidy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: name.trim(),
          side: 'cons',
          lines: consText,
          ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
        }),
      })
      const json = (await res.json()) as { lines?: string; usedHeuristicFallback?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Tidy failed')
      const next = typeof json.lines === 'string' ? json.lines.trimEnd() : ''
      if (!next) throw new Error('Empty result from server')
      setConsText(next)
      setConsTidyNonAi(json.usedHeuristicFallback === true)
    } catch (e) {
      setConsTidyErr(e instanceof Error ? e.message : 'Tidy failed')
    } finally {
      setConsTidyBusy(false)
    }
  }, [name, consText, cloudLlmGeminiModel])

  const clearSteamSnapshot = useCallback(() => {
    setSteamAppId(null)
    setSteamReviewCount(null)
    setVisibilityScore(null)
    setSteamSuggestedVisibility(null)
    setSteamResolvedName(null)
    setSteamErr(null)
    setSteamReviewSuggest(null)
    setSteamAlternateHits([])
  }, [])

  const fetchSteamSnapshot = useCallback(
    async (opts?: { preferAppId?: number; preferSteamName?: string }) => {
      const q = name.trim()
      if (q.length < 2) {
        setSteamErr('Enter at least two characters in the game name (used as the Steam search query).')
        return
      }
      setSteamErr(null)
      setSteamReviewSuggest(null)
      setSteamBusy(true)
      try {
        const ry = parseReleaseYearFromLabel(releaseLabel.trim() || null)
        const sp = new URLSearchParams({ q })
        if (ry != null) sp.set('releaseYear', String(ry))
        if (opts?.preferAppId != null && opts.preferAppId > 0) {
          sp.set('appId', String(opts.preferAppId))
          if (opts.preferSteamName?.trim()) sp.set('steamName', opts.preferSteamName.trim())
        }
        const res = await fetch(`/api/steam-visibility?${sp}`)
        const json = (await res.json()) as {
          appId?: number
          steamName?: string
          totalReviews?: number
          visibilityScore?: number
          alternateHits?: { appId: number; name: string }[]
          error?: string
        }
        if (!res.ok) throw new Error(json.error ?? 'Steam lookup failed')
        if (
          typeof json.appId !== 'number' ||
          typeof json.totalReviews !== 'number' ||
          typeof json.visibilityScore !== 'number'
        ) {
          throw new Error('Unexpected Steam response.')
        }
        setSteamAppId(json.appId)
        setSteamReviewCount(json.totalReviews)
        const suggested = json.visibilityScore
        setSteamSuggestedVisibility(suggested)
        setVisibilityScore(suggested)
        setSteamResolvedName(typeof json.steamName === 'string' ? json.steamName : null)
        setSteamAlternateHits(Array.isArray(json.alternateHits) ? json.alternateHits : [])
      } catch (e) {
        clearSteamSnapshot()
        setSteamErr(e instanceof Error ? e.message : 'Steam lookup failed')
      } finally {
        setSteamBusy(false)
      }
    },
    [clearSteamSnapshot, name, releaseLabel],
  )

  const runEditorLookupBundle = useCallback(async (overrides?: EditorLookupBundleOverrides) => {
    const q = extSearchQ().trim()
    if (q.length < 2) {
      setEditorBundleErr('Need at least 2 characters (game name or IGDB override field).')
      return
    }
    setEditorBundleBusy(true)
    setEditorBundleErr(null)
    setIgdbErr(null)
    setBackloggdErr(null)
    setSteamErr(null)
    try {
      const res = await fetch('/api/editor-lookup-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          releaseLabel: releaseLabel.trim() || undefined,
          ...(cloudLlmGeminiModel ? { geminiModel: cloudLlmGeminiModel } : {}),
          ...(overrides?.steamPreferAppId != null && overrides.steamPreferAppId > 0
            ? {
                steamPreferAppId: overrides.steamPreferAppId,
                ...(overrides.steamPreferSteamName?.trim()
                  ? { steamPreferSteamName: overrides.steamPreferSteamName.trim() }
                  : {}),
              }
            : {}),
          ...(overrides?.backloggdSlug?.trim() ? { backloggdSlug: overrides.backloggdSlug.trim() } : {}),
        }),
      })
      const json = (await res.json()) as EditorLookupBundleJson & { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Lookup bundle failed')

      if (json.igdb.ok) {
        setIgdbMatches(
          json.igdb.matches.map((m) => ({
            title: m.title,
            externalId: m.externalId,
            genres: Array.isArray(m.genres) ? m.genres : [],
            releaseLabel: m.releaseLabel ?? null,
          })),
        )
      } else {
        setIgdbMatches([])
        setIgdbErr(json.igdb.error)
      }

      if (json.backloggd.ok) {
        const d = json.backloggd.data
        setBackloggdData({
          ...d,
          alternateBackloggdGames: Array.isArray(d.alternateBackloggdGames) ? d.alternateBackloggdGames : [],
        })
      } else {
        setBackloggdData(null)
        setBackloggdErr(json.backloggd.error)
      }

      if (json.steam.ok) {
        setSteamAppId(json.steam.appId)
        setSteamReviewCount(json.steam.totalReviews)
        setSteamSuggestedVisibility(json.steam.visibilityScore)
        setVisibilityScore(json.steam.visibilityScore)
        setSteamResolvedName(json.steam.steamName)
        setSteamAlternateHits(
          Array.isArray(json.steam.alternateHits) ? json.steam.alternateHits : [],
        )
        if (json.steam.suggestions) {
          setSteamReviewSuggest({
            storeUrl: json.steam.storeUrl,
            ...json.steam.suggestions,
          })
        } else if (json.steam.suggestionsError) {
          setSteamReviewSuggest({
            storeUrl: json.steam.storeUrl,
            reviewSnippets: [],
            suggestedTags: [],
            suggestedPlayIfLiked: [],
            suggestedPros: [],
            suggestedCons: [],
            refinedWithCloudLlm: false,
            fetchError: json.steam.suggestionsError,
          })
        } else {
          setSteamReviewSuggest(null)
        }
      } else {
        clearSteamSnapshot()
        setSteamErr(json.steam.error)
      }

      setReleaseLabel((prev) => {
        if (prev.trim()) return prev
        const first = json.igdb.ok ? json.igdb.matches[0] : undefined
        const rl = first?.releaseLabel?.trim()
        return rl ?? prev
      })
    } catch (e) {
      setEditorBundleErr(e instanceof Error ? e.message : 'Lookup bundle failed')
    } finally {
      setEditorBundleBusy(false)
    }
  }, [extSearchQ, releaseLabel, cloudLlmGeminiModel, clearSteamSnapshot])

  const submit = useCallback(async () => {
    setSubmitStatus(null)
    setSavedSlug(null)
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
      const hasSteamForCreate =
        steamAppId != null && steamReviewCount != null && visibilityScore != null
      const body = {
        password: password,
        name: name.trim(),
        subtitle: subtitle.trim(),
        releaseLabel: releaseLabel.trim() || null,
        coverImageUrl,
        platforms: linesToList(reviewPlatforms.join('\n')).slice(0, 24),
        hltbMainHours,
        hltbExtrasHours,
        hltbCompletionistHours,
        stats,
        genres: [...selectedGenres],
        tags: [...selectedTags],
        pros: linesToList(prosText),
        cons: linesToList(consText),
        summary: summaryText.trim() || null,
        editorNote: editorNoteText.trim() || null,
        playIfLiked,
        accentHue: accentGrayLevel != null ? null : accentHue,
        accentGrayLevel: accentGrayLevel != null ? accentGrayLevel : null,
        catalogRank: catalogRankPosition,
        ...(loadReviewSlug ? { slug: loadReviewSlug } : {}),
        ...(loadReviewSlug || hasSteamForCreate
          ? { steamAppId, steamReviewCount, visibilityScore }
          : {}),
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
          /platforms|release_label|accent_preset|accent_hue|accent_gray_level|catalog_rank|schema cache/i.test(
            json.error ?? '',
          )
            ? ' Run pending Supabase migrations (see supabase/migrations), especially `20260413000000_ensure_games_review_columns.sql`, `20260414120000_accent_preset.sql`, `20260415120000_accent_hue.sql`, `20260419120000_accent_gray_level.sql`, `20260416100000_catalog_rank.sql`, `20260417120000_review_summary.sql`, and `20260420120000_editor_note.sql`.'
            : ''
        throw new Error((json.error ?? 'Save failed') + hint)
      }
      if (!json.slug) throw new Error('Missing slug in response')
      setSavedSlug(json.slug)
      setAccentMsg(null)
      setSubmitStatus(
        loadReviewSlug
          ? 'Changes saved — your review is updated and live on the site.'
          : "Review published — it's live on the site.",
      )
      if (sb) {
        const refresh = await sb.from('games').select('name, slug, catalog_rank').order('name')
        const gameRows = (refresh.data ?? []) as CatalogRankedGame[]
        setReviewedGames(gameRows.map(({ name, slug }) => ({ name, slug })))
        setRankedCatalogGames([...gameRows].sort((a, b) => a.catalog_rank - b.catalog_rank))
      }
    } catch (e) {
      setSavedSlug(null)
      setSubmitStatus(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitBusy(false)
    }
  }, [
    accentHue,
    accentGrayLevel,
    catalogRankPosition,
    consText,
    editorNoteText,
    summaryText,
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
    steamAppId,
    steamReviewCount,
    visibilityScore,
  ])

  const deleteEditComment = useCallback(
    async (commentId: string) => {
      if (!loadReviewSlug) return
      if (!password.trim()) {
        setEditCommentsErr('Enter the publish password in the section below, then delete again.')
        return
      }
      if (!window.confirm('Remove this reader comment from the database? This cannot be undone.')) {
        return
      }
      setDeletingCommentId(commentId)
      setEditCommentsErr(null)
      try {
        const res = await fetch('/api/delete-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password,
            commentId,
            slug: loadReviewSlug,
          }),
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
        setEditComments((prev) => prev.filter((c) => c.id !== commentId))
      } catch (e) {
        setEditCommentsErr(e instanceof Error ? e.message : 'Delete failed')
      } finally {
        setDeletingCommentId(null)
      }
    },
    [loadReviewSlug, password],
  )

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
          <p className="text-[11px] leading-relaxed text-zinc-600">
            {loadReviewSlug
              ? 'Click another row to move this review to that slot (same as choosing the matching number above).'
              : 'Click a row to set your new review to that rank (existing games at that rank and below shift down).'}
          </p>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
            {rankedCatalogGames.length === 0 ? (
              <p className="text-sm text-zinc-500">No published reviews yet—this one will be rank 1.</p>
            ) : (
              <ol className="space-y-2 text-sm text-zinc-200">
                {rankedCatalogGames.map((g) => {
                  const disabledRow =
                    catalogRankPosition == null || (!!loadReviewSlug && (editLoading || !!editLoadError))
                  const isSelf = !!loadReviewSlug && g.slug === loadReviewSlug
                  const canPickSlot = !disabledRow && (!loadReviewSlug || !isSelf)
                  return (
                    <li key={g.slug}>
                      <button
                        type="button"
                        disabled={!canPickSlot}
                        title={
                          isSelf && loadReviewSlug
                            ? 'This review’s current slot'
                            : canPickSlot
                              ? `Set catalog position to rank ${g.catalog_rank}`
                              : undefined
                        }
                        onClick={() => {
                          if (!canPickSlot) return
                          setCatalogRankPosition(g.catalog_rank)
                        }}
                        className={clsx(
                          'flex w-full gap-2 rounded-md px-1 py-1 text-left transition',
                          canPickSlot && 'cursor-pointer hover:bg-zinc-800/90',
                          !canPickSlot && 'cursor-default opacity-60',
                          isSelf && 'ring-1 ring-emerald-500/40',
                        )}
                      >
                        <span className="w-8 shrink-0 font-mono text-zinc-500 tabular-nums">{g.catalog_rank}.</span>
                        <span className={isSelf ? 'font-semibold text-emerald-200' : undefined}>{g.name}</span>
                      </button>
                    </li>
                  )
                })}
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
          <div className="mt-4 rounded-lg border border-teal-900/50 bg-teal-950/25 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-400/90">One-click lookups</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Runs <strong className="text-zinc-400">IGDB</strong> genre search,{' '}
              <strong className="text-zinc-400">Backloggd</strong> suggestions, and{' '}
              <strong className="text-zinc-400">Steam</strong> popularity in one request. Steam also pulls recent English
              store reviews for tags / play-if-liked / pros / cons. The server tries cloud LLM refinement first when keys
              are configured; if that fails, you still get heuristics and a red notice in each section. Query is the game
              name above, or the IGDB override field if you filled it in.
            </p>
            <button
              type="button"
              disabled={
                editorBundleBusy || (!!loadReviewSlug && (editLoading || !!editLoadError))
              }
              onClick={() => void runEditorLookupBundle()}
              className="mt-3 rounded-lg bg-teal-700/90 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {editorBundleBusy ? 'Running IGDB + Backloggd + Steam…' : 'Fetch IGDB + Backloggd + Steam'}
            </button>
            {editorBundleErr ? <p className="mt-2 text-xs text-rose-300">{editorBundleErr}</p> : null}
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
              You can still run each source separately; partial failures show in each section (bundle does not stop the
              others).
            </p>
          </div>
          <div className="mt-4 rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Backloggd community</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              The server calls Backloggd the same way as a browser: search{' '}
              <span className="font-mono text-zinc-400">/search/games/&lt;name&gt;</span>, takes the{' '}
              <strong className="text-zinc-400">first hit</strong>, loads its page for genres, then pulls{' '}
              <strong className="text-zinc-400">recent written reviews</strong> (not per-review comment threads). Tags use
              genres + repeated words; play-if-liked / pros / cons are refined with cloud LLM when the server has keys,
              otherwise heuristics only (shown in red when not from AI).
            </p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              OpenAI / Gemini calls use keys on the server. OpenAI is pay-as-you-go; Gemini often has a free quota — see{' '}
              <a className="text-amber-300/90 underline-offset-2 hover:underline" href="https://ai.google.dev/pricing" target="_blank" rel="noreferrer">
                Gemini pricing
              </a>
              .
            </p>
            <label className="mt-3 block text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">
                Preferred Gemini model (Backloggd, bundle Steam reviews, summary & outline-from-summary below)
              </span>
              <select
                value={cloudLlmGeminiModel}
                onChange={(e) => setCloudLlmGeminiModel(e.target.value)}
                className="mt-1 block w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none ring-emerald-500/30 focus:ring-2"
              >
                {BACKLOGGD_GEMINI_MODEL_SELECT_OPTIONS.map((o) => (
                  <option key={o.value || 'auto'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
                Only free-tier Flash / Flash-Lite IDs. OpenAI is tried first when configured; this order applies when the
                request uses Gemini. See{' '}
                <a
                  className="text-amber-300/90 underline-offset-2 hover:underline"
                  href="https://ai.google.dev/pricing"
                  target="_blank"
                  rel="noreferrer"
                >
                  pricing
                </a>
                .
              </span>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={backloggdBusy || editorBundleBusy}
                onClick={() => void runBackloggdSuggestions()}
                className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-amber-500/50 hover:bg-zinc-800 disabled:opacity-50"
              >
                {backloggdBusy ? 'Fetching Backloggd…' : 'Suggest from Backloggd only'}
              </button>
              <a
                className="text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                href={`https://backloggd.com/search/games/${encodeURIComponent(name.trim())}`}
                target="_blank"
                rel="noreferrer"
              >
                Open search in new tab
              </a>
            </div>
            {backloggdErr ? <p className="mt-2 text-xs text-rose-300">{backloggdErr}</p> : null}
            {backloggdData &&
            !backloggdData.refinedWithCloudLlm &&
            (backloggdData.llmError ||
              backloggdData.reviewSnippets.length > 0 ||
              backloggdData.suggestedTags.length > 0 ||
              backloggdData.suggestedPlayIfLiked.length > 0 ||
              backloggdData.suggestedPros.length > 0 ||
              backloggdData.suggestedCons.length > 0) ? (
              <p className="mt-2 rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
                Backloggd suggestions were not produced by cloud AI (heuristics or fetch only).
                {backloggdData.llmError ? ` ${backloggdData.llmError}` : ''}
              </p>
            ) : null}
            {backloggdData ? (
              <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
                <p className="text-sm text-zinc-200">
                  Matched{' '}
                  <a
                    href={backloggdData.backloggdGameUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-amber-200/95 underline-offset-2 hover:underline"
                  >
                    {backloggdData.backloggdTitle}
                  </a>{' '}
                  <span className="font-mono text-xs text-zinc-500">({backloggdData.backloggdSlug})</span>
                </p>
                {backloggdData.alternateBackloggdGames?.length ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Other Backloggd matches (first search page)
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                      The first result is used by default. Switching only refetches Backloggd (Steam is unchanged).
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {backloggdData.alternateBackloggdGames.map((g) => (
                        <li key={g.slug}>
                          <button
                            type="button"
                            disabled={backloggdBusy || editorBundleBusy}
                            onClick={() => void runBackloggdSuggestions(g.slug)}
                            className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:border-amber-500/50 hover:bg-zinc-800 disabled:opacity-50"
                          >
                            <span className="font-medium text-amber-200/90">{g.title}</span>
                            <span className="ml-2 font-mono text-zinc-500">{g.slug}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {backloggdData.reviewSnippets.length ? (
                  <details className="text-xs text-zinc-400">
                    <summary className="cursor-pointer font-medium text-zinc-300">
                      Review excerpts used ({backloggdData.reviewSnippets.length})
                    </summary>
                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/80 p-2 text-zinc-400">
                      {backloggdData.reviewSnippets.map((s, i) => (
                        <li key={i} className="leading-relaxed">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {backloggdData.suggestedTags.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Suggested tags</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {backloggdData.suggestedTags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200">
                          {t}
                          <button
                            type="button"
                            onClick={() => addSuggestedTag(t)}
                            className="rounded bg-amber-600/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 hover:bg-amber-500"
                          >
                            Add
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {backloggdData.suggestedPlayIfLiked.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Play this if you liked</p>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                      {backloggdData.suggestedPlayIfLiked.map((line) => (
                        <li key={line} className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0">{line}</span>
                          <button
                            type="button"
                            onClick={() => setPlayIfLikedText((prev) => appendUniqueLines(prev, [line]))}
                            className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
                          >
                            Add line
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() =>
                        setPlayIfLikedText((prev) => appendUniqueLines(prev, backloggdData.suggestedPlayIfLiked))
                      }
                      className="mt-2 text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                    >
                      Add all lines
                    </button>
                  </div>
                ) : null}
                {backloggdData.suggestedPros.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Suggested pros</p>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                      {backloggdData.suggestedPros.map((line) => (
                        <li key={line} className="flex flex-wrap items-start gap-2">
                          <span className="min-w-0 flex-1 leading-snug">{line}</span>
                          <button
                            type="button"
                            onClick={() => setProsText((prev) => appendUniqueLines(prev, [line]))}
                            className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
                          >
                            Append
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setProsText((prev) => appendUniqueLines(prev, backloggdData.suggestedPros))}
                      className="mt-2 text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                    >
                      Append all pros
                    </button>
                  </div>
                ) : null}
                {backloggdData.suggestedCons.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Suggested cons</p>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                      {backloggdData.suggestedCons.map((line) => (
                        <li key={line} className="flex flex-wrap items-start gap-2">
                          <span className="min-w-0 flex-1 leading-snug">{line}</span>
                          <button
                            type="button"
                            onClick={() => setConsText((prev) => appendUniqueLines(prev, [line]))}
                            className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
                          >
                            Append
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setConsText((prev) => appendUniqueLines(prev, backloggdData.suggestedCons))}
                      className="mt-2 text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                    >
                      Append all cons
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
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
              Shown in dark review mode. <span className="text-zinc-400">Auto</span> picks a stable hue from the slug.{' '}
              <span className="text-zinc-400">Color</span> saves a chromatic hue (0–359°).{' '}
              <span className="text-zinc-400">Grayscale</span> saves a neutral accent (no color — only light/dark gray
              tones), ideal for B&amp;W cover art.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="accentHueMode"
                  className="border-zinc-600 text-emerald-500 focus:ring-emerald-500/40"
                  checked={accentHue === null && accentGrayLevel === null}
                  onChange={() => {
                    setAccentHue(null)
                    setAccentGrayLevel(null)
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
                  checked={accentHue !== null && accentGrayLevel === null}
                  onChange={() => {
                    setAccentGrayLevel(null)
                    setAccentHue((h) => (h == null ? DEFAULT_DARK_REVIEW_ACCENT_HUE : h))
                    setAccentMsg(null)
                  }}
                />
                Color (hue)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="accentHueMode"
                  className="border-zinc-600 text-emerald-500 focus:ring-emerald-500/40"
                  checked={accentGrayLevel !== null}
                  onChange={() => {
                    setAccentHue(null)
                    setAccentGrayLevel((g) => (g == null ? 50 : g))
                    setAccentMsg(null)
                  }}
                />
                Grayscale
              </label>
            </div>
            {accentHue !== null && accentGrayLevel === null ? (
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
            {accentGrayLevel !== null ? (
              <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-3">
                <label className="block text-xs font-medium text-zinc-400" htmlFor="accent-gray-level">
                  Light ↔ dark (grayscale accent)
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                  0 = darker neutrals, 100 = lighter neutrals on the public review (still grayscale — no chromatic hue).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dark</span>
                  <input
                    id="accent-gray-level"
                    type="range"
                    min={0}
                    max={100}
                    value={accentGrayLevel}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!Number.isFinite(n)) return
                      setAccentGrayLevel(Math.min(100, Math.max(0, Math.round(n))))
                      setAccentMsg(null)
                    }}
                    className="h-2 min-w-[min(100%,14rem)] flex-1 cursor-pointer accent-zinc-400"
                  />
                  <span className="w-10 shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Light
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">{accentGrayLevel}</span>
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
                HowLongToBeat JPEG: <span className="text-zinc-400">color</span> accent when possible; otherwise{' '}
                <span className="text-zinc-400">grayscale</span> accent level from the art (saved as Grayscale).
              </span>
            </div>
            {looksLikeHttpImageUrl(coverImageUrl) && coverImageUrl && accentGrayLevel === null ? (
              <div className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-3">
                <label className="block text-xs font-medium text-zinc-400" htmlFor="cover-balance-bias">
                  Sampling bias (before you choose Grayscale)
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                  Used only while accent is Auto or Color. Nudges the B&amp;W cover read; switch to Grayscale to use the
                  same control for the saved review.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dark</span>
                  <input
                    id="cover-balance-bias"
                    type="range"
                    min={0}
                    max={100}
                    value={coverBalanceBias}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!Number.isFinite(n)) return
                      setCoverBalanceBias(Math.min(100, Math.max(0, Math.round(n))))
                    }}
                    className="h-2 min-w-[min(100%,14rem)] flex-1 cursor-pointer accent-zinc-400"
                  />
                  <span className="w-10 shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Light
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">{coverBalanceBias}</span>
                </div>
              </div>
            ) : null}
            {accentMsg ? <p className="mt-2 text-xs text-amber-200/90">{accentMsg}</p> : null}
            {accentGrayLevel !== null ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-3 py-2.5">
                <div
                  className="h-11 w-11 shrink-0 rounded-lg ring-2 ring-white/10"
                  style={reviewDarkGrayscaleCssVars(accentGrayLevel)}
                  aria-hidden
                >
                  <div className="h-full w-full rounded-md bg-[color:var(--review-accent)] opacity-90" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">
                    Saved accent preview
                    <span className="ml-2 font-normal text-zinc-500">grayscale</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    <span className="text-zinc-300">level {accentGrayLevel}</span>
                    <span className="text-zinc-600"> — </span>
                    <span className="text-zinc-500">neutral grays on /g/…</span>
                  </p>
                </div>
              </div>
            ) : accentHue !== null ? (
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
                    <span className="ml-2 font-normal text-zinc-500">color</span>
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
            onChange={(e) => setReviewPlatforms(splitLinesKeepEmpty(e.target.value).slice(0, 40))}
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

          <div className="mt-6 rounded-xl border border-zinc-700/80 bg-zinc-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Steam footprint (optional)</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Resolves the Steam store title from your game name (like IGDB search), snapshots review totals, and
              suggests a needle % from review volume + release year. The one-click bundle above also pulls recent
              English store reviews here for optional tags / pros / cons (same pipeline as Backloggd heuristics + Cloud
              AI). Tune the needle before save; nothing auto-refreshes after publish.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  steamBusy || editorBundleBusy || (!!loadReviewSlug && (editLoading || !!editLoadError))
                }
                onClick={() => void fetchSteamSnapshot()}
                className="rounded-lg bg-sky-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {steamBusy ? 'Querying Steam…' : 'Fetch Steam popularity only'}
              </button>
              {steamAppId != null || steamReviewCount != null || visibilityScore != null ? (
                <button
                  type="button"
                  disabled={steamBusy}
                  onClick={clearSteamSnapshot}
                  className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Clear snapshot
                </button>
              ) : null}
            </div>
            {steamErr ? <p className="mt-2 text-xs text-rose-300">{steamErr}</p> : null}
            {steamAppId != null && visibilityScore != null && steamReviewCount != null ? (
              <div className="mt-4 space-y-3 text-xs text-zinc-400">
                <p>
                  Matched <span className="font-medium text-zinc-200">{steamResolvedName ?? '—'}</span>
                  {' · '}
                  app <span className="font-mono text-zinc-300">{steamAppId}</span>
                  {' · '}
                  {steamReviewCount.toLocaleString()} reviews
                </p>
                {steamAlternateHits.length > 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Other Steam store matches
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                      The first search result is used by default. If it is the wrong game, pick the right listing — this
                      re-runs the full IGDB + Backloggd + Steam bundle with the same name query.
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {steamAlternateHits.map((h) => (
                        <li key={h.appId}>
                          <button
                            type="button"
                            disabled={steamBusy || editorBundleBusy}
                            onClick={() =>
                              void runEditorLookupBundle({
                                steamPreferAppId: h.appId,
                                steamPreferSteamName: h.name,
                              })
                            }
                            className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:border-sky-500/50 hover:bg-zinc-800 disabled:opacity-50"
                          >
                            <span className="font-medium text-sky-200/90">{h.name}</span>
                            <span className="ml-2 font-mono text-zinc-500">app {h.appId}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {steamSuggestedVisibility != null ? (
                  <p className="leading-relaxed text-zinc-500">
                    Suggested needle (Steam formula):{' '}
                    <span className="font-mono text-zinc-300">{(steamSuggestedVisibility * 100).toFixed(1)}%</span>
                    {' — '}
                    adjust below if your editorial read of “buzz” differs.
                  </p>
                ) : (
                  <p className="leading-relaxed text-zinc-500">
                    Needle stored with this review (no fresh suggestion in this session). Adjust if you want a
                    different snapshot.
                  </p>
                )}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="steam-needle" className="font-medium text-zinc-300">
                      Needle (0–100%)
                    </label>
                    <span className="font-mono text-sm text-emerald-200/90">
                      {(visibilityScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  <input
                    id="steam-needle"
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={Math.round((visibilityScore ?? 0) * 200) / 2}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!Number.isFinite(n)) return
                      setVisibilityScore(Math.min(1, Math.max(0, n / 100)))
                    }}
                    className="mt-2 h-2 w-full cursor-pointer accent-emerald-500"
                  />
                  {steamSuggestedVisibility != null &&
                  Math.abs((visibilityScore ?? 0) - steamSuggestedVisibility) > 0.0005 ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-sky-400/90 underline-offset-2 hover:underline"
                      onClick={() => setVisibilityScore(steamSuggestedVisibility)}
                    >
                      Reset to suggested {(steamSuggestedVisibility * 100).toFixed(1)}%
                    </button>
                  ) : null}
                </div>
                {steamReviewSuggest ? (
                  <div className="space-y-4 border-t border-zinc-800 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-400/90">
                      From Steam store reviews
                    </p>
                    <p className="text-sm text-zinc-200">
                      Matched{' '}
                      <a
                        href={steamReviewSuggest.storeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-sky-200/95 underline-offset-2 hover:underline"
                      >
                        {steamResolvedName ?? 'Steam store'}
                      </a>
                      <span className="text-zinc-500"> · </span>
                      <span className="font-mono text-xs text-zinc-500">English review sample</span>
                    </p>
                    {steamReviewSuggest.fetchError ? (
                      <p className="text-xs text-amber-200/90">
                        Review excerpts unavailable: {steamReviewSuggest.fetchError}
                      </p>
                    ) : null}
                    {steamReviewSuggest.reviewSnippets.length ? (
                      <details className="text-xs text-zinc-400">
                        <summary className="cursor-pointer font-medium text-zinc-300">
                          Review excerpts used ({steamReviewSuggest.reviewSnippets.length})
                        </summary>
                        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/80 p-2 text-zinc-400">
                          {steamReviewSuggest.reviewSnippets.map((s, i) => (
                            <li key={`steam-snip-${i}`} className="leading-relaxed">
                              {s}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {steamReviewSuggest.fetchError ? null : !steamReviewSuggest.refinedWithCloudLlm &&
                      (steamReviewSuggest.llmError ||
                        steamReviewSuggest.reviewSnippets.length > 0 ||
                        steamReviewSuggest.suggestedTags.length > 0 ||
                        steamReviewSuggest.suggestedPlayIfLiked.length > 0 ||
                        steamReviewSuggest.suggestedPros.length > 0 ||
                        steamReviewSuggest.suggestedCons.length > 0) ? (
                      <p className="rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
                        Steam review suggestions were not refined by cloud AI (heuristics only).
                        {steamReviewSuggest.llmError ? ` ${steamReviewSuggest.llmError}` : ''}
                      </p>
                    ) : null}
                    {steamReviewSuggest.suggestedTags.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Suggested tags</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {steamReviewSuggest.suggestedTags.map((t) => (
                            <span
                              key={`steam-tag-${t}`}
                              className="inline-flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200"
                            >
                              {t}
                              <button
                                type="button"
                                onClick={() => addSuggestedTag(t)}
                                className="rounded bg-amber-600/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 hover:bg-amber-500"
                              >
                                Add
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {steamReviewSuggest.suggestedPlayIfLiked.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Play this if you liked</p>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                          {steamReviewSuggest.suggestedPlayIfLiked.map((line, i) => (
                            <li key={`steam-pil-${i}-${line}`} className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0">{line}</span>
                              <button
                                type="button"
                                onClick={() => setPlayIfLikedText((prev) => appendUniqueLines(prev, [line]))}
                                className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
                              >
                                Add line
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() =>
                            setPlayIfLikedText((prev) =>
                              appendUniqueLines(prev, steamReviewSuggest.suggestedPlayIfLiked),
                            )
                          }
                          className="mt-2 text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                        >
                          Add all lines
                        </button>
                      </div>
                    ) : null}
                    {steamReviewSuggest.suggestedPros.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Suggested pros</p>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                          {steamReviewSuggest.suggestedPros.map((line, i) => (
                            <li key={`steam-pro-${i}-${line}`} className="flex flex-wrap items-start gap-2">
                              <span className="min-w-0 flex-1 leading-snug">{line}</span>
                              <button
                                type="button"
                                onClick={() => setProsText((prev) => appendUniqueLines(prev, [line]))}
                                className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
                              >
                                Append
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() =>
                            setProsText((prev) => appendUniqueLines(prev, steamReviewSuggest.suggestedPros))
                          }
                          className="mt-2 text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                        >
                          Append all pros
                        </button>
                      </div>
                    ) : null}
                    {steamReviewSuggest.suggestedCons.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Suggested cons</p>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                          {steamReviewSuggest.suggestedCons.map((line, i) => (
                            <li key={`steam-con-${i}-${line}`} className="flex flex-wrap items-start gap-2">
                              <span className="min-w-0 flex-1 leading-snug">{line}</span>
                              <button
                                type="button"
                                onClick={() => setConsText((prev) => appendUniqueLines(prev, [line]))}
                                className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300"
                              >
                                Append
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() =>
                            setConsText((prev) => appendUniqueLines(prev, steamReviewSuggest.suggestedCons))
                          }
                          className="mt-2 text-xs font-semibold text-amber-300/90 underline-offset-2 hover:underline"
                        >
                          Append all cons
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
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
                disabled={igdbBusy || editorBundleBusy}
                onClick={searchIgdbGenres}
                className="rounded-lg bg-violet-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {igdbBusy ? 'Searching…' : 'Search IGDB only'}
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
          <h2 className="text-lg font-semibold text-white">Pros and Cons</h2>
          <p className="text-xs text-zinc-500">
            One bullet per line. <span className="text-zinc-400">(AI)</span> clusters themes (e.g. several puzzle lines →
            one bullet), then rewrites as a shorter list — server tries cloud LLM first; basic dedupe if keys fail.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-300">Pros</span>
                <button
                  type="button"
                  disabled={prosTidyBusy || consTidyBusy}
                  onClick={() => void runProsTidy()}
                  className="rounded-md border border-violet-500/50 bg-violet-950/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-200/95 transition hover:border-violet-400/60 hover:bg-violet-900/50 disabled:opacity-40"
                >
                  {prosTidyBusy ? '…' : '(AI)'}
                </button>
              </div>
              <textarea
                value={prosText}
                onChange={(e) => setProsText(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
              />
              {prosTidyErr ? <p className="mt-1 text-xs text-rose-300">{prosTidyErr}</p> : null}
            </div>
            <div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-300">Cons</span>
                <button
                  type="button"
                  disabled={prosTidyBusy || consTidyBusy}
                  onClick={() => void runConsTidy()}
                  className="rounded-md border border-violet-500/50 bg-violet-950/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-200/95 transition hover:border-violet-400/60 hover:bg-violet-900/50 disabled:opacity-40"
                >
                  {consTidyBusy ? '…' : '(AI)'}
                </button>
              </div>
              <textarea
                value={consText}
                onChange={(e) => setConsText(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
              />
              {consTidyErr ? <p className="mt-1 text-xs text-rose-300">{consTidyErr}</p> : null}
            </div>
          </div>
          {prosTidyNonAi || consTidyNonAi ? (
            <p className="rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              Last tidy used basic dedupe only, not cloud AI aggregation.
            </p>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Summary</h2>
          <p className="text-xs text-zinc-500">
            Optional capsule for the public review page (Summary fold). Plain text; long-form is fine (up to about 12k
            characters).
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                summarySuggestBusy ||
                outlineFromSummaryBusy ||
                summaryEnglishBusy ||
                editorNoteFromSummaryBusy
              }
              onClick={() => void runReviewSummarySuggest()}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-amber-500/50 hover:bg-zinc-800 disabled:opacity-50"
            >
              {summarySuggestBusy ? 'Generating…' : 'Suggest paragraph'}
            </button>
            <span className="text-xs font-medium text-zinc-500">English</span>
            <span className="select-none text-zinc-600">:</span>
            <button
              type="button"
              disabled={
                summarySuggestBusy ||
                outlineFromSummaryBusy ||
                summaryEnglishBusy ||
                editorNoteFromSummaryBusy
              }
              onClick={() => void runAdjustSummaryEnglish('down')}
              title="Slightly simpler English (easier to read)"
              aria-label="Slightly simpler English"
              className="min-w-[2rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm font-semibold leading-none text-zinc-100 transition hover:border-sky-500/50 hover:bg-zinc-800 disabled:opacity-50"
            >
              {summaryEnglishBusy ? '…' : '↓'}
            </button>
            <button
              type="button"
              disabled={
                summarySuggestBusy ||
                outlineFromSummaryBusy ||
                summaryEnglishBusy ||
                editorNoteFromSummaryBusy
              }
              onClick={() => void runAdjustSummaryEnglish('up')}
              title="Slightly richer English (more advanced)"
              aria-label="Slightly richer English"
              className="min-w-[2rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm font-semibold leading-none text-zinc-100 transition hover:border-sky-500/50 hover:bg-zinc-800 disabled:opacity-50"
            >
              {summaryEnglishBusy ? '…' : '↑'}
            </button>
            <span className="text-[11px] text-zinc-500">
              Uses game name + Pros + Cons; replaces this box on success. Server tries cloud LLM first; if that fails, a
              heuristic paragraph is used and flagged in red. Gemini order: dropdown in the Backloggd card above.{' '}
              <strong className="text-zinc-400">English ↑↓</strong> nudges the current summary only (cloud LLM, same
              model order).
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                outlineFromSummaryBusy ||
                summarySuggestBusy ||
                summaryEnglishBusy ||
                editorNoteFromSummaryBusy
              }
              onClick={() => void runOutlineFromSummary()}
              className="rounded-lg border border-violet-600/60 bg-violet-950/50 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:border-violet-500/70 hover:bg-violet-900/50 disabled:opacity-50"
            >
              {outlineFromSummaryBusy ? 'Inferring outline…' : 'Fill outline from summary'}
            </button>
            <span className="text-[11px] text-zinc-500">
              Uses game name + this summary. On success, replaces <strong className="text-zinc-400">Pros</strong>,{' '}
              <strong className="text-zinc-400">Cons</strong>, <strong className="text-zinc-400">Play if you liked</strong>
              , and all <strong className="text-zinc-400">hexagon</strong> values (see section above). Cloud LLM is tried
              first; heuristic outline is flagged in red if the model path failed.
            </span>
          </div>
          {summarySuggestErr ? <p className="text-xs text-rose-300">{summarySuggestErr}</p> : null}
          {summaryEnglishErr ? <p className="text-xs text-rose-300">{summaryEnglishErr}</p> : null}
          {outlineFromSummaryErr ? <p className="text-xs text-rose-300">{outlineFromSummaryErr}</p> : null}
          {summaryNotFromCloudAi ? (
            <p className="mt-2 rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              This summary was filled using heuristic fallback, not cloud AI output.
            </p>
          ) : null}
          {outlineNotFromCloudAi ? (
            <p className="mt-2 rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              The outline fields were filled using heuristic fallback, not cloud AI output.
            </p>
          ) : null}
          <textarea
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            rows={6}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Short verdict for skimmers—no spoilers, your own words."
          />
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Editor&apos;s note</h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            One informal line (optional). On <span className="font-mono text-zinc-400">/g/…</span> it appears once, as{' '}
            <strong className="text-zinc-400">Editor&apos;s note</strong> under the game name, only when this field is
            saved non-empty. Leave blank and save to show nothing there.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                editorNoteFromSummaryBusy ||
                summarySuggestBusy ||
                outlineFromSummaryBusy ||
                summaryEnglishBusy ||
                summaryText.trim().length < 20
              }
              onClick={() => void runEditorNoteFromSummary()}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-amber-500/50 hover:bg-zinc-800 disabled:opacity-50"
            >
              {editorNoteFromSummaryBusy ? 'Writing…' : '1 sentence from summary (AI)'}
            </button>
            <span className="text-[11px] text-zinc-500">
              Distills the Summary box into one personal line (cloud LLM when keys exist; otherwise a short heuristic
              clip). Uses the same Gemini model order as other AI tools here when Gemini runs.
            </span>
          </div>
          {editorNoteFromSummaryErr ? <p className="text-xs text-rose-300">{editorNoteFromSummaryErr}</p> : null}
          {editorNoteFromSummaryNonAi ? (
            <div className="rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              <p>This line was filled using heuristic fallback, not cloud AI output.</p>
              {editorNoteCloudTrace ? (
                <p className="mt-2 font-mono text-[11px] font-normal leading-relaxed text-rose-100/90">
                  {editorNoteCloudTrace}
                </p>
              ) : null}
            </div>
          ) : null}
          <textarea
            value={editorNoteText}
            onChange={(e) => setEditorNoteText(e.target.value)}
            rows={2}
            maxLength={600}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Optional one-liner under the game title; leave blank to hide on the public review."
          />
        </section>

        {loadReviewSlug && !editLoading && !editLoadError ? (
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">Reader comments</h2>
            <p className="text-xs leading-relaxed text-zinc-500">
              Public comments on <span className="font-mono text-zinc-400">/g/{loadReviewSlug}</span>. Deleting removes
              the row from Supabase only (GitHub issue mirrors are not removed automatically).
            </p>
            {editCommentsErr ? <p className="text-sm text-rose-300">{editCommentsErr}</p> : null}
            {editComments.length === 0 ? (
              <p className="text-sm text-zinc-500">No comments on this review yet.</p>
            ) : (
              <ul className="space-y-3">
                {editComments.map((c) => {
                  const preview =
                    c.body.length > 280 ? `${c.body.slice(0, 280).trimEnd()}…` : c.body
                  const when = new Date(c.created_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                  return (
                    <li
                      key={c.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-sm text-zinc-300"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-xs text-zinc-500">
                          <span className="font-medium text-zinc-400">{c.author_name?.trim() || 'Anonymous'}</span>
                          <span className="mx-1.5 text-zinc-600">·</span>
                          <time dateTime={c.created_at}>{when}</time>
                        </p>
                        <button
                          type="button"
                          disabled={deletingCommentId !== null}
                          onClick={() => void deleteEditComment(c.id)}
                          className="shrink-0 rounded border border-rose-900/60 bg-rose-950/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-200 hover:border-rose-700 hover:bg-rose-950 disabled:opacity-50"
                        >
                          {deletingCommentId === c.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-zinc-200">{preview}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : null}

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
            <div
              className={clsx(
                'mt-1 space-y-2 rounded-lg border px-3 py-3 text-sm',
                savedSlug
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-zinc-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-100',
              )}
            >
              <p>{submitStatus}</p>
              {savedSlug ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    className="font-semibold text-emerald-300 underline-offset-4 hover:underline"
                    to={`/g/${savedSlug}?mode=${readReviewModePreference()}`}
                  >
                    Open review
                  </Link>
                  <span className="text-zinc-500" aria-hidden>
                    ·
                  </span>
                  <Link className="font-semibold text-zinc-400 underline-offset-4 hover:underline" to="/">
                    Home
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
