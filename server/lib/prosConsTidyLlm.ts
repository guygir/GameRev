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

export type ProsConsSide = 'pros' | 'cons'

function buildTidyPrompt(gameName: string, side: ProsConsSide, rawLines: string): string {
  const label = side === 'pros' ? 'Pros' : 'Cons'
  const role = side === 'pros' ? 'strengths / positives' : 'weaknesses / negatives'
  return `You consolidate a game review editor's ${label} list into fewer, stronger bullets.

Game title (context only): ${JSON.stringify(clip(gameName, 200))}

Raw lines (one rough bullet per line; many lines may belong to the same theme, e.g. several lines about puzzles, difficulty, or pacing):
${JSON.stringify(clip(rawLines, 8000))}

How to work (do this mentally; output only the final JSON):
1. Read the whole list as one set of notes about ${role}.
2. Cluster by theme/topic (not just identical wording). Example: three separate lines about puzzles, clues, or brain-teasers → one bullet that captures all of that substance.
3. Turn each cluster into a single clear line; keep unrelated themes as separate bullets.
4. You may end up with noticeably fewer lines than the input when many lines overlapped—that is desired.

Output rules:
- Preserve the editor's intent and facts; do not invent new praise, problems, or plot claims.
- Wording should be tight and readable; one idea per output string.
- No markdown, no numbering prefixes, no leading bullets/dashes inside each string.
- Order bullets by importance (strongest themes first) when you can tell; otherwise a sensible editorial order.
- At most 20 output lines; each line at most 320 characters (merged bullets may need more room than a single raw line).

Return ONLY valid JSON with exactly this shape:
{"lines":["...","..."]}`
}

function parseLinesJson(raw: string): string[] | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const o = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    const arr = o.lines
    if (!Array.isArray(arr)) return null
    const out: string[] = []
    for (const x of arr) {
      if (typeof x !== 'string') continue
      const t = x.trim().replace(/\r\n/g, '\n')
      if (!t) continue
      out.push(t.length > 320 ? `${t.slice(0, 319)}…` : t)
      if (out.length >= 20) break
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

async function tidyOpenAi(key: string, prompt: string): Promise<string[] | null> {
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
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You output only compact JSON for a review editor tool. Merge overlapping themes into fewer bullets when appropriate.',
          },
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
    return parseLinesJson(content)
  } finally {
    clearTimeout(t)
  }
}

async function tidyGemini(key: string, models: string[], prompt: string): Promise<string[] | null> {
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
              temperature: 0.3,
              maxOutputTokens: 2000,
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
        const parsed = parseLinesJson(text)
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

function heuristicTidyLines(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const k = line.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(k)) continue
    seen.add(k)
    out.push(line)
  }
  return out.slice(0, 20)
}

export type ProsConsTidyOk = {
  ok: true
  lines: string
  usedHeuristicFallback: boolean
}

/**
 * Aggregates thematic overlaps and re-splits into bullets (OpenAI / Gemini; simple dedupe fallback).
 */
export async function tidyProsConsLines(
  env: ServerProcessEnv,
  input: { gameName: string; side: ProsConsSide; rawLines: string },
  opts?: { geminiModel?: string | null },
): Promise<ProsConsTidyOk | { ok: false; error: string }> {
  const gameName = input.gameName.trim()
  const raw = input.rawLines.trim()
  if (!raw) {
    return { ok: false, error: 'Add at least one line to tidy.' }
  }
  if (input.side !== 'pros' && input.side !== 'cons') {
    return { ok: false, error: 'Invalid side (expected pros or cons).' }
  }

  const prompt = buildTidyPrompt(gameName || 'Unknown game', input.side, raw)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()

  const asText = (arr: string[]) => arr.join('\n')

  const fallback = (): ProsConsTidyOk => ({
    ok: true,
    lines: asText(heuristicTidyLines(raw)),
    usedHeuristicFallback: true,
  })

  if (!openai && !gemini) {
    return fallback()
  }

  if (openai) {
    try {
      const out = await tidyOpenAi(openai, prompt)
      if (out) return { ok: true, lines: asText(out), usedHeuristicFallback: false }
    } catch {
      if (!gemini) return fallback()
    }
  }

  if (gemini) {
    try {
      const out = await tidyGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), prompt)
      if (out) return { ok: true, lines: asText(out), usedHeuristicFallback: false }
    } catch {
      /* fall through */
    }
  }

  return fallback()
}
