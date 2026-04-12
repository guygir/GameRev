import { Fragment, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { GameStats } from '../review/gameStats'
import { StatRadar } from './StatRadar'
import { MockNav } from './MockNav'
import { ReviewModeToggle } from './ReviewModeToggle'
import { CoverArtAnthropic, CoverArtLight } from './ReviewCovers'
import { getReviewTheme, type ReviewMode } from '../review/getReviewTheme'
import clsx from 'clsx'

export type GameReviewViewModel = {
  name: string
  subtitle: string
  /** Month + year, e.g. from IGDB; shown under subtitle when set. */
  releaseLabel: string | null
  /** Long date when the review was first published (`games.created_at`). */
  publishedAtLabel: string | null
  coverImageUrl: string | null
  platforms: string[]
  hltbMain: string
  hltbExtras: string
  hltbCompletionist: string
  genres: string[]
  tags: string[]
  playIfLiked: { name: string; slug: string | null }[]
  pros: string[]
  cons: string[]
  stats: GameStats
  radarLabel: string
}

function ReviewCoverFallback({ variant }: { variant: 'anthropic' | 'light' }) {
  return variant === 'light' ? <CoverArtLight /> : <CoverArtAnthropic />
}

type GameReviewViewProps = {
  vm: GameReviewViewModel
  mode: ReviewMode
  onModeChange: (mode: ReviewMode) => void
  showModeToggle?: boolean
  navCrumbs?: { label: string; to?: string }[]
  navHomeLabel?: string
  navHomeTo?: string
}

export function GameReviewView({
  vm,
  mode,
  onModeChange,
  showModeToggle = true,
  navCrumbs = [{ label: 'Game review' }],
  navHomeLabel,
  navHomeTo,
}: GameReviewViewProps) {
  const theme = useMemo(() => getReviewTheme(mode), [mode])

  const cover = useMemo(() => {
    if (!vm.coverImageUrl) {
      return <ReviewCoverFallback variant={theme.cover} />
    }
    return (
      <img
        src={vm.coverImageUrl}
        alt={`${vm.name} cover art`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    )
  }, [theme.cover, vm.coverImageUrl, vm.name])

  const setMode = useCallback(
    (next: ReviewMode) => {
      onModeChange(next)
    },
    [onModeChange],
  )

  return (
    <div className={clsx(theme.shell, theme.fontBody)}>
      {theme.ambiance === 'anthropic' ? (
        <>
          <div
            className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#e8b86d]/10 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-[#6c2f2f]/25 blur-3xl"
            aria-hidden
          />
        </>
      ) : null}

      <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-10 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MockNav
            crumbs={navCrumbs}
            className={clsx(theme.fontNav, theme.navMuted)}
            homeLabel={navHomeLabel}
            homeTo={navHomeTo}
          />
          {showModeToggle ? (
            <ReviewModeToggle mode={mode} onChange={setMode} surface="review" />
          ) : null}
        </div>

        <header className="mt-10 md:mt-14">
          <p
            className={clsx('motion-rise', theme.fontBody, theme.eyebrow)}
            style={{ ['--motion-rise-delay' as string]: '40ms' }}
          >
            Long-form review
          </p>
          <div className="mt-6 grid items-end gap-8 md:grid-cols-12">
            <div className="md:col-span-7">
              <h1
                className={clsx('motion-rise', theme.fontDisplay, theme.title)}
                style={{ ['--motion-rise-delay' as string]: '120ms' }}
              >
                {vm.name}
              </h1>
              <p
                className={clsx('motion-rise', theme.fontBody, theme.subtitle)}
                style={{ ['--motion-rise-delay' as string]: '200ms' }}
              >
                {vm.subtitle}
              </p>
              {vm.releaseLabel ? (
                <p
                  className={clsx('motion-rise mt-2 text-sm', theme.fontBody, theme.navMuted)}
                  style={{ ['--motion-rise-delay' as string]: '240ms' }}
                >
                  Released {vm.releaseLabel}
                </p>
              ) : null}
              {vm.publishedAtLabel ? (
                <p
                  className={clsx('motion-rise mt-1.5 text-sm', theme.fontBody, theme.navMuted)}
                  style={{ ['--motion-rise-delay' as string]: '280ms' }}
                >
                  Review published {vm.publishedAtLabel}
                </p>
              ) : null}
            </div>
            <div
              className="motion-rise md:col-span-5 md:-translate-y-6 md:justify-self-end"
              style={{ ['--motion-rise-delay' as string]: '260ms' }}
            >
              <div className={theme.coverFrame}>
                {cover}
                <div className={theme.coverBottomFade} />
              </div>
            </div>
          </div>
        </header>

        <section
          className={clsx('motion-rise', theme.sectionDivider, theme.fontBody)}
          style={{ ['--motion-rise-delay' as string]: '320ms' }}
        >
          <div className="grid gap-10 md:grid-cols-12">
            <div className="space-y-8 md:col-span-5">
              <div>
                <h2 className={clsx(theme.fontDisplay, theme.h2)}>How long to beat</h2>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div className={theme.hltbCard}>
                    <dt className={theme.hltbLabel}>Main</dt>
                    <dd className={theme.hltbValue}>{vm.hltbMain}</dd>
                  </div>
                  <div className={theme.hltbCard}>
                    <dt className={theme.hltbLabel}>Extras</dt>
                    <dd className={theme.hltbValue}>{vm.hltbExtras}</dd>
                  </div>
                  <div className={theme.hltbCard}>
                    <dt className={theme.hltbLabel}>100%</dt>
                    <dd className={theme.hltbValue}>{vm.hltbCompletionist}</dd>
                  </div>
                </dl>
              </div>

              {vm.platforms.length ? (
                <div>
                  <h2 className={clsx(theme.fontDisplay, theme.h2)}>Platforms</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {vm.platforms.map((p) => (
                      <li key={p} className={theme.tagPill}>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h2 className={clsx(theme.fontDisplay, theme.h2)}>Genres</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {vm.genres.map((g) => (
                    <li key={g} className={theme.genrePill}>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className={clsx(theme.fontDisplay, theme.h2)}>Tags</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {vm.tags.map((t) => (
                    <li key={t} className={theme.tagPill}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className={clsx(theme.fontDisplay, theme.h2)}>Play this if you liked</h2>
                <p className="mt-3 text-sm leading-relaxed">
                  <span
                    className={clsx(
                      'font-semibold',
                      mode === 'light' ? 'text-zinc-800' : 'text-[#fff4e4]',
                    )}
                  >
                    Play this if you liked:{' '}
                  </span>
                  {vm.playIfLiked.map((pick, i) => (
                    <Fragment key={`${pick.name}-${i}`}>
                      {i > 0 ? (
                        <span
                          className={clsx(
                            'select-none',
                            mode === 'light' ? 'text-zinc-400' : 'text-[#f4e9d8]/40',
                          )}
                          aria-hidden
                        >
                          {' '}
                          ·{' '}
                        </span>
                      ) : null}
                      {pick.slug ? (
                        <Link
                          className={clsx(
                            'font-medium underline decoration-transparent underline-offset-4 transition hover:decoration-current',
                            mode === 'light'
                              ? 'text-brand hover:text-brand-hover'
                              : 'text-[#e8b86d] hover:text-[#ffe7c2]',
                          )}
                          to={`/g/${pick.slug}`}
                        >
                          {pick.name}
                        </Link>
                      ) : (
                        <span
                          className={clsx(
                            'font-medium',
                            mode === 'light' ? 'text-zinc-600' : 'text-[#f4e9d8]/65',
                          )}
                        >
                          {pick.name}
                        </span>
                      )}
                    </Fragment>
                  ))}
                </p>
              </div>
            </div>

            <div className="md:col-span-7">
              <div className={clsx(theme.radarPanel, 'flex min-h-[min(48dvh,520px)] flex-col')}>
                <div className={theme.radarGlow} />
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-0">
                  <StatRadar
                    fillContainer
                    stats={vm.stats}
                    fill={theme.radar.fill}
                    stroke={theme.radar.stroke}
                    gridStroke={theme.radar.grid}
                    labelColor={theme.radar.label}
                    label={vm.radarLabel}
                  />
                </div>
              </div>
            </div>
          </div>

          <details className={theme.details}>
            <summary className={theme.summary}>Pros and cons</summary>
            <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-10">
              <div>
                <h3 className={theme.prosHeading}>Pros</h3>
                <ul className={theme.prosBody}>
                  {vm.pros.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className={theme.consHeading}>Cons</h3>
                <ul className={theme.consBody}>
                  {vm.cons.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </section>
      </div>

    </div>
  )
}
