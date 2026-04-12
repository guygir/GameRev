import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { MockNav } from '../components/MockNav'
import { ReviewModeToggle } from '../components/ReviewModeToggle'
import { getSupabaseBrowser } from '../lib/supabaseClient'
import { readReviewModePreference, writeReviewModePreference } from '../lib/reviewModePreference'
import { getReviewTheme, type ReviewMode } from '../review/getReviewTheme'

type GameCard = {
  slug: string
  name: string
  subtitle: string
  cover_image_url: string | null
}

export function Home() {
  const sb = useMemo(() => getSupabaseBrowser(), [])
  const [games, setGames] = useState<GameCard[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [homeMode, setHomeMode] = useState<ReviewMode>(() => readReviewModePreference())
  const homeTheme = useMemo(() => getReviewTheme(homeMode), [homeMode])

  useEffect(() => {
    if (!sb) return
    let cancelled = false
    void (async () => {
      const { data, error } = await sb
        .from('games')
        .select('slug, name, subtitle, cover_image_url')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) {
        setLoadErr(error.message)
        return
      }
      setGames((data ?? []) as GameCard[])
    })()
    return () => {
      cancelled = true
    }
  }, [sb])

  const onHomeModeChange = (next: ReviewMode) => {
    writeReviewModePreference(next)
    setHomeMode(next)
  }

  const isLight = homeMode === 'light'

  return (
    <div
      className={clsx(
        'min-h-[100dvh] px-4 py-14',
        isLight ? clsx(homeTheme.shell, homeTheme.fontBody) : 'bg-zinc-950 text-zinc-100',
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div
          className={clsx(
            'mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-5',
            isLight ? 'border-zinc-200' : 'border-zinc-800',
          )}
        >
          <MockNav
            crumbs={[{ label: 'Home' }]}
            className={clsx('text-sm', isLight ? homeTheme.navMuted : 'text-zinc-400')}
            homeLabel="GameRev"
            homeTo="/"
          />
          <ReviewModeToggle
            mode={homeMode}
            onChange={onHomeModeChange}
            surface={isLight ? 'review' : 'home'}
          />
        </div>
        <h1 className={clsx('text-3xl font-semibold tracking-tight md:text-4xl', isLight ? homeTheme.title : 'text-white')}>
          GameRev
        </h1>
        <p className={clsx('mt-4 max-w-2xl text-sm leading-relaxed', isLight ? homeTheme.subtitle : 'text-zinc-400')}>
          GameRev is a small catalog of video game reviews: editorial layouts, a six-stat radar, HowLongToBeat-style
          times, and reader comments—written to be read, not scrolled past.
        </p>

        <p
          className={clsx(
            'mt-10 text-xs font-semibold uppercase tracking-[0.2em]',
            isLight ? 'text-zinc-500' : 'text-zinc-500',
          )}
        >
          Reviews
        </p>
        <p className={clsx('mt-1 text-xs', isLight ? 'text-zinc-500' : 'text-zinc-600')}>Newest first.</p>
        {!sb ? (
          <p className={clsx('mt-4 text-sm', isLight ? 'text-zinc-600' : 'text-zinc-500')}>
            Set <span className="font-mono">VITE_SUPABASE_URL</span> and{' '}
            <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to list reviews from Supabase.
          </p>
        ) : loadErr ? (
          <p className="mt-4 text-sm text-rose-600">{loadErr}</p>
        ) : games.length === 0 ? (
          <p className={clsx('mt-4 text-sm', isLight ? 'text-zinc-600' : 'text-zinc-500')}>No reviews yet.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {games.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/g/${g.slug}?mode=${homeMode}`}
                  className={clsx(
                    'group block overflow-hidden rounded-2xl border transition',
                    isLight
                      ? 'border-zinc-200 bg-white shadow-sm hover:border-brand/30 hover:shadow-md'
                      : 'border-emerald-500/25 bg-emerald-950/35 hover:border-emerald-400/50 hover:bg-emerald-950/50',
                  )}
                >
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-stretch">
                    <div
                      className={clsx(
                        'relative aspect-[4/5] w-full shrink-0 overflow-hidden rounded-lg border sm:w-36',
                        isLight ? 'border-zinc-200 bg-zinc-100' : 'border-emerald-500/20 bg-zinc-900',
                      )}
                    >
                      {g.cover_image_url ? (
                        <img src={g.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div
                          className={clsx(
                            'flex h-full items-center justify-center text-xs',
                            isLight ? 'text-zinc-400' : 'text-zinc-500',
                          )}
                        >
                          No art
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2
                        className={clsx(
                          'text-lg font-semibold',
                          isLight ? 'text-zinc-950 group-hover:text-brand' : 'text-white group-hover:text-emerald-100',
                        )}
                      >
                        {g.name}
                      </h2>
                      {g.subtitle ? (
                        <p
                          className={clsx(
                            'mt-2 text-sm leading-relaxed',
                            isLight ? 'text-zinc-600' : 'text-emerald-100/75',
                          )}
                        >
                          {g.subtitle}
                        </p>
                      ) : null}
                      <span
                        className={clsx(
                          'mt-4 inline-flex text-sm font-semibold',
                          isLight ? 'text-brand group-hover:underline' : 'text-emerald-300/90',
                        )}
                      >
                        Read review →
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
