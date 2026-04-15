import clsx from 'clsx'
import type { ReviewMode } from '../review/getReviewTheme'

type ReviewModeToggleProps = {
  mode: ReviewMode
  onChange: (mode: ReviewMode) => void
  /** `home`: dark zinc bar. `review`: matches current review shell (light vs editorial dark). */
  surface: 'home' | 'review'
}

export function ReviewModeToggle({ mode, onChange, surface }: ReviewModeToggleProps) {
  const shell =
    surface === 'home'
      ? 'rounded-xl border border-zinc-600 bg-zinc-900/90 p-0.5 text-zinc-200 shadow-sm'
      : mode === 'light'
        ? 'rounded-xl border border-zinc-200 bg-white/90 p-0.5 text-zinc-900 shadow-sm'
        : 'rounded-xl border border-white/15 bg-black/40 p-0.5 text-[#f4e9d8] shadow-sm'

  return (
    <div className={clsx('flex shrink-0 items-center gap-2', shell)} role="group" aria-label="Review appearance">
      <span className="hidden pl-2 text-[11px] font-medium uppercase tracking-wide opacity-70 sm:inline">Appearance</span>
      <div className="flex rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => onChange('light')}
          className={clsx(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm',
            mode === 'light'
              ? surface === 'home'
                ? 'bg-emerald-500/25 text-emerald-100'
                : 'bg-[color:var(--review-accent,#8251ee)] text-white'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => onChange('dark')}
          className={clsx(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm',
            mode === 'dark'
              ? surface === 'home'
                ? 'bg-violet-500/30 text-violet-100'
                : 'bg-[color:var(--review-accent)] text-[#120d0a]'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          Dark
        </button>
      </div>
    </div>
  )
}
