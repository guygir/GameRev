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
 * Order: 2.5 Flash-Lite, 2.5 Flash, then 3.8 Flash. `gemini-flash-latest` is the alias fallback.
 * UI may pick a whitelisted model first; otherwise `GEMINI_MODEL` prepends the default list when it is still allowed.
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

const REFINE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestedTags: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedPlayIfLiked: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedPros: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedCons: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['suggestedTags', 'suggestedPlayIfLiked', 'suggestedPros', 'suggestedCons'],
} as const

/**
 * Gemini 3 counts thinking tokens against `maxOutputTokens` and rejects sampling params.
 * 2.5 Flash thinks unless `thinkingBudget` is 0, which was cutting outline JSON off mid-array.
 */
export function geminiJsonGenerationConfig(
  model: string,
  opts: { maxOutputTokens: number; temperature?: number; responseSchema?: Record<string, unknown> },
): Record<string, unknown> {
  const gemini3 = model.startsWith('gemini-3')
  const config: Record<string, unknown> = {
    maxOutputTokens: gemini3 ? Math.max(opts.maxOutputTokens, 8192) : opts.maxOutputTokens,
    responseMimeType: 'application/json',
  }
  if (opts.responseSchema) config.responseSchema = opts.responseSchema
  if (gemini3) {
    config.thinkingConfig = { thinkingLevel: 'low' }
    return config
  }
  if (opts.temperature != null) config.temperature = opts.temperature
  if (model.includes('2.5') || model.includes('2.0')) {
    config.thinkingConfig = { thinkingBudget: 0 }
  }
  return config
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

const REFINE_KEYS = ['suggestedTags', 'suggestedPlayIfLiked', 'suggestedPros', 'suggestedCons'] as const

function stringList(value: unknown, max: number, itemMax = 240): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((s) => s.slice(0, itemMax).trim())
    .filter(Boolean)
}

function outputFromRecord(o: Record<string, unknown>): LlmRefineOutput | null {
  if (!REFINE_KEYS.every((k) => Array.isArray(o[k]))) return null
  return {
    suggestedTags: stringList(o.suggestedTags, 14, 80),
    suggestedPlayIfLiked: stringList(o.suggestedPlayIfLiked, 10),
    suggestedPros: stringList(o.suggestedPros, 8),
    suggestedCons: stringList(o.suggestedCons, 8),
  }
}

function tryParseObject(slice: string): Record<string, unknown> | null {
  for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const o = JSON.parse(candidate) as unknown
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>
    } catch {
      /* next */
    }
  }
  return null
}

/** Close a JSON object that stopped mid-string or mid-array (Gemini MAX_TOKENS). */
function repairTruncatedJson(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let s = raw.slice(start)
  const stack: Array<'{' | '['> = []
  let inString = false
  let escape = false
  let stringStart = -1

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') {
        inString = false
        stringStart = -1
      }
      continue
    }
    if (c === '"') {
      inString = true
      stringStart = i
      continue
    }
    if (c === '{') stack.push('{')
    else if (c === '[') stack.push('[')
    else if (c === '}' || c === ']') {
      const open = stack.pop()
      if (!open) return null
      if ((c === '}' && open !== '{') || (c === ']' && open !== '[')) return null
    }
  }

  if (!inString && !escape && stack.length === 0) return null
  if (inString || escape) {
    if (stringStart < 0) return null
    s = s.slice(0, stringStart)
  }
  s = s.replace(/,\s*$/, '').replace(/,?\s*"[^"\\]*"\s*:\s*$/, '')
  while (stack.length) {
    const open = stack.pop()
    s += open === '[' ? ']' : '}'
  }
  return s
}

function quotedStringsIn(body: string, max: number): string[] {
  const out: string[] = []
  const re = /"((?:\\.|[^"\\])*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) && out.length < max) {
    const s = m[1]!.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\t/g, ' ').trim()
    if (s) out.push(s)
  }
  return out
}

