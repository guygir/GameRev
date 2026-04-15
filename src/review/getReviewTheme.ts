import {
  darkRadarFromHue,
  DEFAULT_DARK_REVIEW_ACCENT_HUE,
  lightRadarFromHue,
} from './reviewDarkAccent'

export type ReviewMode = 'light' | 'dark'

export type ReviewRadarTheme = {
  fill: string
  stroke: string
  grid: string
  label: string
}

export type ReviewThemeOptions = {
  /** Resolved per-game hue (0–359): dark + light review shells, radar, pills, etc. */
  accentHue?: number
  /** @deprecated Prefer `accentHue` (same value). */
  darkAccentHue?: number
}

/** Single font system: Fraunces (display) + DM Sans (body). */
const TYPOGRAPHY_CHOSEN = {
  fontNav: 'font-[family-name:var(--font-anthropic-body)]',
  fontDisplay: 'font-[family-name:var(--font-anthropic-display)]',
  fontBody: 'font-[family-name:var(--font-anthropic-body)]',
} as const

export type ReviewTheme = {
  mode: ReviewMode
  cover: 'anthropic' | 'light'
  useGrain: boolean
  ambiance: 'anthropic' | 'none'
  shell: string
  fontNav: string
  fontDisplay: string
  fontBody: string
  navMuted: string
  eyebrow: string
  title: string
  subtitle: string
  coverFrame: string
  coverBottomFade: string
  sectionDivider: string
  h2: string
  hltbCard: string
  hltbLabel: string
  hltbValue: string
  genrePill: string
  tagPill: string
  details: string
  summary: string
  prosHeading: string
  consHeading: string
  prosBody: string
  consBody: string
  radarPanel: string
  radarGlow: string
  radarTitle: string
  radarBody: string
  statRow: string
  statValue: string
  radar: ReviewRadarTheme
}

const lightBase = (): Omit<
  ReviewTheme,
  'mode' | 'cover' | 'useGrain' | 'ambiance' | 'shell' | 'radar'
> & { radar: ReviewRadarTheme } => ({
  ...TYPOGRAPHY_CHOSEN,
  navMuted: 'text-zinc-600',
  eyebrow:
    'text-xs font-semibold uppercase tracking-[0.35em] text-[#5b21b6]',
  title:
    'text-5xl font-semibold leading-[0.95] tracking-tight text-zinc-950 md:text-7xl',
  subtitle: 'mt-5 max-w-xl text-base leading-relaxed text-zinc-600 md:text-lg',
  coverFrame:
    'relative aspect-[4/5] w-full max-w-sm rotate-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)] md:max-w-none',
  coverBottomFade:
    'pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-zinc-900/10 to-transparent',
  sectionDivider:
    'mt-14 flex flex-col gap-10 border-t border-zinc-200 pt-10',
  h2: 'text-2xl font-semibold text-zinc-950',
  hltbCard: 'rounded-md border border-zinc-200 bg-white p-3 shadow-sm',
  hltbLabel: 'text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500',
  hltbValue: 'mt-1 text-lg font-semibold text-zinc-900',
  genrePill:
    'rounded-full border border-brand/25 bg-brand/[0.07] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-800',
  tagPill:
    'rounded-sm border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700',
  details: 'group rounded-md border border-zinc-200 bg-white p-4 shadow-sm open:bg-zinc-50',
  /** `<summary>`: match section `<h2>` (display + size); not body UI font. */
  summary:
    'cursor-pointer font-[family-name:var(--font-anthropic-display)] text-2xl font-semibold tracking-tight text-zinc-950 outline-none transition group-open:text-brand',
  prosHeading: 'text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800',
  consHeading: 'text-xs font-semibold uppercase tracking-[0.2em] text-rose-800',
  prosBody: 'mt-2 space-y-2 text-sm leading-relaxed text-zinc-700',
  consBody: 'mt-2 space-y-2 text-sm leading-relaxed text-zinc-700',
  radarPanel:
    'relative overflow-hidden rounded-md border border-zinc-200 bg-white p-2 shadow-sm md:p-3',
  radarGlow:
    'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/15 blur-2xl',
  radarTitle: 'text-3xl font-semibold text-zinc-950',
  radarBody: 'mt-3 max-w-sm text-sm leading-relaxed text-zinc-600',
  statRow: 'text-sm text-zinc-700',
  statValue: 'font-semibold tabular-nums text-brand',
  radar: {
    fill: '#8251ee',
    stroke: '#a37ef5',
    grid: '#64748b',
    label: '#475569',
  },
})

