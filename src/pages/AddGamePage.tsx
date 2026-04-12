import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { statAxes, type GameStats } from '../review/gameStats'
import { getSupabaseBrowser } from '../lib/supabaseClient'

type HltbHit = {
  id: string
  name: string
  imageUrl: string
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

  const [poolGenres, setPoolGenres] = useState<string[]>([])
  const [poolTags, setPoolTags] = useState<string[]>([])
  const [reviewedGames, setReviewedGames] = useState<{ name: string; slug: string }[]>([])

  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [password, setPassword] = useState('')

  const [hltbQuery, setHltbQuery] = useState('')
  const [hltbHits, setHltbHits] = useState<HltbHit[]>([])
  const [hltbBusy, setHltbBusy] = useState(false)
  const [hltbError, setHltbError] = useState<string | null>(null)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [hltbMainHours, setHltbMainHours] = useState<number | null>(null)
  const [hltbExtrasHours, setHltbExtrasHours] = useState<number | null>(null)
  const [hltbCompletionistHours, setHltbCompletionistHours] = useState<number | null>(null)

  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set())
  const [genreDraft, setGenreDraft] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagDraft, setTagDraft] = useState('')

  const [stats, setStats] = useState<GameStats>(() => defaultStats())

  const [playIfLikedText, setPlayIfLikedText] = useState('')
  const [prosText, setProsText] = useState('')
  const [consText, setConsText] = useState('')

  const [submitStatus, setSubmitStatus] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)

  useEffect(() => {
    const client = sb
    if (!client) return
    let cancelled = false
    async function loadPools() {
      if (!client) return
      const [gRes, tRes, gamesRes] = await Promise.all([
        client.from('genres').select('name').order('name'),
        client.from('tags').select('name').order('name'),
        client.from('games').select('name, slug').order('name'),
      ])
      if (cancelled) return
      setPoolGenres((gRes.data ?? []).map((r) => r.name as string))
      setPoolTags((tRes.data ?? []).map((r) => r.name as string))
      setReviewedGames((gamesRes.data ?? []) as { name: string; slug: string }[])
    }
    void loadPools()
    return () => {
      cancelled = true
    }
  }, [sb])

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

  const addTagDraft = useCallback(() => {
    const v = tagDraft.trim()
    if (!v) return
    setPoolTags((prev) => (prev.includes(v) ? prev : [...prev, v].sort((a, b) => a.localeCompare(b))))
    setSelectedTags((prev) => new Set(prev).add(v))
    setTagDraft('')
  }, [tagDraft])

  const applyHltb = useCallback((hit: HltbHit) => {
    setName(hit.name)
    setCoverImageUrl(hit.imageUrl)
    setHltbMainHours(hit.gameplayMain ?? null)
    setHltbExtrasHours(hit.gameplayMainExtra ?? null)
    setHltbCompletionistHours(hit.gameplayCompletionist ?? null)
    setHltbHits([])
    setHltbQuery(hit.name)
  }, [])

  const submit = useCallback(async () => {
    setSubmitStatus(null)
    if (!name.trim()) {
      setSubmitStatus('Game name is required.')
      return
    }
    setSubmitBusy(true)
    try {
      const playIfLiked = linesToList(playIfLikedText).map((n) => ({ name: n }))
      const body = {
        password: password,
        name: name.trim(),
        subtitle: subtitle.trim(),
        coverImageUrl,
        hltbMainHours,
        hltbExtrasHours,
        hltbCompletionistHours,
        stats,
        genres: [...selectedGenres],
        tags: [...selectedTags],
        pros: linesToList(prosText),
        cons: linesToList(consText),
        playIfLiked,
      }
      const res = await fetch('/api/add-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { slug?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      if (!json.slug) throw new Error('Missing slug in response')
      setSavedSlug(json.slug)
      setSubmitStatus('Saved.')
    } catch (e) {
      setSubmitStatus(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitBusy(false)
    }
  }, [
    consText,
    coverImageUrl,
    hltbCompletionistHours,
    hltbExtrasHours,
    hltbMainHours,
    name,
    password,
    playIfLikedText,
    prosText,
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">GameRev</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Add a review</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            HLTB lookup runs on the dev server (<span className="font-mono">/api/hltb-search</span>). Saving a review
            requires <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> and{' '}
            <span className="font-mono">ADD_GAME_PASSWORD</span> in your local env.
          </p>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-emerald-300 underline-offset-4 hover:underline">
            Back home
          </Link>
        </header>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">HowLongToBeat</h2>
          <label className="block text-sm font-medium text-zinc-300">Search title</label>
          <input
            value={hltbQuery}
            onChange={(e) => setHltbQuery(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Type at least 2 characters…"
          />
          {hltbBusy ? <p className="text-xs text-zinc-500">Searching…</p> : null}
          {hltbError ? <p className="text-xs text-rose-300">{hltbError}</p> : null}
          {hltbHits.length ? (
            <ul className="mt-2 max-h-64 space-y-2 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              {hltbHits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => applyHltb(h)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-800/80"
                  >
                    <img src={h.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                    <span className="font-medium text-zinc-100">{h.name}</span>
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
          <label className="mt-4 block text-sm font-medium text-zinc-300">Subtitle / deck</label>
          <textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
          />
          <p className="text-xs text-zinc-500">
            Cover + HLTB hours come from your HLTB pick above (you can still edit name after).
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Hexagon stats (0–100)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {statAxes.map((axis) => (
              <label key={axis} className="block text-sm">
                <span className="text-zinc-300">{axis}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={stats[axis]}
                  onChange={(e) =>
                    setStats((s) => ({ ...s, [axis]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Genres</h2>
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Password"
          />
          <button
            type="button"
            disabled={submitBusy}
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitBusy ? 'Saving…' : 'POST review'}
          </button>
          {submitStatus ? (
            <p className="text-sm text-zinc-300">
              {submitStatus}{' '}
              {savedSlug ? (
                <Link
                  className="font-semibold text-emerald-300 underline-offset-4 hover:underline"
                  to={`/g/${savedSlug}`}
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
