import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function getSupabaseBrowser() {
  if (!url || !anon) return null
  return createClient(url, anon)
}
