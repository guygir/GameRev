import { geminiModelsToTry } from './backloggdLlmRefine.js'
import type { ServerProcessEnv } from './serverEnv.js'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

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

function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function buildSummaryPrompt(gameName: string, pros: string, cons: string): string {
  return `You help a solo game-review editor write a short capsule for the public review page.

Game title: ${JSON.stringify(gameName)}

Editor's Pros (may be bullets or notes — synthesize, do not copy verbatim):
${JSON.stringify(clip(pros, 8000))}

Editor's Cons (same rules):
${JSON.stringify(clip(cons, 8000))}

Write ONE concise paragraph (about 3–6 sentences): editorial, skimmable, no spoilers, no markdown, no leading title line, no bullet characters. Weave strengths and weaknesses naturally; avoid "pros:" / "cons:" labels.

Return ONLY valid JSON with exactly this shape:
{"summary":"..."}`
}

function parseSummaryJson(raw: string): string | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const o = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    const s = o.summary
    if (typeof s !== 'string') return null
    const t = s.trim().replace(/\r\n/g, '\n')
    if (!t) return null
    return t.length > 12_000 ? t.slice(0, 12_000) : t
  } catch {
    return null
  }
}

async function summarizeOpenAi(key: string, prompt: string): Promise<string | null> {
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
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output only compact JSON for a review editor tool.' },
          { role: 'user', content: prompt },
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
    return parseSummaryJson(content)
  } finally {
    clearTimeout(t)
  }
}

async function summarizeGemini(key: string, models: string[], prompt: string): Promise<string | null> {
  let lastErrorBody = ''
  const maxAttemptsPerModel = 3

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`

    attempts: for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 45_000)
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: ac.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
            },
          }),
        })
        const rawText = await res.text()
        if (!res.ok) {
          lastErrorBody = shortenGeminiErrorBody(rawText)
          if (res.status === 404) break attempts
          if (GEMINI_TRANSIENT_HTTP.has(res.status) && attempt < maxAttemptsPerModel - 1) {
            await sleep(700 * 2 ** attempt + Math.floor(Math.random() * 250))
            continue attempts
          }
          if (GEMINI_TRANSIENT_HTTP.has(res.status)) break attempts
          throw new Error(`Gemini: ${lastErrorBody}`)
        }
        const json = JSON.parse(rawText) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) break attempts
        const parsed = parseSummaryJson(text)
        if (parsed) return parsed
      } finally {
        clearTimeout(t)
      }
    }
  }
  throw new Error(
    lastErrorBody
      ? `Gemini: ${lastErrorBody}`
      : 'Gemini: no model returned usable JSON (tried multiple models).',
  )
}

export type ReviewSummaryLlmInput = {
  gameName: string
  pros: string
  cons: string
}

/**
 * One-paragraph review capsule from editor pros/cons (OpenAI if configured, else Gemini; same tiering as Backloggd refine).
 */
export async function generateReviewCapsuleSummary(
  env: ServerProcessEnv,
  input: ReviewSummaryLlmInput,
  opts?: { geminiModel?: string | null },
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const gameName = input.gameName.trim()
  const pros = input.pros.trim()
  const cons = input.cons.trim()
  if (gameName.length < 2) {
    return { ok: false, error: 'Game name is too short.' }
  }
  if (!pros && !cons) {
    return { ok: false, error: 'Add at least some Pros or Cons text for the model to use.' }
  }

  const prompt = buildSummaryPrompt(gameName, pros, cons)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()

  if (!openai && !gemini) {
    return { ok: false, error: 'No OPENAI_API_KEY or GEMINI_API_KEY on the server.' }
  }

  if (openai) {
    try {
      const out = await summarizeOpenAi(openai, prompt)
      if (out) return { ok: true, summary: out }
    } catch (e) {
      if (!gemini) {
        return { ok: false, error: e instanceof Error ? e.message : 'OpenAI request failed' }
      }
    }
  }

  if (gemini) {
    try {
      const out = await summarizeGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), prompt)
      if (out) return { ok: true, summary: out }
      return { ok: false, error: 'Gemini returned no usable summary JSON.' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Gemini request failed' }
    }
  }

  return { ok: false, error: 'OpenAI returned no usable summary and Gemini key is not set.' }
}
