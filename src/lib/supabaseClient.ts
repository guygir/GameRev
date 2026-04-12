import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let browserClient: SupabaseClient | null = null

/** Single browser client — avoids multiple GoTrueClient instances per page. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!url || !anon) return null
  if (!browserClient) browserClient = createClient(url, anon)
  return browserClient
}
