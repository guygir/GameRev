export type HomeCatalogLayout = 'long' | 'compact'

const STORAGE_KEY = 'gamerev:catalogLayout'

export function readHomeCatalogLayoutPreference(): HomeCatalogLayout {
  if (typeof window === 'undefined') return 'compact'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'long' || v === 'compact') return v
  } catch {
    /* ignore */
  }
  return 'compact'
}

export function writeHomeCatalogLayoutPreference(layout: HomeCatalogLayout): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, layout)
  } catch {
    /* ignore */
  }
}
