/**
 * Free-tier AI detection APIs (tried in order; first configured key wins).
 *
 * - AIDetector.review: https://aidetector.review/api — 1,000 req/day, email hello@aidetector.review
 * - Sapling: https://sapling.ai/api_settings — instant free trial key (50k chars/day)
 * - AIDetectorAPI: https://aidetectorapi.com/signup — 1,000 req/month, self-serve key
 */

export type AiDetectorScore = {
  aiLikelihood: number
  aiVerdict: 'likely human' | 'uncertain' | 'likely AI'
  source: string
}

function verdictFromPercent(p: number): AiDetectorScore['aiVerdict'] {
  if (p < 35) return 'likely human'
  if (p > 65) return 'likely AI'
  return 'uncertain'
}

function percentFromZeroOne(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n * 100)))
}

/** AIDetectorAPI.com — free tier, Bearer token. */
export async function scoreWithAiDetectorApi(
  apiKey: string,
  text: string,
): Promise<AiDetectorScore | { error: string }> {
  const trimmed = text.trim()
  if (trimmed.length < 20) return { error: 'Text too short.' }

  try {
    const res = await fetch('https://aidetectorapi.com/v1/detect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ text: trimmed }),
    })
    const raw = await res.text()
    if (!res.ok) return { error: `AIDetectorAPI HTTP ${res.status}: ${raw.slice(0, 180)}` }

    const json = JSON.parse(raw) as Record<string, unknown>
    const data =
      json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : json
    const score =
      data.score ??
      data.ai_score ??
      data.aiScore ??
      data.probability ??
      data.fakePercentage ??
      data.ai_probability
    if (typeof score === 'number' && Number.isFinite(score)) {
      const p = score <= 1 ? percentFromZeroOne(score) : Math.round(Math.min(100, score))
      return { aiLikelihood: p, aiVerdict: verdictFromPercent(p), source: 'AIDetectorAPI' }
    }
    return { error: `Unrecognized AIDetectorAPI response: ${raw.slice(0, 120)}` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

function parseAiDetectorReviewJson(json: Record<string, unknown>): AiDetectorScore | null {
  const suspicion = json.suspicion_score ?? json.suspicionScore
  if (typeof suspicion !== 'number' || !Number.isFinite(suspicion)) return null
  const p = percentFromZeroOne(suspicion)
  const verdictRaw = typeof json.verdict === 'string' ? json.verdict : ''
  const aiVerdict =
    verdictRaw === 'likely_human'
      ? 'likely human'
      : verdictRaw === 'likely_ai' || verdictRaw === 'possibly_ai'
        ? 'likely AI'
        : verdictFromPercent(p)
  return { aiLikelihood: p, aiVerdict, source: 'AIDetector.review' }
}

/** AIDetector.review — free tier (request key via email). */
export async function scoreWithAiDetectorReview(
  apiKey: string,
  text: string,
): Promise<AiDetectorScore | { error: string }> {
  const trimmed = text.trim()
  if (trimmed.length < 20) return { error: 'Text too short.' }

  const url = 'https://aidetector.review/api/v1/public/scans'
  const body = JSON.stringify({ text: trimmed })
  const authAttempts: { label: string; headers: Record<string, string> }[] = [
    {
      label: 'Bearer',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    },
    {
      label: 'X-API-Key',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': apiKey,
      },
    },
  ]

  const errors: string[] = []
  for (const attempt of authAttempts) {
    try {
      const res = await fetch(url, { method: 'POST', headers: attempt.headers, body })
      const raw = await res.text()
      if (!res.ok) {
        const snippet = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
        errors.push(`${attempt.label} HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`)
        continue
      }
      let json: Record<string, unknown>
      try {
        json = JSON.parse(raw) as Record<string, unknown>
      } catch {
        errors.push(`${attempt.label}: non-JSON response`)
        continue
      }
      const parsed = parseAiDetectorReviewJson(json)
      if (parsed) return parsed
      errors.push(`${attempt.label}: unrecognized JSON`)
    } catch (e) {
      errors.push(`${attempt.label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return {
    error:
      errors.join(' | ') ||
      'AIDetector.review failed. Confirm your key from hello@aidetector.review and that the API is enabled for your account.',
  }
}

/** Sapling AI detect — free trial API key. */
export async function scoreWithSapling(apiKey: string, text: string): Promise<AiDetectorScore | { error: string }> {
  const trimmed = text.trim()
  if (trimmed.length < 20) return { error: 'Text too short.' }
  if (trimmed.length > 200_000) return { error: 'Text exceeds Sapling limit.' }

  try {
    const res = await fetch('https://api.sapling.ai/api/v1/aidetect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        key: apiKey,
        text: trimmed,
        sent_scores: false,
        score_string: false,
      }),
    })
    const raw = await res.text()
    if (!res.ok) return { error: `Sapling HTTP ${res.status}: ${raw.slice(0, 180)}` }

    const json = JSON.parse(raw) as { score?: number }
    if (typeof json.score === 'number' && Number.isFinite(json.score)) {
      const p = percentFromZeroOne(json.score)
      return { aiLikelihood: p, aiVerdict: verdictFromPercent(p), source: 'Sapling' }
    }
    return { error: 'Unrecognized Sapling response.' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export type FreeAiDetectorEnv = {
  AIDETECTORAPI_KEY?: string
  AIDETECTOR_REVIEW_API_KEY?: string
  SAPLING_API_KEY?: string
}

export function hasFreeAiDetectorKey(env: FreeAiDetectorEnv): boolean {
  return Boolean(
    (env.AIDETECTORAPI_KEY ?? '').trim() ||
      (env.AIDETECTOR_REVIEW_API_KEY ?? '').trim() ||
      (env.SAPLING_API_KEY ?? '').trim(),
  )
}

/**
 * Try free detector APIs in priority order. Returns first successful score.
 */
export async function scoreWithFreeAiDetector(
  env: FreeAiDetectorEnv,
  text: string,
): Promise<AiDetectorScore | { error: string }> {
  const providers: { key: string; run: (k: string, t: string) => Promise<AiDetectorScore | { error: string }> }[] =
    []
  const reviewKey = (env.AIDETECTOR_REVIEW_API_KEY ?? '').trim()
  if (reviewKey) providers.push({ key: reviewKey, run: scoreWithAiDetectorReview })
  const saplingKey = (env.SAPLING_API_KEY ?? '').trim()
  if (saplingKey) providers.push({ key: saplingKey, run: scoreWithSapling })
  const apiKey = (env.AIDETECTORAPI_KEY ?? '').trim()
  if (apiKey) providers.push({ key: apiKey, run: scoreWithAiDetectorApi })

  if (!providers.length) {
    return {
      error:
        'No free AI detector key set. Email hello@aidetector.review for AIDETECTOR_REVIEW_API_KEY, or get an instant SAPLING_API_KEY at https://sapling.ai/api_settings — see .env.example.',
    }
  }

  const errors: string[] = []
  for (const p of providers) {
    const out = await p.run(p.key, text)
    if (!('error' in out)) return out
    errors.push(out.error)
  }

  return { error: errors.join(' | ') }
}
