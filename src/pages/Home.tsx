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

const mockVariants = [
  {
    to: '/mock/anthropic-design',
    title: 'Anthropic — frontend-design',
    blurb:
      'Editorial magazine direction: asymmetric layout, grain, staggered motion, distinctive serif/sans pairing.',
    hrefSkill:
      'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
  },
  {
    to: '/mock/design-review',
    title: 'Microsoft — frontend-design-review',
    blurb:
      'Frictionless insight-to-action, trustworthy disclosure, obvious hierarchy, and review-friendly structure.',
    hrefSkill:
      'https://github.com/microsoft/skills/tree/main/.github/skills/frontend-design-review',
  },
  {
    to: '/mock/dark-typescript-ui',
    title: 'Microsoft — frontend-ui-dark-ts',
    blurb:
      'Glass panels, brand-forward dark tokens, Framer Motion transitions, dashboard density tuned for data.',
    hrefSkill:
      'https://github.com/microsoft/skills/tree/main/.github/plugins/azure-sdk-typescript/skills/frontend-ui-dark-ts',
  },
  {
    to: '/mock/frontend-dev-studio',
    title: 'MiniMax — frontend-dev',
    blurb:
      'Bento surfaces, springy motion, conversion-minded copy blocks, and asymmetric composition without stock imagery.',
    hrefSkill: 'https://github.com/MiniMax-AI/skills/tree/main/skills/frontend-dev',
  },
] as const

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
          Long-form reviews with a Pack 1 layout (Fraunces + DM Sans), radar stats, and HowLongToBeat callouts.
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
          <p className={clsx('mt-4 text-sm', isLight ? 'text-zinc-600' : 'text-zinc-500')}>
            No reviews yet. Add one with “Add a game”.
          </p>
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

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to={`/review?mode=${homeMode}`}
            className={clsx(
              'inline-flex rounded-lg px-4 py-2 text-sm font-semibold transition',
              isLight
                ? 'bg-brand text-white hover:bg-brand-hover'
                : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300',
            )}
          >
            Sample review (Signalis)
          </Link>
          <Link
            to="/addgame"
            className={clsx(
              'inline-flex rounded-lg border px-4 py-2 text-sm font-semibold transition',
              isLight
                ? 'border-zinc-300 bg-white text-zinc-800 hover:border-brand/40'
                : 'border-zinc-700 bg-zinc-900/60 text-zinc-100 hover:border-emerald-500/40',
            )}
          >
            Add a game
          </Link>
        </div>

        <p
          className={clsx(
            'mt-14 text-xs font-semibold uppercase tracking-[0.2em]',
            isLight ? 'text-zinc-500' : 'text-zinc-500',
          )}
        >
          Archived mocks
        </p>
        <ul className="mt-4 space-y-4">
          {mockVariants.map((v) => (
            <li key={v.to}>
              <div
                className={clsx(
                  'rounded-2xl border transition',
                  isLight
                    ? 'border-zinc-200 bg-white shadow-sm hover:border-amber-400/50'
                    : 'border-zinc-800 bg-zinc-900/60 hover:border-amber-500/50 hover:bg-zinc-900',
                )}
              >
                <Link to={v.to} className="group block p-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2
                        className={clsx(
                          'text-lg font-semibold',
                          isLight ? 'text-zinc-950 group-hover:text-amber-800' : 'text-white group-hover:text-amber-200',
                        )}
                      >
                        {v.title}
                      </h2>
                      <p className={clsx('mt-2 text-sm leading-relaxed', isLight ? 'text-zinc-600' : 'text-zinc-400')}>
                        {v.blurb}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        'shrink-0 text-sm font-medium md:pt-1',
                        isLight ? 'text-amber-700' : 'text-amber-400/90',
                      )}
                    >
                      Open mock
                    </span>
                  </div>
                </Link>
                <a
                  className={clsx(
                    'block px-5 pb-5 text-xs underline-offset-4 hover:underline',
                    isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                  href={v.hrefSkill}
                  target="_blank"
                  rel="noreferrer"
                >
                  Skill source on GitHub
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