/** Light review with per-game accent (parent sets `reviewLightAccentCssVars`). */
const lightEditorial = (): Omit<
  ReviewTheme,
  'mode' | 'cover' | 'useGrain' | 'ambiance' | 'shell' | 'radar'
> & { radar: ReviewRadarTheme } => ({
  ...TYPOGRAPHY_CHOSEN,
  navMuted: 'text-zinc-600',
  eyebrow: 'text-xs font-semibold uppercase tracking-[0.35em] text-[color:var(--review-accent)]',
  title:
    'text-5xl font-semibold leading-[0.95] tracking-tight text-zinc-950 md:text-7xl',
  subtitle: 'mt-5 max-w-xl text-base leading-relaxed text-zinc-600 md:text-lg',
  coverFrame:
    'relative aspect-[4/5] w-full max-w-sm rotate-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)] md:max-w-none',
  coverBottomFade:
    'pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-zinc-900/10 to-transparent',
  sectionDivider:
    'mt-14 flex flex-col gap-10 border-t border-zinc-200 pt-10',
  h2: 'text-2xl font-semibold text-zinc-950',
  hltbCard: 'rounded-md border border-zinc-200 bg-white p-3 shadow-sm',
  hltbLabel: 'text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500',
  hltbValue: 'mt-1 text-lg font-semibold text-zinc-900',
  genrePill:
    'rounded-full border border-[color:var(--review-accent-border)] bg-[color:var(--review-accent-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--review-accent-bright)]',
  tagPill:
    'rounded-sm border border-[color:var(--review-accent-border)] bg-white px-3 py-1 text-xs font-medium text-zinc-700',
  details: 'group rounded-md border border-[color:var(--review-accent-border)] bg-white p-4 shadow-sm open:bg-[color:var(--review-accent-surface)]',
  summary:
    'cursor-pointer font-[family-name:var(--font-anthropic-display)] text-2xl font-semibold tracking-tight text-zinc-950 outline-none transition group-open:text-[color:var(--review-accent)]',
  prosHeading: 'text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800',
  consHeading: 'text-xs font-semibold uppercase tracking-[0.2em] text-rose-800',
  prosBody: 'mt-2 space-y-2 text-sm leading-relaxed text-zinc-700',
  consBody: 'mt-2 space-y-2 text-sm leading-relaxed text-zinc-700',
  radarPanel:
    'relative overflow-hidden rounded-md border border-[color:var(--review-accent-border)] bg-white p-2 shadow-sm md:p-3',
  radarGlow:
    'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[color:var(--review-accent-glow)] blur-2xl',
  radarTitle: 'text-3xl font-semibold text-zinc-950',
  radarBody: 'mt-3 max-w-sm text-sm leading-relaxed text-zinc-600',
  statRow: 'text-sm text-zinc-700',
  statValue: 'font-semibold tabular-nums text-[color:var(--review-accent)]',
  radar: {
    fill: '#8251ee',
    stroke: '#a37ef5',
    grid: '#64748b',
    label: '#475569',
  },
})

/** Dark editorial tokens; accent hues come from CSS vars on the shell (`reviewDarkAccentCssVars`). */
const darkEditorial = (): Omit<
  ReviewTheme,
  'mode' | 'cover' | 'useGrain' | 'ambiance' | 'shell' | 'radar'
