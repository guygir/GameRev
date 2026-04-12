import { motion, useReducedMotion } from 'framer-motion'
import { mockGame, statAxes } from './mockGame'
import { StatRadar } from '../components/StatRadar'
import { MockNav } from '../components/MockNav'

function CoverArt() {
  return (
    <svg
      viewBox="0 0 420 240"
      className="h-full w-full"
      role="img"
      aria-label="Neon grid cover for Signalis"
    >
      <defs>
        <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1030" />
          <stop offset="1" stopColor="#0b0a12" />
        </linearGradient>
      </defs>
      <rect width="420" height="240" fill="url(#dg)" />
      <g opacity="0.35" stroke="#8251ee" strokeWidth="1">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v-${i}`} x1={30 + i * 45} y1="10" x2={30 + i * 45} y2="230" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`h-${i}`} x1="10" y1={30 + i * 40} x2="410" y2={30 + i * 40} />
        ))}
      </g>
      <circle cx="330" cy="60" r="34" fill="rgba(130,81,238,0.25)" />
      <circle cx="330" cy="60" r="18" fill="rgba(130,81,238,0.45)" />
    </svg>
  )
}

const fadeUp = (reduceMotion: boolean) =>
  reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
      }

export default function MockDarkTs() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="min-h-[100dvh] bg-neutral-bg1 text-text-primary">
      <div className="border-b border-border-default bg-neutral-bg2/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <MockNav
            crumbs={[{ label: 'Dark UI kit mock' }]}
            className="text-text-secondary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-[0_0_20px_rgba(130,81,238,0.25)] hover:bg-brand-hover"
            >
              Pin review
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-lg border border-border-default bg-white/5 px-4 text-sm font-semibold text-text-primary hover:bg-white/10"
            >
              Compare
            </button>
          </div>
        </div>
      </div>

      <motion.main
        className="mx-auto max-w-6xl px-4 py-10"
        {...fadeUp(!!reduceMotion)}
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.section
            className="rounded-xl border border-border-default bg-white/5 p-6 shadow-[0_0_40px_rgba(130,81,238,0.12)] backdrop-blur-md"
            {...fadeUp(!!reduceMotion)}
            transition={
              reduceMotion ? undefined : { delay: 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }
            }
          >
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <CoverArt />
            </div>
            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Featured review
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
                  {mockGame.name}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                  {mockGame.subtitle}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-black/30 px-4 py-3 text-xs text-text-secondary">
                Glass surfaces echo the Microsoft dark UI skill: depth without
                muddy contrast.
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { k: 'Main', v: mockGame.hltbMain },
                { k: 'Extras', v: mockGame.hltbExtras },
                { k: '100%', v: mockGame.hltbCompletionist },
              ].map((x) => (
                <div
                  key={x.k}
                  className="rounded-lg border border-border-subtle bg-neutral-bg2/60 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {x.k}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{x.v}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Genres</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {mockGame.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-brand/30 bg-brand/15 px-3 py-1 text-xs font-semibold text-text-primary"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Tags</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {mockGame.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border-default bg-white/5 px-3 py-1 text-xs text-text-secondary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <details className="mt-8 rounded-lg border border-border-subtle bg-black/25 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-text-primary">
                Pros / cons
              </summary>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-status-success">
                    Pros
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                    {mockGame.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-status-error">
                    Cons
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                    {mockGame.cons.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </motion.section>

          <motion.aside
            className="space-y-6"
            {...fadeUp(!!reduceMotion)}
            transition={
              reduceMotion ? undefined : { delay: 0.1, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }
            }
          >
            <section className="rounded-xl border border-border-default bg-white/5 p-6 backdrop-blur-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Radar</h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    Data visualization colors borrow the skill token lane (`dataviz`)
                    without turning the page into a chart dump.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-center">
                <StatRadar
                  stats={mockGame.stats}
                  fill="#8251ee"
                  stroke="#c4b5fd"
                  gridStroke="#a1a1aa"
                  labelColor="#e4e4e7"
                  size={240}
                  label="Signalis review stats radar chart"
                />
              </div>
            </section>

            <section className="rounded-xl border border-border-default bg-neutral-bg2/70 p-6">
              <h2 className="text-lg font-semibold text-text-primary">Scores</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {statAxes.map((axis) => (
                  <li
                    key={axis}
                    className="flex items-center justify-between gap-4 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="text-text-secondary">{axis}</span>
                    <span className="font-semibold tabular-nums text-text-primary">
                      {mockGame.stats[axis]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </motion.aside>
        </div>
      </motion.main>
    </div>
  )
}
