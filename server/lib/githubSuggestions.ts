import { ghFetch, parseGithubRepo, siteBaseUrl } from './githubGameComments.js'
import type { ServerProcessEnv } from './serverEnv.js'

const MAX_SUGGESTION_LENGTH = 500
const MAX_PER_24H = 3
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000
export const SUGGESTION_RATE_COOKIE = 'gamerev_suggestion_rate'

function sanitizeSuggestion(text: string): string {
  return text
    .trim()
    .replace(/[<>\\`]/g, '')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .slice(0, MAX_SUGGESTION_LENGTH)
}

function cookieValue(headers: Record<string, string | string[] | undefined> | undefined, name: string): string | null {
  const raw = headers?.cookie
  const cookieHeader = Array.isArray(raw) ? raw.join('; ') : raw
  if (!cookieHeader) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function parseRateCookie(headers: Record<string, string | string[] | undefined> | undefined): number[] {
  const raw = cookieValue(headers, SUGGESTION_RATE_COOKIE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  } catch {
    return []
  }
}

function rateCookie(timestamps: number[]): string {
  const encoded = encodeURIComponent(JSON.stringify(timestamps))
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SUGGESTION_RATE_COOKIE}=${encoded}; Max-Age=${Math.floor(
    RATE_WINDOW_MS / 1000,
  )}; Path=/; HttpOnly; SameSite=Lax${secure}`
}

export async function createGithubSuggestionFromBody(
  env: ServerProcessEnv,
  body: unknown,
  headers?: Record<string, string | string[] | undefined>,
): Promise<
  | { ok: true; issueUrl: string; headers?: Record<string, string> }
  | { ok: false; status: number; error: string; headers?: Record<string, string> }
> {
  const token = (env.GITHUB_COMMENTS_TOKEN ?? '').trim()
  const repoRaw = (env.GITHUB_COMMENTS_REPO ?? '').trim()
  if (!token || !repoRaw) {
    return { ok: false, status: 503, error: 'Suggestion service is not configured.' }
  }
  const repo = parseGithubRepo(repoRaw)
  if (!repo) {
    return { ok: false, status: 500, error: 'Invalid GITHUB_COMMENTS_REPO (expected owner/repo).' }
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid request.' }
  }

  const input = body as { text?: unknown; pageUrl?: unknown; nickname?: unknown; website?: unknown }
  if (typeof input.website === 'string' && input.website.trim()) {
    return { ok: true, issueUrl: '' }
  }

  const timestamps = parseRateCookie(headers)
  const now = Date.now()
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= MAX_PER_24H) {
    return { ok: false, status: 429, error: 'Rate limit: please try again tomorrow.' }
  }

  const text = sanitizeSuggestion(typeof input.text === 'string' ? input.text : '')
  if (!text) {
    return { ok: false, status: 400, error: 'Please enter a suggestion.' }
  }

  const nickname = sanitizeSuggestion(typeof input.nickname === 'string' ? input.nickname : '').slice(0, 80)
  const rawPageUrl = typeof input.pageUrl === 'string' ? input.pageUrl.trim().slice(0, 500) : ''
  const base = siteBaseUrl(env)
  const pageUrl = rawPageUrl.startsWith('http') ? rawPageUrl : base
  const titleStart = text.replace(/\s+/g, ' ').slice(0, 80)
  const title = `[GameRev suggestion] ${titleStart}`.slice(0, 256)
  const issueBody = `${text}

---
Submitted by: ${nickname || 'Anonymous'}
Page: ${pageUrl}
Date: ${new Date(now).toISOString()}`

  const created = await ghFetch(token, `/repos/${repo.owner}/${repo.repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body: issueBody }),
  })
  if (created.ok === false) {
    return { ok: false, status: 502, error: `GitHub create issue: ${created.status} ${created.text}` }
  }

  const issueUrl = (created.json as { html_url?: string })?.html_url ?? ''
  const nextRate = [...recent, now].slice(-MAX_PER_24H)
  return { ok: true, issueUrl, headers: { 'Set-Cookie': rateCookie(nextRate) } }
}
