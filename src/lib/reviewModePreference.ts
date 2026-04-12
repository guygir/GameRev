import type { ReviewMode } from '../review/getReviewTheme'

const STORAGE_KEY = 'gamerev:reviewAppearance'

export function readReviewModePreference(): ReviewMode {
  if (typeof window === 'undefined') return 'light'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

export function writeReviewModePreference(mode: ReviewMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

/** URL `?mode=` wins when present; otherwise saved preference (default light). */
export function resolveReviewMode(searchParam: string | null): ReviewMode {
  if (searchParam === 'dark' || searchParam === 'light') return searchParam
  return readReviewModePreference()
}
