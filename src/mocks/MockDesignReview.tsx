import { mockGame, statAxes } from './mockGame'
import { StatRadar } from '../components/StatRadar'
import { MockNav } from '../components/MockNav'

function CoverArt() {
  return (
    <svg
      viewBox="0 0 360 220"
      className="h-full w-full"
      role="img"
      aria-label="Minimal vector cover for Signalis"
    >
      <rect width="360" height="220" fill="#ffffff" />
      <rect x="0" y="0" width="360" height="8" fill="#111827" />
      <path d="M0 220 L110 90 L190 170 L260 60 L360 200 L360 220 Z" fill="#e5e7eb" />
      <path d="M0 220 L150 120 L240 200 L360 130 L360 220 Z" fill="#d1d5db" />
      <rect x="24" y="32" width="92" height="10" rx="2" fill="#111827" opacity="0.85" />
      <rect x="24" y="52" width="160" height="8" rx="2" fill="#6b7280" opacity="0.55" />
    </svg>
  )
}

export default function MockDesignReview() {
  return (
    <div className="min-h-[100dvh] bg-[#f4f4f5] font-[family-name:var(--font-review)] text-zinc-900">
      <a
        href="#main"
        className="fixed left-3 top-3 z-50 rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-zinc-900 opacity-0 shadow-lg ring-1 ring-zinc-200 transition focus-visible:opacity-100"
      >
        Skip to review
      </a>

      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <MockNav
            crumbs={[{ label: mockGame.name }]}
            className="text-zinc-600"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Share review
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-5xl px-4 py-3 text-sm leading-relaxed text-amber-950">
          <span className="font-semibold">Transparency:</span> playtime figures are
          shown as synced reference data and can be incomplete. Treat them as a
          starting point, not a guarantee.
        </div>
      </div>

      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <article className="space-y-8">
            <header className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <CoverArt />
              </div>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
                  {mockGame.name}
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600">
                  {mockGame.subtitle}
                </p>
              </div>
            </header>

            <section aria-labelledby="facts-heading" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 id="facts-heading" className="text-lg font-semibold text-zinc-950">
                Reference data
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                These fields are the ones you will eventually sync automatically
                (for example from HowLongToBeat-style sources).
              </p>
              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Main story
                  </dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
                    {mockGame.hltbMain}
                  </dd>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Main plus extras
                  </dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
                    {mockGame.hltbExtras}
                  </dd>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Completionist
                  </dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
                    {mockGame.hltbCompletionist}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="taxonomy-heading" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 id="taxonomy-heading" className="text-lg font-semibold text-zinc-950">
                    Genres
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {mockGame.genres.map((g) => (
                      <li key={g}>
                        <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800">
                          {g}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950">Tags</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {mockGame.tags.map((t) => (
                      <li key={t}>
                        <span className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                          {t}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <details className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <summary className="cursor-pointer text-lg font-semibold text-zinc-950">
                Verdict details
              </summary>
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800">Pros</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
                    {mockGame.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-rose-800">Cons</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
                    {mockGame.cons.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </article>

          <aside className="space-y-6 lg:sticky lg:top-8">
            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-950">Stat card</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                A radar keeps comparisons fair: every axis uses the same 0 to 100
                scale.
              </p>
              <div className="mt-6 flex flex-col items-center">
                <StatRadar
                  stats={mockGame.stats}
                  fill="#2563eb"
                  stroke="#1d4ed8"
                  gridStroke="#64748b"
                  labelColor="#334155"
                  label="Signalis review stats radar chart"
                />
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-950">Axis breakdown</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {statAxes.map((axis) => (
                  <li
                    key={axis}
                    className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="text-zinc-700">{axis}</span>
                    <span className="font-semibold tabular-nums text-zinc-950">
                      {mockGame.stats[axis]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
