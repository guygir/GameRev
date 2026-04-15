import { getServiceSupabase } from './supabaseAdmin.js'

type Env = {
  supabaseUrl: string
  serviceRoleKey: string
  addGamePassword: string
}

function requireEnv(env: Env): string | null {
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    return 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
  }
  if (!env.addGamePassword) return 'Missing ADD_GAME_PASSWORD'
  return null
}

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export async function deleteReaderCommentFromBody(
  body: unknown,
  env: Env,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const missing = requireEnv(env)
  if (missing) return { ok: false, status: 503, error: missing }

  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid JSON body' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.password !== 'string' || b.password !== env.addGamePassword) {
    return { ok: false, status: 401, error: 'Invalid password' }
  }

  const commentId = typeof b.commentId === 'string' ? b.commentId.trim() : ''
  if (!UUID_RE.test(commentId)) {
    return { ok: false, status: 400, error: 'Invalid commentId' }
  }

  const slug = typeof b.slug === 'string' ? b.slug.trim() : ''
  if (!slug || slug.length > 120) {
    return { ok: false, status: 400, error: 'Invalid or missing slug' }
  }

  const sb = getServiceSupabase(env.supabaseUrl, env.serviceRoleKey)

  const { data: comment, error: cErr } = await sb
    .from('comments')
    .select('id, game_id')
    .eq('id', commentId)
    .maybeSingle()

  if (cErr) return { ok: false, status: 500, error: cErr.message }
  if (!comment) return { ok: false, status: 404, error: 'Comment not found' }

  const { data: game, error: gErr } = await sb
    .from('games')
    .select('id, slug')
    .eq('id', comment.game_id as string)
    .maybeSingle()

  if (gErr) return { ok: false, status: 500, error: gErr.message }
  if (!game) return { ok: false, status: 404, error: 'Game not found for comment' }
  if ((game.slug as string) !== slug) {
    return { ok: false, status: 403, error: 'Comment does not belong to this review' }
  }

  const { error: dErr } = await sb.from('comments').delete().eq('id', commentId)
  if (dErr) return { ok: false, status: 500, error: dErr.message }

  return { ok: true }
}
