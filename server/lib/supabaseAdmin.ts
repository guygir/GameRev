import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getServiceSupabase(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
