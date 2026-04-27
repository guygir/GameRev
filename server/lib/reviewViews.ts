import { createHash } from 'node:crypto'
import { getServiceSupabase } from './supabaseAdmin.js'

type Env = {
  supabaseUrl: string
  serviceRoleKey: string
}

function hashUserAgent(userAgent: string | undefined): string | null {
  const ua = (userAgent ?? '').trim()
  if (!ua) return null
  return createHash('sha256').update(ua).digest('hex').slice(0, 32)
}

export async function recordReviewViewFromBody(
  body: unknown,
  env: Env,
  headers?: Record<string, string | string[] | undefined>,
): Promise<{ ok: true; viewCount: number; inserted: boolean } | { ok: false; status: number; error: string }> {
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    return { ok: false, status: 503, error: 'Supabase is not configured on the server' }
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid JSON body' }
  }
  const raw = body as { slug?: unknown; visitorKey?: unknown }
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : ''
  const visitorKey = typeof raw.visitorKey === 'string' ? raw.visitorKey.trim() : ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, status: 400, error: 'Invalid review slug.' }
  }
  if (!/^[A-Za-z0-9:_-]{16,128}$/.test(visitorKey)) {
    return { ok: false, status: 400, error: 'Invalid visitor key.' }
  }

  const uaRaw = headers?.['user-agent']
  const ua = Array.isArray(uaRaw) ? uaRaw.join(' ') : uaRaw
  const sb = getServiceSupabase(env.supabaseUrl, env.serviceRoleKey)
  const { data, error } = await sb.rpc('record_review_view', {
    p_slug: slug,
    p_visitor_key: visitorKey,
    p_user_agent_hash: hashUserAgent(ua),
  })
  if (error) return { ok: false, status: /not found/i.test(error.message) ? 404 : 500, error: error.message }

  const first = Array.isArray(data) ? data[0] : data
  const viewCount = typeof first?.view_count === 'number' ? first.view_count : 0
  const inserted = first?.inserted === true
  return { ok: true, viewCount, inserted }
}
