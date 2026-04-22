import {
  BACKLOGGD_GEMINI_TRY_MODELS,
  isAllowedBackloggdGeminiModel,
} from '../../src/lib/geminiBackloggdModels.js'
import type { ServerProcessEnv } from './serverEnv.js'

/**
 * Optional cloud LLM pass for Backloggd-derived tags, play-if-liked, pros, and cons.
 * Uses OpenAI (paid, cheap on gpt-4o-mini) or Google Gemini (often has a free tier) — no local GPU.
 */

export type LlmRefineInput = {
  gameTitle: string
  genres: string[]
  reviewSnippets: string[]
}

export type LlmRefineOutput = {
  suggestedTags: string[]
  suggestedPlayIfLiked: string[]
  suggestedPros: string[]
  suggestedCons: string[]
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Retry same model / rotate models on overload or gateway errors (Google often returns 503 under load). */
const GEMINI_TRANSIENT_HTTP = new Set([429, 502, 503])

function shortenGeminiErrorBody(raw: string): string {
  const slice = raw.slice(0, 400).trim()
  try {
    const j = JSON.parse(slice) as { error?: { message?: string; code?: number | string } }
    const m = j.error?.message
    if (typeof m === 'string' && m.trim()) {
      const c = j.error?.code
      return c != null && c !== '' ? `${m} (${c})` : m
    }
  } catch {
    /* ignore */
  }
  return slice
}

/** Longer than OpenAI: Gemini occasionally queues; short timeouts look like flaky “empty” failures. */
const GEMINI_GENERATE_TIMEOUT_MS = 90_000

function geminiEmptyOutputHint(json: unknown): string {
  if (json == null || typeof json !== 'object') return 'response not a JSON object'
  const j = json as Record<string, unknown>
  const pf = j.promptFeedback
  if (pf && typeof pf === 'object') {
    const br = (pf as Record<string, unknown>).blockReason
    if (typeof br === 'string' && br.trim()) return `promptFeedback.blockReason=${br}`
  }
  const candidates = j.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return 'candidates missing or empty'
  const c0 = candidates[0]
  if (c0 && typeof c0 === 'object') {
    const fr = (c0 as Record<string, unknown>).finishReason
    if (typeof fr === 'string' && fr.trim()) return `finishReason=${fr}`
  }
  return 'first candidate has no text part'
}

function formatGeminiPerModelReport(lines: string[]): string {
  return lines.map((l) => `• ${l}`).join('\n')
}

/**
 * Order: try newer Flash / Flash-Lite first; `gemini-flash-latest` last as an alias fallback.
 * UI may pick a whitelisted free-tier model first; otherwise `GEMINI_MODEL` prepends the default list.
 * @see https://ai.google.dev/pricing
 * @see https://ai.google.dev/gemini-api/docs/rate-limits
 */
function dedupeModelOrder(models: string[]): string[] {
  const seen = new Set<string>()
  return models.filter((m) => {
    if (seen.has(m)) return false
    seen.add(m)
    return true
  })
}

/** Shared with other editor LLM routes (e.g. review capsule summary). */
export function geminiModelsToTry(env: ServerProcessEnv, uiPreferred?: string | null): string[] {
  const tryList = [...BACKLOGGD_GEMINI_TRY_MODELS] as string[]
  const preferred = (uiPreferred ?? '').trim()
  if (preferred && isAllowedBackloggdGeminiModel(preferred)) {
    return dedupeModelOrder([preferred, ...tryList.filter((m) => m !== preferred)])
  }
  const primary = (env.GEMINI_MODEL ?? '').trim()
  // Only prepend env model when it matches the UI whitelist; unknown IDs (or retired names) get 404 and would waste the first attempts.
  const ordered =
    primary && isAllowedBackloggdGeminiModel(primary) ? [primary, ...tryList] : [...tryList]
  return dedupeModelOrder(ordered)
}

function buildPrompt(input: LlmRefineInput): string {
  const payload = {
    gameTitle: input.gameTitle,
    genres: input.genres,
    snippets: input.reviewSnippets.map((s) => (s.length > 900 ? `${s.slice(0, 897)}…` : s)),
  }
  return `You help a solo game-review editor fill a structured outline for ONE game: "${input.gameTitle}".

You are given short excerpts from Backloggd user reviews (third-party, informal). They are NOT authoritative and must NOT be copied verbatim.

Task:
1) suggestedTags: up to 12 short site tags (1–3 words each, Title Case). Mix Backloggd genres when relevant with themes, mechanics, tone, or audience (e.g. Roguelike, Co-op, Story-heavy). No hashtags, no URLs, no full sentences.
2) suggestedPlayIfLiked: up to 8 OTHER game titles (or well-known series) readers might also enjoy — inferred from comparisons, tone, or genre. One title per string, no numbering, no URLs.
3) suggestedPros: up to 6 short editorial bullets (your own phrasing) about strengths, grouped by idea (presentation, story, systems, etc. when relevant). No quotes from reviewers; no "users say".
4) suggestedCons: up to 6 short editorial bullets about weaknesses or friction, same rules.

Return ONLY valid JSON with exactly these keys and string arrays (arrays may be shorter if little signal):
{"suggestedTags":[],"suggestedPlayIfLiked":[],"suggestedPros":[],"suggestedCons":[]}

INPUT:
${JSON.stringify(payload)}`
}

function parseJsonObject(raw: string): LlmRefineOutput | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const o = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    const arr = (k: string, max: number): string[] => {
      const v = o[k]
      if (!Array.isArray(v)) return []
      return v
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max)
    }
    const tagArr = arr('suggestedTags', 14).map((s) => s.slice(0, 80).trim()).filter(Boolean)
    return {
      suggestedTags: tagArr,
      suggestedPlayIfLiked: arr('suggestedPlayIfLiked', 10),
      suggestedPros: arr('suggestedPros', 8),
      suggestedCons: arr('suggestedCons', 8),
    }
  } catch {
    return null
  }
}

