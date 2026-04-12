import { motion, useReducedMotion } from 'framer-motion'
import { mockGame, statAxes } from './mockGame'
import { StatRadar } from '../components/StatRadar'
import { MockNav } from '../components/MockNav'

function CoverArt() {
  return (
    <svg
      viewBox="0 0 360 360"
      className="h-full w-full"
      role="img"
      aria-label="Bento cover mosaic for Signalis"
    >
      <rect width="360" height="360" rx="48" fill="#ffffff" />
      <path
        d="M32 300 C120 220 200 260 328 140 L328 328 L32 328 Z"
        fill="#0f766e"
        opacity="0.18"
      />
      <path
        d="M32 120 C150 40 240 90 328 32 L328 200 C220 170 120 200 32 240 Z"
        fill="#134e4a"
        opacity="0.16"
      />
      <circle cx="120" cy="120" r="46" fill="#0d9488" opacity="0.12" />
      <rect x="44" y="52" width="120" height="14" rx="4" fill="#0f172a" opacity="0.85" />
      <rect x="44" y="76" width="200" height="10" rx="3" fill="#64748b" opacity="0.45" />
    </svg>
  )
}

export default function MockFrontendDev() {
  const reduceMotion = useReducedMotion()

  const container = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.08, delayChildren: 0.05 },
        },
      }

  const item = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
        },
      }

  const motionProps = reduceMotion
    ? {}
    : { initial: 'hidden' as const, animate: 'visible' as const, variants: container }

  const cellProps = reduceMotion ? {} : { variants: item }

  return (
    <div className="min-h-[100dvh] bg-[#f9fafb] font-[family-name:var(--font-bento)] text-slate-900">
      <div className="border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <MockNav crumbs={[{ label: 'Frontend-dev studio mock' }]} className="text-slate-600" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-slate-800"
            >
              Save this verdict
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition active:scale-[0.98] hover:bg-slate-50"
            >
              Browse similar picks
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10">
        <motion.div
          className="grid auto-rows-[minmax(120px,auto)] grid-cols-1 gap-4 md:grid-cols-12"
          {...motionProps}
        >
          <motion.section
            className="md:col-span-7 md:row-span-2"
            {...cellProps}
          >
            <div className="h-full rounded-[2.5rem] border border-slate-200/60 bg-white p-8 shadow-[0_30px_120px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-800">
                Verdict-first layout
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl md:leading-[1.02]">
                {mockGame.name}
              </h1>
              <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-slate-600">
                {mockGame.subtitle} This mock follows the MiniMax frontend-dev skill
                emphasis: asymmetric composition, springy motion, and persuasive copy
                instead of filler text.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  { label: 'Main', value: mockGame.hltbMain },
                  { label: 'Extras', value: mockGame.hltbExtras },
                  { label: '100%', value: mockGame.hltbCompletionist },
                ].map((x) => (
                  <div
                    key={x.label}
                    className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {x.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                      {x.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          <motion.section className="md:col-span-5" {...cellProps}>
            <div className="h-full overflow-hidden rounded-[2.5rem] border border-slate-200/60 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.08)]">
              <CoverArt />
            </div>
          </motion.section>

          <motion.section className="md:col-span-5" {...cellProps}>
            <div className="flex h-full flex-col justify-between rounded-[2.5rem] border border-slate-200/60 bg-white p-7 shadow-[0_30px_120px_rgba(15,23,42,0.08)]">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Taxonomy</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Genres anchor browse pages; tags power search facets in your Supabase
                  schema later.
                </p>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Genres
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mockGame.genres.map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tags
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mockGame.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section className="md:col-span-6" {...cellProps}>
            <div className="h-full rounded-[2.5rem] border border-slate-200/60 bg-white p-7 shadow-[0_30px_120px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Player card radar</h2>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
                    Six axes map cleanly to a single SVG layer so you can animate
                    reveals without shipping a charting dependency on day one.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-slate-700">
                    {statAxes.map((axis) => (
                      <li key={axis} className="flex items-center justify-between gap-8">
                        <span>{axis}</span>
                        <span className="font-semibold tabular-nums text-slate-950">
                          {mockGame.stats[axis]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <StatRadar
                  stats={mockGame.stats}
                  fill="#0f766e"
                  stroke="#134e4a"
                  gridStroke="#64748b"
                  labelColor="#334155"
                  size={230}
                  label="Signalis review stats radar chart"
                />
              </div>
            </div>
          </motion.section>

          <motion.section className="md:col-span-6" {...cellProps}>
            <details className="group h-full rounded-[2.5rem] border border-slate-200/60 bg-white p-7 shadow-[0_30px_120px_rgba(15,23,42,0.08)] open:bg-slate-50">
              <summary className="cursor-pointer list-none text-lg font-semibold text-slate-950 outline-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">
                  Pros and cons
                  <span className="text-sm font-semibold text-teal-800 group-open:hidden">
                    Expand
                  </span>
                  <span className="hidden text-sm font-semibold text-teal-800 group-open:inline">
                    Collapse
                  </span>
                </span>
              </summary>
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800">Pros</h3>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
                    {mockGame.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-rose-800">Cons</h3>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
                    {mockGame.cons.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </motion.section>
        </motion.div>
      </div>
    </div>
  )
}
