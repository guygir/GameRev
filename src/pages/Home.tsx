import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { KofiSupportButton } from '../components/KofiSupportButton'
import { MockNav } from '../components/MockNav'
import { HomeCatalogLayoutToggle } from '../components/HomeCatalogLayoutToggle'
import { HomeCatalogSortToggle } from '../components/HomeCatalogSortToggle'
import { ReviewModeToggle } from '../components/ReviewModeToggle'
import { formatReviewPublishedLabel } from '../lib/formatReviewPublished'
import {
  readHomeCatalogLayoutPreference,
  writeHomeCatalogLayoutPreference,
  type HomeCatalogLayout,
} from '../lib/homeCatalogLayoutPreference'
import {
  readHomeCatalogSortPreference,
  writeHomeCatalogSortPreference,
  type HomeCatalogSort,
} from '../lib/homeCatalogSortPreference'
import { getSupabaseBrowser } from '../lib/supabaseClient'
import { readReviewModePreference, writeReviewModePreference } from '../lib/reviewModePreference'
import { getReviewTheme, type ReviewMode } from '../review/getReviewTheme'
import {
  DEFAULT_DARK_REVIEW_ACCENT_HUE,
  homeCatalogCardCssVars,
  resolveDarkAccentHue,
  reviewDarkAccentCssVars,
} from '../review/reviewDarkAccent'

type GameCard = {
  slug: string
  name: string
  subtitle: string
  cover_image_url: string | null
  accent_hue: number | null
  accent_preset: number | null
  created_at: string
  catalog_rank: number | null
}

/** Second line on catalog cover: publish date (date sort) or #rank (rank sort). */
function catalogCoverMetaLine(sort: HomeCatalogSort, g: GameCard): string | null {
  if (sort === 'rank') {
    return typeof g.catalog_rank === 'number' && g.catalog_rank >= 1 ? `#${g.catalog_rank}` : null
  }
  return formatReviewPublishedLabel(g.created_at)
}

