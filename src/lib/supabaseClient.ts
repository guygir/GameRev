import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Stable across HMR and duplicate imports so only one GoTrue client exists per tab. */
const GLOBAL_KEY = '__GameRev_supabase_browser__' as const

type GlobalWithSupabase = typeof globalThis & {
  [GLOBAL_KEY]?: SupabaseClient | null
}

/**
 * Single browser Supabase client per tab (globalThis), with no persisted auth session.
 * Avoids “Multiple GoTrueClient instances” when the module is evaluated more than once.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!url || !anon) return null
  const g = globalThis as GlobalWithSupabase
  if (g[GLOBAL_KEY] === undefined) {
    g[GLOBAL_KEY] = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return g[GLOBAL_KEY] ?? null
}
