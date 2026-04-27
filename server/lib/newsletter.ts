import type { ServerProcessEnv } from './serverEnv.js'

const BUTTONDOWN_API_URL = 'https://api.buttondown.email/v1'
const DEFAULT_PUBLIC_SITE_URL = 'https://game-rev.vercel.app'

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length < 3 || email.length > 320) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildNewReviewNewsletterDraft(
  env: { PUBLIC_SITE_URL?: string; SITE_URL?: string },
  review: { slug: string; name: string; subtitle: string },
): { subject: string; body: string; reviewUrl: string } {
  const base = (env.PUBLIC_SITE_URL ?? env.SITE_URL ?? DEFAULT_PUBLIC_SITE_URL).trim().replace(/\/+$/, '')
  const reviewUrl = `${base}/g/${encodeURIComponent(review.slug)}`
  const safeReviewUrl = escapeHtml(reviewUrl)
  return {
    subject: `New GameRev review: ${review.name}`,
    reviewUrl,
    body: `<style>
a { color: #8251ee !important; }
.newsletter-colophon a, .colophon a, .newsletter-footer a { color: #8251ee !important; }
</style>

# ${escapeHtml(review.name)}

${escapeHtml(review.subtitle)}

Read the review:<br>
<a href="${safeReviewUrl}" style="color:#8251ee !important;text-decoration:underline;">${safeReviewUrl}</a>`,
  }
}

async function buttondownFetch(
  env: ServerProcessEnv,
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; error: string }> {
  const key = (env.BUTTONDOWN_API_KEY ?? '').trim()
  if (!key) return { ok: false, status: 503, error: 'BUTTONDOWN_API_KEY is not configured.' }
  const res = await fetch(`${BUTTONDOWN_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const detail =
      typeof (json as { detail?: unknown } | null)?.detail === 'string'
        ? (json as { detail: string }).detail
        : text.slice(0, 300)
    return { ok: false, status: res.status, error: `Buttondown: ${res.status} ${detail}` }
  }
  return { ok: true, json }
}

export async function subscribeNewsletterFromBody(
  body: unknown,
  env: ServerProcessEnv,
): Promise<{ ok: true; message: string } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail((body as { email?: unknown } | null)?.email)
  if (!email) return { ok: false, status: 400, error: 'Enter a valid email address.' }

  const out = await buttondownFetch(
    env,
    '/subscribers',
    {
      email_address: email,
      type: 'unactivated',
      metadata: {
        source: 'gamerev-home',
      },
    },
    {
      // If the address already exists, Buttondown should keep subscriber state rather than failing the UX.
      'X-Buttondown-Collision-Behavior': 'add',
    },
  )
  if (out.ok === false) return { ok: false, status: out.status, error: out.error }
  return {
    ok: true,
    message: 'Check your email for a confirmation link.\nThis might take a while... Go read a review in the meantime!',
  }
}

export async function sendNewReviewNewsletter(
  env: ServerProcessEnv,
  review: { slug: string; name: string; subtitle: string },
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  if (!(env.BUTTONDOWN_API_KEY ?? '').trim()) return { ok: true, skipped: true }
  const draftPayload = buildNewReviewNewsletterDraft(env, review)
  const draft = await buttondownFetch(env, '/emails', {
    subject: draftPayload.subject,
    body: draftPayload.body,
    status: 'draft',
  })
  if (draft.ok === false) return { ok: false, error: draft.error }

  const emailId = typeof (draft.json as { id?: unknown } | null)?.id === 'string' ? (draft.json as { id: string }).id : ''
  if (!emailId) return { ok: false, error: 'Buttondown did not return a draft email id.' }

  const send = await buttondownFetch(env, `/emails/${encodeURIComponent(emailId)}`, { status: 'about_to_send' }, undefined, 'PATCH')
  if (send.ok === false) return { ok: false, error: send.error }
  return { ok: true }
}
