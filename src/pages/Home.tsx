import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseBrowser } from '../lib/supabaseClient'

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

  return (
    <div className="min-h-[100dvh] bg-zinc-950 px-4 py-14 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">GameRev</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">GameRev</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Long-form reviews with a Pack 1 layout (Fraunces + DM Sans), radar stats, and HowLongToBeat callouts.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/review"
            className="inline-flex rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300"
          >
            Sample review (Signalis)
          </Link>
          <Link
            to="/addgame"
            className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-emerald-500/40"
          >
            Add a game
          </Link>
        </div>

        <p className="mt-12 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Reviews</p>
        {!sb ? (
          <p className="mt-4 text-sm text-zinc-500">
            Set <span className="font-mono">VITE_SUPABASE_URL</span> and{' '}
            <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to list reviews from Supabase.
          </p>
        ) : loadErr ? (
          <p className="mt-4 text-sm text-rose-300">{loadErr}</p>
        ) : games.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No reviews yet. Add one with “Add a game”.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {games.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/g/${g.slug}`}
                  className="group block overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-950/35 transition hover:border-emerald-400/50 hover:bg-emerald-950/50"
                >
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-stretch">
                    <div className="relative aspect-[4/5] w-full shrink-0 overflow-hidden rounded-lg border border-emerald-500/20 bg-zinc-900 sm:w-36">
                      {g.cover_image_url ? (
                        <img src={g.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-500">No art</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-white group-hover:text-emerald-100">{g.name}</h2>
                      {g.subtitle ? (
                        <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">{g.subtitle}</p>
                      ) : null}
                      <span className="mt-4 inline-flex text-sm font-semibold text-emerald-300/90">Read review →</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-14 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Archived mocks</p>
        <ul className="mt-4 space-y-4">
          {mockVariants.map((v) => (
            <li key={v.to}>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 transition hover:border-amber-500/50 hover:bg-zinc-900">
                <Link to={v.to} className="group block p-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white group-hover:text-amber-200">{v.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{v.blurb}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-amber-400/90 md:pt-1">Open mock</span>
                  </div>
                </Link>
                <a
                  className="block px-5 pb-5 text-xs text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
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