async function refineOpenAi(key: string, input: LlmRefineInput): Promise<LlmRefineOutput | null> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 45_000)
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output only compact JSON for a review editor tool.' },
          { role: 'user', content: buildPrompt(input) },
        ],
      }),
    })
    const rawText = await res.text()
    if (!res.ok) {
      let err = rawText.slice(0, 200)
      try {
        const j = JSON.parse(rawText) as { error?: { message?: string } }
        err = j.error?.message ?? err
      } catch {
        /* ignore */
      }
      throw new Error(`OpenAI: ${err}`)
    }
    const json = JSON.parse(rawText) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content
    if (!content) return null
    return parseJsonObject(content)
  } finally {
    clearTimeout(t)
  }
}

async function refineGemini(
  key: string,
  models: string[],
  input: LlmRefineInput,
): Promise<LlmRefineOutput | null> {
  const maxAttemptsPerModel = 3
  const perModelLines: string[] = []

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const attemptNotes: string[] = []

    attempts: for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), GEMINI_GENERATE_TIMEOUT_MS)
      try {
        let res: Response
        try {
          res = await fetch(url, {
            method: 'POST',
            signal: ac.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildPrompt(input) }] }],
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
              },
            }),
          })
        } catch (err) {
          const name = err instanceof Error ? err.name : 'Error'
          const msg = err instanceof Error ? err.message : String(err)
          if (name === 'AbortError') {
            attemptNotes.push(
              `request aborted after ${GEMINI_GENERATE_TIMEOUT_MS}ms (client timeout; not necessarily Google’s deadline)`,
            )
          } else {
            attemptNotes.push(`fetch error (${name}): ${msg}`)
          }
          break attempts
        }

        const rawText = await res.text()
        if (!res.ok) {
          const body = shortenGeminiErrorBody(rawText)
          const att = attempt > 0 ? `attempt ${attempt + 1}: ` : ''
          const line = `${att}HTTP ${res.status}: ${body}`
          if (res.status === 404) {
            attemptNotes.push(line)
            break attempts
          }
          if (GEMINI_TRANSIENT_HTTP.has(res.status) && attempt < maxAttemptsPerModel - 1) {
            await sleep(700 * 2 ** attempt + Math.floor(Math.random() * 250))
            continue attempts
          }
          if (GEMINI_TRANSIENT_HTTP.has(res.status)) {
            attemptNotes.push(`${line} (${maxAttemptsPerModel} HTTP attempts)`)
            break attempts
          }
          attemptNotes.push(line)
          throw new Error(
            `Gemini: ${line}\n${formatGeminiPerModelReport([...perModelLines, `${model}: ${attemptNotes.join(' | ')}`])}`,
          )
        }

        let json: unknown
        try {
          json = JSON.parse(rawText) as unknown
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          attemptNotes.push(`HTTP 200 but body is not JSON: ${m}`)
          break attempts
        }

        const typed = json as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        const text = typed.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          attemptNotes.push(`HTTP 200 but no model text (${geminiEmptyOutputHint(json)})`)
          break attempts
        }
        const parsed = parseJsonObject(text)
        if (parsed) return parsed
        const preview = text.replace(/\s+/g, ' ').slice(0, 160)
        attemptNotes.push(
          `HTTP 200 but outline JSON invalid or incomplete (snippet: ${preview}${text.length > 160 ? '…' : ''})`,
        )
        break attempts
      } finally {
        clearTimeout(t)
      }
    }

    perModelLines.push(
      attemptNotes.length > 0
        ? `${model}: ${attemptNotes.join(' | ')}`
        : `${model}: stopped with no error detail (unexpected)`,
    )
  }

  throw new Error(
    `Gemini: no model returned usable JSON.\n${formatGeminiPerModelReport(perModelLines)}`,
  )
}

function nonempty(out: LlmRefineOutput): boolean {
  return (
    out.suggestedTags.length > 0 ||
    out.suggestedPros.length > 0 ||
    out.suggestedCons.length > 0 ||
    out.suggestedPlayIfLiked.length > 0
  )
}

export async function refineBackloggdWithLlm(
  env: ServerProcessEnv,
  input: LlmRefineInput,
  opts?: { geminiModel?: string | null },
): Promise<{ ok: true; data: LlmRefineOutput } | { ok: false; error: string }> {
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()

  if (!openai && !gemini) {
    return { ok: false, error: 'No OPENAI_API_KEY or GEMINI_API_KEY on the server.' }
  }

  if (openai) {
    try {
      const out = await refineOpenAi(openai, input)
      if (out && nonempty(out)) return { ok: true, data: out }
    } catch (e) {
      if (!gemini) {
        return { ok: false, error: e instanceof Error ? e.message : 'OpenAI request failed' }
      }
    }
  }

  if (gemini) {
    try {
      const out = await refineGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), input)
      if (out && nonempty(out)) return { ok: true, data: out }
      return { ok: false, error: 'Gemini returned no usable JSON.' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Gemini request failed' }
    }
  }

  return { ok: false, error: 'OpenAI returned no usable JSON and Gemini key is not set.' }
}
