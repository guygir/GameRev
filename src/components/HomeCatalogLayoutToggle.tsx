import clsx from 'clsx'
import type { ReviewMode } from '../review/getReviewTheme'
import type { HomeCatalogLayout } from '../lib/homeCatalogLayoutPreference'

type HomeCatalogLayoutToggleProps = {
  layout: HomeCatalogLayout
  onChange: (layout: HomeCatalogLayout) => void
  mode: ReviewMode
}

export function HomeCatalogLayoutToggle({ layout, onChange, mode }: HomeCatalogLayoutToggleProps) {
  const isLight = mode === 'light'
  const shell = isLight
    ? 'rounded-xl border border-zinc-200 bg-white/90 p-0.5 text-zinc-900 shadow-sm'
    : 'rounded-xl border border-white/15 bg-black/40 p-0.5 text-[#f4e9d8] shadow-sm'

  return (
    <div className={clsx('flex shrink-0 items-center gap-2', shell)} role="group" aria-label="Reviews layout">
      <span className="hidden pl-2 text-[11px] font-medium uppercase tracking-wide opacity-70 sm:inline">
        Layout
      </span>
      <div className="flex rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => onChange('long')}
          className={clsx(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm',
            layout === 'long'
              ? isLight
                ? 'bg-brand text-white'
                : 'bg-[color:var(--review-accent)] text-[#120d0a]'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => onChange('compact')}
          className={clsx(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm',
            layout === 'compact'
              ? isLight
                ? 'bg-brand text-white'
                : 'bg-[color:var(--review-accent)] text-[#120d0a]'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          Compact
        </button>
      </div>
    </div>
  )
}