/** Pull the four arrays out of JSON that is truncated or has junk after a closed string. */
function extractRefineArrays(raw: string): LlmRefineOutput | null {
  if (!REFINE_KEYS.every((k) => new RegExp(`"${k}"\\s*:`).test(raw))) return null
  const out: Record<string, string[]> = {}
  for (const key of REFINE_KEYS) {
    const keyRe = new RegExp(`"${key}"\\s*:\\s*\\[`)
    const found = keyRe.exec(raw)
    if (!found) return null
    const from = found.index + found[0].length
    const close = raw.indexOf(']', from)
    const body = close >= 0 ? raw.slice(from, close) : raw.slice(from)
    const max = key === 'suggestedTags' ? 14 : key === 'suggestedPlayIfLiked' ? 10 : 8
    out[key] = quotedStringsIn(body, max).map((s) => s.slice(0, key === 'suggestedTags' ? 80 : 240).trim()).filter(Boolean)
  }
  return outputFromRecord(out)
}

function parseJsonObject(raw: string): LlmRefineOutput | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const parsed = tryParseObject(trimmed.slice(start, end + 1))
    const out = parsed ? outputFromRecord(parsed) : null
    if (out) return out
  }
  const repaired = repairTruncatedJson(trimmed)
  if (repaired) {
    const parsed = tryParseObject(repaired)
    const out = parsed ? outputFromRecord(parsed) : null
    if (out) return out
  }
  return extractRefineArrays(trimmed)
}

type GeminiPart = { text?: string; thought?: boolean }

function geminiCandidateText(json: unknown): { text: string; finishReason: string } {
  if (!json || typeof json !== 'object') return { text: '', finishReason: '' }
  const candidates = (json as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return { text: '', finishReason: '' }
  const c0 = candidates[0]
  if (!c0 || typeof c0 !== 'object') return { text: '', finishReason: '' }
  const finishReason =
    typeof (c0 as { finishReason?: unknown }).finishReason === 'string'
      ? (c0 as { finishReason: string }).finishReason
      : ''
  const parts = (c0 as { content?: { parts?: GeminiPart[] } }).content?.parts
  if (!Array.isArray(parts)) return { text: '', finishReason }
  const withText = parts.filter((p): p is GeminiPart & { text: string } => typeof p?.text === 'string')
  const visible = withText.filter((p) => !p.thought)
  const chosen = visible.length > 0 ? visible : withText
  return { text: chosen.map((p) => p.text).join(''), finishReason }
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
    let configLevel = 0

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
              generationConfig:
                configLevel === 0
                  ? geminiJsonGenerationConfig(model, {
                      maxOutputTokens: 8192,
                      temperature: 0.35,
                      responseSchema: { ...REFINE_RESPONSE_SCHEMA },
                    })
                  : configLevel === 1
                    ? geminiJsonGenerationConfig(model, {
                        maxOutputTokens: 8192,
                        temperature: 0.35,
                      })
                    : {
                        temperature: 0.35,
                        maxOutputTokens: 8192,
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
          if (res.status === 400 && configLevel < 2) {
            configLevel += 1
            attemptNotes.push(`${line} (retrying with a simpler generation config)`)
            continue attempts
          }
          if (res.status === 404 || res.status === 400) {
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

        const { text, finishReason } = geminiCandidateText(json)
        if (!text) {
          attemptNotes.push(`HTTP 200 but no model text (${geminiEmptyOutputHint(json)})`)
          break attempts
        }
        const parsed = parseJsonObject(text)
        if (parsed) return parsed
        const preview = text.replace(/\s+/g, ' ').slice(0, 160)
        const why = finishReason ? ` finishReason=${finishReason}` : ''
        attemptNotes.push(
          `HTTP 200 but outline JSON invalid or incomplete${why} (snippet: ${preview}${text.length > 160 ? '…' : ''})`,
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
