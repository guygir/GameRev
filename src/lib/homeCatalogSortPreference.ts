export type HomeCatalogSort = 'date' | 'rank'

const STORAGE_KEY = 'gamerev:catalogSort'

export function readHomeCatalogSortPreference(): HomeCatalogSort {
  if (typeof window === 'undefined') return 'date'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'date' || v === 'rank') return v
  } catch {
    /* ignore */
  }
  return 'date'
}

export function writeHomeCatalogSortPreference(sort: HomeCatalogSort): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, sort)
  } catch {
    /* ignore */
  }
}
