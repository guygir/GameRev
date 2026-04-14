import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { GameStats } from '../review/gameStats'
import { StatRadar } from './StatRadar'
import { MockNav } from './MockNav'
import { ReviewModeToggle } from './ReviewModeToggle'
import { CoverArtAnthropic, CoverArtLight } from './ReviewCovers'
import { getReviewTheme, type ReviewMode } from '../review/getReviewTheme'
import {
  DEFAULT_DARK_REVIEW_ACCENT_HUE,
  reviewDarkAccentCssVars,
} from '../review/reviewDarkAccent'
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
  /** Long-form summary; null shows a placeholder until stored in DB. */
  reviewSummary: string | null
  stats: GameStats
  radarLabel: string
  /** DB `accent_hue` (0–359); null if unset. */
  accentHue: number | null
  /** Legacy `accent_preset` (0–4) when `accent_hue` is null. */
  accentPreset: number | null
}

function ReviewCoverFallback({ variant }: { variant: 'anthropic' | 'light' }) {
  return variant === 'light' ? <CoverArtLight /> : <CoverArtAnthropic />
}

const PLACEHOLDER_SUMMARIES = [
  'A tight, spoiler-light verdict will live here once you write a short editorial summary for this review.',
  'This fold is reserved for a one-paragraph capsule: tone, audience, and why the game is worth your time.',
  'The summary line will anchor the page for skimmers; for now this copy stands in so you can tune layout and rhythm.',
  'Think of this as the elevator pitch after the scores: what stayed with you after the credits rolled?',
  'Later this block can pull from the database; today it is sample text so the disclosure affordance is visible.',
] as const

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function resolvedReviewSummary(vm: GameReviewViewModel): string {
  const t = vm.reviewSummary?.trim()
  if (t) return t
  const i = hashString(vm.name) % PLACEHOLDER_SUMMARIES.length
  return PLACEHOLDER_SUMMARIES[i]!
}

type GameReviewViewProps = {
  vm: GameReviewViewModel
  mode: ReviewMode
  onModeChange: (mode: ReviewMode) => void
  /** Dark mode only: resolved hue (slug hash or preset). */
  darkAccentHue?: number
  showModeToggle?: boolean
  navCrumbs?: { label: string; to?: string }[]
  navHomeLabel?: string
  navHomeTo?: string
}

export function GameReviewView({
  vm,
  mode,
  onModeChange,
  darkAccentHue,
  showModeToggle = true,
  navCrumbs = [{ label: 'Game review' }],
  navHomeLabel,
  navHomeTo,
}: GameReviewViewProps) {
  const accentHue = darkAccentHue ?? DEFAULT_DARK_REVIEW_ACCENT_HUE
  const theme = useMemo(
    () => getReviewTheme(mode, mode === 'dark' ? { darkAccentHue: accentHue } : undefined),
    [mode, accentHue],
  )

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
    <div
      className={clsx(theme.shell, theme.fontBody)}
      style={mode === 'dark' ? reviewDarkAccentCssVars(accentHue) : undefined}
    >
      {theme.ambiance === 'anthropic' ? (
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
              {vm.releaseLabel || vm.publishedAtLabel ? (
                <p
                  className={clsx(
                    'motion-rise mt-2 text-sm leading-relaxed',
                    theme.fontBody,
                    mode === 'light' ? 'text-zinc-600' : 'text-[#f4e9d8]/80',
                  )}
                  style={{ ['--motion-rise-delay' as string]: '240ms' }}
                >
                  {vm.releaseLabel ? (
                    <>
                      <span
                        className={
                          mode === 'light' ? 'font-semibold text-zinc-800' : 'font-semibold text-[#fff4e4]'
                        }
                      >
                        Released
                      </span>{' '}
                      {vm.releaseLabel}
                    </>
                  ) : null}
                  {vm.releaseLabel && vm.publishedAtLabel ? (
                    <span className="mx-2 inline-block opacity-45" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {vm.publishedAtLabel ? (
                    <>
                      <span
                        className={
                          mode === 'light' ? 'font-semibold text-zinc-800' : 'font-semibold text-[#fff4e4]'
                        }
                      >
                        Review published
                      </span>{' '}
                      {vm.publishedAtLabel}
                    </>
                  ) : null}
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
            <div className="order-2 space-y-8 md:order-1 md:col-span-5">
              {vm.platforms.length ? (
                <div>
                  <h2 className={clsx(theme.fontDisplay, theme.h2)}>Platforms</h2>
                  <ul className="mt-4 flex flex-wrap gap-2">
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
                <ul className="mt-4 flex flex-wrap gap-2">
                  {vm.genres.map((g) => (
                    <li key={g} className={theme.genrePill}>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className={clsx(theme.fontDisplay, theme.h2)}>Tags</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {vm.tags.map((t) => (
                    <li key={t} className={theme.genrePill}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className={clsx(theme.fontDisplay, theme.h2)}>Play this if you liked</h2>
                <ul
                  className={clsx(
                    'mt-4 list-none space-y-2.5 p-0 text-sm leading-relaxed',
                    theme.fontBody,
                  )}
                >
                  {vm.playIfLiked.map((pick, i) => (
                    <li key={`${pick.name}-${i}`}>
                      {pick.slug ? (
                        <Link
                          className={clsx(
                            'font-medium underline decoration-transparent underline-offset-4 transition hover:decoration-current',
                            mode === 'light'
                              ? 'text-brand hover:text-brand-hover'
                              : 'text-[color:var(--review-accent)] hover:text-[color:var(--review-accent-bright)]',
                          )}
                          to={`/g/${pick.slug}?mode=${mode}`}
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
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="order-1 flex flex-col gap-10 md:order-2 md:col-span-7">
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

          <div
            className={clsx(
              'mt-10 border-t pt-10',
              mode === 'light' ? 'border-zinc-200' : 'border-white/10',
            )}
          >
            <h2 className={clsx(theme.fontDisplay, theme.h2)}>Pros and Cons</h2>
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
          </div>

          <details className={clsx(theme.details, 'mt-10')}>
            <summary className={theme.summary}>Summary</summary>
            <p
              className={clsx(
                theme.fontBody,
                'mt-4 whitespace-pre-line text-sm leading-relaxed',
                mode === 'light' ? 'text-zinc-700' : 'text-[#f4e9d8]/85',
              )}
            >
              {resolvedReviewSummary(vm)}
            </p>
          </details>
        </section>
      </div>

    </div>
  )
}
