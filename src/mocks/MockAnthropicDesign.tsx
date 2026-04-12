import { mockGame, statAxes } from './mockGame'
import { StatRadar } from '../components/StatRadar'
import { MockNav } from '../components/MockNav'

function CoverArt() {
  return (
    <svg
      viewBox="0 0 320 420"
      className="h-full w-full"
      role="img"
      aria-label="Abstract cover treatment for Signalis"
    >
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b1f18" />
          <stop offset="0.45" stopColor="#4a2418" />
          <stop offset="1" stopColor="#0b0a12" />
        </linearGradient>
        <radialGradient id="g2" cx="30%" cy="25%" r="70%">
          <stop offset="0" stopColor="#f0c987" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f0c987" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="420" fill="url(#g1)" />
      <rect width="320" height="420" fill="url(#g2)" />
      <path
        d="M-20 260 L120 120 L260 300 L340 180 L360 460 L-40 460 Z"
        fill="#120c10"
        opacity="0.55"
      />
      <path
        d="M40 380 L140 200 L220 320 L300 240 L320 420 L20 420 Z"
        fill="#c17a3a"
        opacity="0.22"
      />
      <circle cx="250" cy="90" r="46" fill="none" stroke="#f4e9d8" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="250" cy="90" r="28" fill="none" stroke="#f4e9d8" strokeOpacity="0.18" strokeWidth="1" />
    </svg>
  )
}

export default function MockAnthropicDesign() {
  return (
    <div className="grain-bg relative min-h-[100dvh] overflow-hidden bg-[#120d0a] text-[#f4e9d8]">
      <div
        className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#e8b86d]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-[#6c2f2f]/25 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 md:px-8">
        <MockNav
          crumbs={[{ label: 'Anthropic — frontend-design' }]}
          className="font-[family-name:var(--font-anthropic-body)] text-[#f4e9d8]/70"
        />

        <header className="mt-10 md:mt-14">
          <p
            className="motion-rise text-xs font-semibold uppercase tracking-[0.35em] text-[#e8b86d]"
            style={{ ['--motion-rise-delay' as string]: '40ms' }}
          >
            Long-form review
          </p>
          <div className="mt-6 grid items-end gap-8 md:grid-cols-12">
            <div className="md:col-span-7">
              <h1
                className="motion-rise font-[family-name:var(--font-anthropic-display)] text-5xl leading-[0.95] tracking-tight text-[#fff4e4] md:text-7xl"
                style={{ ['--motion-rise-delay' as string]: '120ms' }}
              >
                {mockGame.name}
              </h1>
              <p
                className="motion-rise mt-5 max-w-xl font-[family-name:var(--font-anthropic-body)] text-base leading-relaxed text-[#f4e9d8]/75 md:text-lg"
                style={{ ['--motion-rise-delay' as string]: '200ms' }}
              >
                {mockGame.subtitle}
              </p>
            </div>
            <div
              className="motion-rise md:col-span-5 md:-translate-y-6 md:justify-self-end"
              style={{ ['--motion-rise-delay' as string]: '260ms' }}
            >
              <div className="relative aspect-[4/5] w-full max-w-sm rotate-2 overflow-hidden rounded-sm border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.55)] md:max-w-none">
                <CoverArt />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
              </div>
            </div>
          </div>
        </header>

        <section
          className="motion-rise mt-14 grid gap-10 border-t border-white/10 pt-10 md:grid-cols-12"
          style={{ ['--motion-rise-delay' as string]: '320ms' }}
        >
          <div className="space-y-8 font-[family-name:var(--font-anthropic-body)] md:col-span-5">
            <div>
              <h2 className="font-[family-name:var(--font-anthropic-display)] text-2xl text-[#fff4e4]">
                How long to beat
              </h2>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <dt className="text-[0.65rem] uppercase tracking-widest text-[#f4e9d8]/50">
                    Main
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">{mockGame.hltbMain}</dd>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <dt className="text-[0.65rem] uppercase tracking-widest text-[#f4e9d8]/50">
                    Extras
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">{mockGame.hltbExtras}</dd>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <dt className="text-[0.65rem] uppercase tracking-widest text-[#f4e9d8]/50">
                    100%
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    {mockGame.hltbCompletionist}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-anthropic-display)] text-2xl text-[#fff4e4]">
                Genres
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {mockGame.genres.map((g) => (
                  <li
                    key={g}
                    className="rounded-full border border-[#e8b86d]/35 bg-[#e8b86d]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#ffe7c2]"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-anthropic-display)] text-2xl text-[#fff4e4]">
                Tags
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {mockGame.tags.map((t) => (
                  <li
                    key={t}
                    className="rounded-sm border border-white/15 px-3 py-1 text-xs text-[#f4e9d8]/80"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <details className="group rounded-md border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer font-semibold text-[#fff4e4] outline-none transition group-open:text-[#e8b86d]">
                Pros and cons
              </summary>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
                    Pros
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[#f4e9d8]/85">
                    {mockGame.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300/90">
                    Cons
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[#f4e9d8]/85">
                    {mockGame.cons.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </div>

          <div className="md:col-span-7">
            <div className="relative overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/10 to-transparent p-6 md:p-10">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#e8b86d]/10 blur-2xl" />
              <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-[family-name:var(--font-anthropic-display)] text-3xl text-[#fff4e4]">
                    Review radar
                  </h2>
                  <p className="mt-3 max-w-sm font-[family-name:var(--font-anthropic-body)] text-sm leading-relaxed text-[#f4e9d8]/70">
                    Six axes, same scale as a sports card: punchy, readable, built
                    for at-a-glance comparisons between games in your backlog.
                  </p>
                  <ul className="mt-6 space-y-2 font-[family-name:var(--font-anthropic-body)] text-sm text-[#f4e9d8]/75">
                    {statAxes.map((axis) => (
                      <li key={axis} className="flex items-center justify-between gap-6">
                        <span>{axis}</span>
                        <span className="font-semibold tabular-nums text-[#e8b86d]">
                          {mockGame.stats[axis]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <StatRadar
                  stats={mockGame.stats}
                  fill="#e8b86d"
                  stroke="#ffe7c2"
                  gridStroke="#f4e9d8"
                  labelColor="#f4e9d8"
                  label="Signalis review stats radar chart"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

    </div>
  )
}
