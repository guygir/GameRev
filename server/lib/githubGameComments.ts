import { getServiceSupabase } from './supabaseAdmin.js'
import type { ServerProcessEnv } from './serverEnv.js'

const GH_ACCEPT = 'application/vnd.github+json'
const GH_API_VERSION = '2022-11-28'

function parseRepo(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim()
  const i = s.indexOf('/')
  if (i <= 0 || i === s.length - 1) return null
  return { owner: s.slice(0, i), repo: s.slice(i + 1) }
}

function siteBaseUrl(env: ServerProcessEnv): string {
  const explicit = (env.PUBLIC_SITE_URL ?? env.SITE_URL ?? '').trim().replace(/\/+$/, '')
  if (explicit) return explicit
  const v = (env.VERCEL_URL ?? '').trim()
  if (v) return `https://${v}`
  return 'http://localhost:5173'
}

async function ghFetch(
  token: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; text: string }> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: GH_ACCEPT,
      'X-GitHub-Api-Version': GH_API_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* ignore */
  }
  if (!res.ok) return { ok: false, status: res.status, text: text.slice(0, 400) }
  return { ok: true, json }
}

/**
 * After a reader comment is inserted, mirror it to a per-game GitHub issue (create once, then append).
 * Requires `GITHUB_COMMENTS_TOKEN` (fine-grained PAT: Issues read+write) and `GITHUB_COMMENTS_REPO` (`owner/repo`).
 */
export async function syncReaderCommentToGithub(
  env: ServerProcessEnv,
  supabaseUrl: string,
  serviceRoleKey: string,
  commentId: string,
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  const token = (env.GITHUB_COMMENTS_TOKEN ?? '').trim()
  const repoRaw = (env.GITHUB_COMMENTS_REPO ?? '').trim()
  if (!token || !repoRaw) {
    return { ok: true, skipped: true }
  }
  const repo = parseRepo(repoRaw)
  if (!repo) {
    return { ok: false, error: 'Invalid GITHUB_COMMENTS_REPO (expected owner/repo).' }
  }

  const sb = getServiceSupabase(supabaseUrl, serviceRoleKey)
  const { data: row, error: cErr } = await sb
    .from('comments')
    .select('id, body, author_name, created_at, game_id')
    .eq('id', commentId)
    .maybeSingle()

  if (cErr) return { ok: false, error: cErr.message }
  if (!row?.game_id) return { ok: false, error: 'Comment not found.' }

  const { data: game, error: gErr } = await sb
    .from('games')
    .select('id, slug, name, github_issue_number')
    .eq('id', row.game_id as string)
    .maybeSingle()

  if (gErr) return { ok: false, error: gErr.message }
  if (!game?.slug) return { ok: false, error: 'Game not found.' }

  const base = siteBaseUrl(env)
  const reviewUrl = `${base}/g/${game.slug as string}`
  const author = (row.author_name as string | null)?.trim() || 'Anonymous'
  const created = new Date(row.created_at as string).toISOString()
  const bodyText = (row.body as string)?.slice(0, 12_000) ?? ''
  const md = `**${author}** · ${created}\n\n${bodyText}`

  let issueNum = typeof game.github_issue_number === 'number' ? game.github_issue_number : null

  if (issueNum == null) {
    const title = `[GameRev comments] ${(game.name as string).slice(0, 200)}`
    const issueBody = `Reader comments on **${game.name as string}** are mirrored here.\n\nPublic review: ${reviewUrl}\n\n_Game id: \`${game.id}\` · slug: \`${game.slug}\`_`
    const createdIssue = await ghFetch(token, `/repos/${repo.owner}/${repo.repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body: issueBody }),
    })
    if (createdIssue.ok === false) {
      return { ok: false, error: `GitHub create issue: ${createdIssue.status} ${createdIssue.text}` }
    }
    const num = (createdIssue.json as { number?: number })?.number
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      return { ok: false, error: 'GitHub did not return an issue number.' }
    }
    issueNum = num
    const { error: upErr } = await sb
      .from('games')
      .update({ github_issue_number: issueNum })
      .eq('id', game.id as string)
    if (upErr) return { ok: false, error: upErr.message }
  }

  const comment = await ghFetch(token, `/repos/${repo.owner}/${repo.repo}/issues/${issueNum}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: md }),
  })
  if (comment.ok === false) {
    return { ok: false, error: `GitHub add comment: ${comment.status} ${comment.text}` }
  }

  return { ok: true }
}
