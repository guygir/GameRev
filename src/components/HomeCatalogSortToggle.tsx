import clsx from 'clsx'
import type { ReviewMode } from '../review/getReviewTheme'
import type { HomeCatalogSort } from '../lib/homeCatalogSortPreference'

type HomeCatalogSortToggleProps = {
  sort: HomeCatalogSort
  onChange: (sort: HomeCatalogSort) => void
  mode: ReviewMode
}

export function HomeCatalogSortToggle({ sort, onChange, mode }: HomeCatalogSortToggleProps) {
  const isLight = mode === 'light'
  const shell = isLight
    ? 'rounded-xl border border-zinc-200 bg-white/90 p-0.5 text-zinc-900 shadow-sm'
    : 'rounded-xl border border-white/15 bg-black/40 p-0.5 text-[#f4e9d8] shadow-sm'

  return (
    <div className={clsx('flex shrink-0 items-center gap-2', shell)} role="group" aria-label="Reviews sort">
      <span className="hidden pl-2 text-[11px] font-medium uppercase tracking-wide opacity-70 sm:inline">
        Sort
      </span>
      <div className="flex rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => onChange('date')}
          className={clsx(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm',
            sort === 'date'
              ? isLight
                ? 'bg-brand text-white'
                : 'bg-[color:var(--review-accent)] text-[#120d0a]'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          Date
        </button>
        <button
          type="button"
          onClick={() => onChange('rank')}
          className={clsx(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm',
            sort === 'rank'
              ? isLight
                ? 'bg-brand text-white'
                : 'bg-[color:var(--review-accent)] text-[#120d0a]'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          Rank
        </button>
      </div>
    </div>
  )
}