export function Home() {
  const sb = useMemo(() => getSupabaseBrowser(), [])
  const [games, setGames] = useState<GameCard[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [gamesLoading, setGamesLoading] = useState(false)
  const [homeMode, setHomeMode] = useState<ReviewMode>(() => readReviewModePreference())
  const [catalogLayout, setCatalogLayout] = useState(() => readHomeCatalogLayoutPreference())
  const [catalogSort, setCatalogSort] = useState<HomeCatalogSort>(() => readHomeCatalogSortPreference())
  const homeTheme = useMemo(
    () =>
      getReviewTheme(
        homeMode,
        homeMode === 'dark' ? { accentHue: DEFAULT_DARK_REVIEW_ACCENT_HUE } : undefined,
      ),
    [homeMode],
  )

  useEffect(() => {
    if (!sb) {
      setGamesLoading(false)
      return
    }
    let cancelled = false
    setGamesLoading(true)
    setLoadErr(null)
    void (async () => {
      try {
        const q = sb
          .from('games')
          .select('slug, name, subtitle, cover_image_url, accent_hue, accent_preset, created_at, catalog_rank')
        const { data, error } = await (
          catalogSort === 'rank'
            ? q.order('catalog_rank', { ascending: true })
            : q.order('created_at', { ascending: false })
        )
        if (cancelled) return
        if (error) {
          setLoadErr(error.message)
          setGames([])
          return
        }
        setGames((data ?? []) as GameCard[])
      } finally {
        if (!cancelled) setGamesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sb, catalogSort])

  const onHomeModeChange = (next: ReviewMode) => {
    writeReviewModePreference(next)
    setHomeMode(next)
  }

  const onCatalogLayoutChange = (next: HomeCatalogLayout) => {
    writeHomeCatalogLayoutPreference(next)
    setCatalogLayout(next)
  }

  const onCatalogSortChange = (next: HomeCatalogSort) => {
    writeHomeCatalogSortPreference(next)
    setCatalogSort(next)
  }

  const isLight = homeMode === 'light'
  const sortBlurb =
    catalogSort === 'date' ? 'Newest first.' : 'Manual catalog order (set on Add / Edit review).'

  return (
    <div
      className={clsx(homeTheme.shell, homeTheme.fontBody, 'relative')}
      style={isLight ? undefined : reviewDarkAccentCssVars(DEFAULT_DARK_REVIEW_ACCENT_HUE)}
    >
      {homeTheme.ambiance === 'anthropic' ? (
        <>
          <div
            className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[color:var(--review-accent-glow)] blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-[color:var(--review-accent-glow-2)] blur-3xl"
            aria-hidden
          />
        </>
      ) : null}

      <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-10 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MockNav
            crumbs={[{ label: 'Home' }]}
            className={clsx(homeTheme.fontNav, homeTheme.navMuted)}
            homeLabel="GameRev"
            homeTo="/"
          />
          <ReviewModeToggle mode={homeMode} onChange={onHomeModeChange} surface="review" />
        </div>

        <header className="mt-10 md:mt-14">
          <p className={clsx(homeTheme.fontBody, homeTheme.eyebrow)}>Editorial catalog</p>
          <h1 className={clsx('mt-6', homeTheme.fontDisplay, homeTheme.title)}>GameRev</h1>
          <p className={clsx(homeTheme.fontBody, homeTheme.subtitle, 'max-w-2xl')}>
            GameRev is a small catalog of video game reviews: editorial layouts, a six-stat radar, HowLongToBeat-style
            times, and reader comments—written to be read, not scrolled past.
          </p>
          <KofiSupportButton isLight={isLight} className={homeTheme.fontBody} />
        </header>

        <div className="mt-14 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className={clsx(homeTheme.fontDisplay, homeTheme.h2)}>Reviews</h2>
            <p
              className={clsx(
                'mt-2 text-sm leading-relaxed',
                isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/65',
              )}
            >
              {sortBlurb}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <HomeCatalogSortToggle sort={catalogSort} onChange={onCatalogSortChange} mode={homeMode} />
            <HomeCatalogLayoutToggle layout={catalogLayout} onChange={onCatalogLayoutChange} mode={homeMode} />
          </div>
        </div>
        {!sb ? (
          <p
            className={clsx(
              'mt-4 text-sm leading-relaxed',
              isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70',
            )}
          >
            Set <span className="font-mono">VITE_SUPABASE_URL</span> and{' '}
            <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to list reviews from Supabase.
          </p>
        ) : loadErr ? (
          <p className={clsx('mt-4 text-sm', isLight ? 'text-rose-600' : 'text-rose-300/95')}>{loadErr}</p>
        ) : gamesLoading ? (
          <p
            className={clsx(
              'mt-4 text-sm leading-relaxed',
              isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70',
            )}
          >
            Loading…
          </p>
        ) : games.length === 0 ? (
          <p
            className={clsx(
              'mt-4 text-sm leading-relaxed',
              isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70',
            )}
          >
            No reviews yet.
          </p>
        ) : catalogLayout === 'compact' ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {games.map((g) => {
              const cardHue = resolveDarkAccentHue(g.slug, {
                accentHue:
                  typeof g.accent_hue === 'number' && g.accent_hue >= 0 && g.accent_hue < 360
                    ? Math.round(g.accent_hue)
                    : null,
                accentPreset:
                  typeof g.accent_preset === 'number' && g.accent_preset >= 0 && g.accent_preset <= 4
                    ? g.accent_preset
                    : null,
              })
              const cardStyle = homeCatalogCardCssVars(cardHue, isLight ? 'light' : 'dark')
              const coverMeta = catalogCoverMetaLine(catalogSort, g)
              return (
                <li key={g.slug} className="min-w-0">
                  <Link
                    to={`/g/${g.slug}?mode=${homeMode}`}
                    style={cardStyle}
                    className={clsx(
                      'group block overflow-hidden rounded-xl border shadow-sm transition duration-200',
                      isLight
                        ? 'border-[color:var(--home-catalog-border)] bg-[color:var(--home-catalog-surface)] hover:border-[color:var(--home-catalog-border-hover)] hover:shadow-[0_14px_48px_-12px_var(--home-catalog-glow)]'
                        : 'border-[color:var(--home-catalog-border)] bg-[color:var(--home-catalog-surface)] hover:border-[color:var(--home-catalog-border-hover)] hover:bg-[color:var(--home-catalog-surface-hover)] hover:shadow-[0_0_48px_-10px_var(--home-catalog-glow)]',
                    )}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden">
                      {g.cover_image_url ? (
                        <>
                          <img
                            src={g.cover_image_url}
                            alt=""
                            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2.5 py-2 sm:px-3 sm:py-2.5">
                            <p
                              className={clsx(
                                homeTheme.fontDisplay,
                                'line-clamp-2 text-sm font-semibold leading-tight text-white sm:text-base',
                              )}
                            >
                              {g.name}
                            </p>
                            {coverMeta ? (
                              <p
                                className={clsx(
                                  homeTheme.fontBody,
                                  'mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:text-[11px]',
                                  catalogSort === 'date' && 'normal-case tracking-normal',
                                  catalogSort === 'rank' && 'font-mono tracking-normal',
                                )}
                              >
                                {coverMeta}
                              </p>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div
                          className={clsx(
                            'flex h-full flex-col justify-end p-2.5 sm:p-3',
                            isLight ? 'bg-zinc-100' : 'bg-zinc-900',
                          )}
                        >
                          <span
                            className={clsx(
                              'text-[10px] font-semibold uppercase tracking-widest',
                              isLight ? 'text-zinc-500' : 'text-[#f4e9d8]/50',
                            )}
                          >
                            No art
                          </span>
                          <p
                            className={clsx(
                              homeTheme.fontDisplay,
                              'mt-1 line-clamp-2 text-sm font-semibold leading-tight sm:text-base',
                              isLight
                                ? 'text-zinc-950 group-hover:text-[color:var(--home-catalog-title-hover)]'
                                : 'text-[#fff4e4] group-hover:text-[color:var(--home-catalog-title-hover)]',
                            )}
                          >
                            {g.name}
                          </p>
                          {coverMeta ? (
                            <p
                              className={clsx(
                                homeTheme.fontBody,
                                'mt-1 text-[10px] font-semibold uppercase tracking-widest sm:text-[11px]',
                                isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/65',
                                catalogSort === 'date' && 'normal-case tracking-normal',
                                catalogSort === 'rank' && 'font-mono tracking-normal',
                              )}
                            >
                              {coverMeta}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className="mt-6 space-y-4">
            {games.map((g) => {
              const cardHue = resolveDarkAccentHue(g.slug, {
                accentHue:
                  typeof g.accent_hue === 'number' && g.accent_hue >= 0 && g.accent_hue < 360
                    ? Math.round(g.accent_hue)
                    : null,
                accentPreset:
                  typeof g.accent_preset === 'number' && g.accent_preset >= 0 && g.accent_preset <= 4
                    ? g.accent_preset
                    : null,
              })
              const cardStyle = homeCatalogCardCssVars(cardHue, isLight ? 'light' : 'dark')
              const coverMeta = catalogCoverMetaLine(catalogSort, g)
              return (
                <li key={g.slug}>
                  <Link
                    to={`/g/${g.slug}?mode=${homeMode}`}
                    style={cardStyle}
                    className={clsx(
                      'group block overflow-hidden rounded-2xl border shadow-sm transition duration-200',
                      isLight
                        ? 'border-[color:var(--home-catalog-border)] bg-[color:var(--home-catalog-surface)] hover:border-[color:var(--home-catalog-border-hover)] hover:shadow-[0_14px_48px_-12px_var(--home-catalog-glow)]'
                        : 'border-[color:var(--home-catalog-border)] bg-[color:var(--home-catalog-surface)] hover:border-[color:var(--home-catalog-border-hover)] hover:bg-[color:var(--home-catalog-surface-hover)] hover:shadow-[0_0_48px_-10px_var(--home-catalog-glow)]',
                    )}
                  >
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-stretch">
                      <div
                        className={clsx(
                          'relative aspect-[4/5] w-full shrink-0 overflow-hidden rounded-lg border sm:w-36',
                          isLight
                            ? 'border-[color:var(--home-catalog-thumb-border)] bg-zinc-100'
                            : 'border-[color:var(--home-catalog-thumb-border)] bg-zinc-900',
                        )}
                      >
                        {g.cover_image_url ? (
                          <>
                            <img
                              src={g.cover_image_url}
                              alt=""
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                              loading="lazy"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-2">
                              <p
                                className={clsx(
                                  homeTheme.fontDisplay,
                                  'line-clamp-3 text-xs font-semibold leading-snug text-white sm:text-sm',
                                )}
                              >
                                {g.name}
                              </p>
                              {coverMeta ? (
                                <p
                                  className={clsx(
                                    homeTheme.fontBody,
                                    'mt-1 text-[10px] font-semibold text-white/90',
                                    catalogSort === 'date' && 'normal-case',
                                    catalogSort === 'rank' && 'font-mono',
                                  )}
                                >
                                  {catalogSort === 'date' ? (
                                    <>
                                      <span className="font-semibold uppercase tracking-widest text-white/75">
                                        Published
                                      </span>{' '}
                                      {coverMeta}
                                    </>
                                  ) : (
                                    coverMeta
                                  )}
                                </p>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <div
                            className={clsx(
                              'flex h-full flex-col justify-end p-2.5',
                              isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70',
                            )}
                          >
                            <span
                              className={clsx(
                                'text-[10px] font-semibold uppercase tracking-widest',
                                isLight ? 'text-zinc-500' : 'text-[#f4e9d8]/50',
                              )}
                            >
                              No art
                            </span>
                            <p
                              className={clsx(
                                homeTheme.fontDisplay,
                                'mt-1 line-clamp-3 text-xs font-semibold leading-snug sm:text-sm',
                                isLight
                                  ? 'text-zinc-950 group-hover:text-[color:var(--home-catalog-title-hover)]'
                                  : 'text-[#fff4e4] group-hover:text-[color:var(--home-catalog-title-hover)]',
                              )}
                            >
                              {g.name}
                            </p>
                            {coverMeta ? (
                              <p
                                className={clsx(
                                  homeTheme.fontBody,
                                  'mt-1 text-[10px] font-semibold',
                                  catalogSort === 'date' && 'normal-case',
                                  catalogSort === 'rank' && 'font-mono',
                                )}
                              >
                                {catalogSort === 'date' ? (
                                  <>
                                    <span
                                      className={clsx(
                                        'font-semibold uppercase tracking-widest',
                                        isLight ? 'text-zinc-500' : 'text-[#f4e9d8]/55',
                                      )}
                                    >
                                      Published
                                    </span>{' '}
                                    {coverMeta}
                                  </>
                                ) : (
                                  coverMeta
                                )}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3
                          className={clsx(
                            homeTheme.fontDisplay,
                            'text-xl font-semibold transition-colors md:text-2xl',
                            isLight
                              ? 'text-zinc-950 group-hover:text-[color:var(--home-catalog-title-hover)]'
                              : 'text-[#fff4e4] group-hover:text-[color:var(--home-catalog-title-hover)]',
                          )}
                        >
                          {g.name}
                        </h3>
                        {g.subtitle ? (
                          <p
                            className={clsx(
                              homeTheme.fontBody,
                              'mt-2 text-sm leading-relaxed text-[color:var(--home-catalog-subtitle)]',
                            )}
                          >
                            {g.subtitle}
                          </p>
                        ) : null}
                        <span
                          className={clsx(
                            homeTheme.fontBody,
                            'mt-4 inline-flex text-sm font-semibold transition-colors',
                            isLight
                              ? 'text-[color:var(--home-catalog-cta)] group-hover:underline'
                              : 'text-[color:var(--home-catalog-cta)]',
                          )}
                        >
                          Read review →
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