> => ({
  ...TYPOGRAPHY_CHOSEN,
  navMuted: 'text-[#f4e9d8]/70',
  eyebrow: 'text-xs font-semibold uppercase tracking-[0.35em] text-[color:var(--review-accent)]',
  title:
    'text-5xl font-semibold leading-[0.95] tracking-tight text-[#fff4e4] md:text-7xl',
  subtitle: 'mt-5 max-w-xl text-base leading-relaxed text-[#f4e9d8]/75 md:text-lg',
  coverFrame:
    'relative aspect-[4/5] w-full max-w-sm rotate-2 overflow-hidden rounded-sm border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.55)] md:max-w-none',
  coverBottomFade:
    'pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent',
  sectionDivider:
    'mt-14 flex flex-col gap-10 border-t border-white/10 pt-10',
  h2: 'text-2xl font-semibold text-[#fff4e4]',
  hltbCard: 'rounded-md border border-white/10 bg-white/5 p-3',
  hltbLabel: 'text-[0.65rem] uppercase tracking-widest text-[#f4e9d8]/50',
  hltbValue: 'mt-1 text-lg font-semibold text-[#f4e9d8]',
  genrePill:
    'rounded-full border border-[color:var(--review-accent-border)] bg-[color:var(--review-accent-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--review-accent-bright)]',
  tagPill:
    'rounded-sm border border-white/15 px-3 py-1 text-xs text-[#f4e9d8]/80',
  details: 'group rounded-md border border-white/10 bg-black/20 p-4 open:bg-black/30',
  summary:
    'cursor-pointer font-[family-name:var(--font-anthropic-display)] text-2xl font-semibold tracking-tight text-[#fff4e4] outline-none transition group-open:text-[color:var(--review-accent)]',
  prosHeading: 'text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90',
  consHeading: 'text-xs font-semibold uppercase tracking-[0.2em] text-rose-300/90',
  prosBody: 'mt-2 space-y-2 text-sm leading-relaxed text-[#f4e9d8]/85',
  consBody: 'mt-2 space-y-2 text-sm leading-relaxed text-[#f4e9d8]/85',
  radarPanel:
    'relative overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/10 to-transparent p-2 md:p-3',
  radarGlow:
    'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[color:var(--review-accent-glow)] blur-2xl',
  radarTitle: 'text-3xl text-[#fff4e4]',
  radarBody: 'mt-3 max-w-sm text-sm leading-relaxed text-[#f4e9d8]/70',
  statRow: 'text-sm text-[#f4e9d8]/75',
  statValue: 'font-semibold tabular-nums text-[color:var(--review-accent)]',
})

function resolvedAccentHue(opts?: ReviewThemeOptions): number {
  const raw = opts?.accentHue ?? opts?.darkAccentHue
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    let h = Math.round(raw) % 360
    if (h < 0) h += 360
    return h
  }
  return DEFAULT_DARK_REVIEW_ACCENT_HUE
}

/** Pack 1: light (catalog default = brand purple) or light review (per-game accent); editorial dark. */
export function getReviewTheme(mode: ReviewMode, opts?: ReviewThemeOptions): ReviewTheme {
  if (mode === 'light') {
    const hasAccent = opts?.accentHue != null || opts?.darkAccentHue != null
    if (hasAccent) {
      const hue = resolvedAccentHue(opts)
      const t = lightEditorial()
      return {
        mode: 'light',
        cover: 'light',
        useGrain: false,
        ambiance: 'none',
        shell: 'relative min-h-[100dvh] overflow-hidden bg-[#f4f4f5] text-zinc-900',
        ...t,
        radar: lightRadarFromHue(hue),
      }
    }
    const t = lightBase()
    return {
      mode: 'light',
      cover: 'light',
      useGrain: false,
      ambiance: 'none',
      shell: 'relative min-h-[100dvh] overflow-hidden bg-[#f4f4f5] text-zinc-900',
      ...t,
    }
  }

  const hue = resolvedAccentHue(opts)
  const t = darkEditorial()
  return {
    mode: 'dark',
    cover: 'anthropic',
    useGrain: true,
    ambiance: 'anthropic',
    shell: 'grain-bg relative min-h-[100dvh] overflow-hidden bg-[#120d0a] text-[#f4e9d8]',
    ...t,
    radar: darkRadarFromHue(hue),
  }
}

export function parseReviewMode(value: string | null): ReviewMode {
  return value === 'dark' ? 'dark' : 'light'
}
