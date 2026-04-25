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

type SummaryJsonCallOpts = {
  /** OpenAI `max_tokens` / Gemini `maxOutputTokens` for the JSON summary field. */
  maxOutTokens?: number
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

function parseEditorNoteJson(raw: string): string | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const o = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    const s = o.editorNote
    if (typeof s !== 'string') return null
    const t = s.trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' ')
    if (!t) return null
    return t.length > 600 ? t.slice(0, 600) : t
  } catch {
    return null
  }
}

function buildEditorNoteFromSummaryPrompt(gameName: string, summary: string): string {
  const nameCtx =
    gameName.trim().length >= 2
      ? `Game title (tone only; do not repeat as a standalone headline): ${JSON.stringify(clip(gameName.trim(), 200))}\n\n`
      : ''
  return `${nameCtx}You help a solo game-review editor write a single punchy line for the top of the public review.

Source capsule / summary (distill this; do not invent plot beats beyond what is already implied):
${JSON.stringify(clip(summary, 11_000))}

Write exactly ONE sentence in a personal editorial voice: confident, skimmable, no markdown, no bullet characters, no leading label like "Editor's note:". No spoilers beyond the summary. Aim under ~220 characters if you can; hard max one sentence.

Return ONLY valid JSON with exactly this shape:
{"editorNote":"..."}`
}

/** When cloud models are unavailable or fail — clip from the summary only (no canned site copy). */
function heuristicEditorNoteFromSummary(summary: string): string {
  const t = summary.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const parts = t.split(/(?<=[.!?])\s+/)
  let line = (parts[0] ?? t).trim()
  if (line.length < 24 && parts.length > 1) {
    line = `${parts[0]!.trim()} ${parts[1]!.trim()}`.trim()
  }
  line = line.replace(/^["'“”]+|["'“”]+$/g, '').trim()
  const out = clip(line, 600)
  return out || clip(t, 220)
}

async function editorNoteOpenAi(key: string, prompt: string): Promise<string | null> {
  const max_tokens = 220
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
        temperature: 0.4,
        max_tokens,
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
    return parseEditorNoteJson(content)
  } finally {
    clearTimeout(t)
  }
}

async function editorNoteGemini(key: string, models: string[], prompt: string): Promise<string | null> {
  let lastErrorBody = ''
  const maxAttemptsPerModel = 3
  const maxOutputTokens = 512

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
              temperature: 0.4,
              maxOutputTokens,
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
        const parsed = parseEditorNoteJson(text)
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

async function summarizeOpenAi(
  key: string,
  prompt: string,
  callOpts?: SummaryJsonCallOpts,
): Promise<string | null> {
  const max_tokens = callOpts?.maxOutTokens ?? 900
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
        max_tokens,
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

async function summarizeGemini(
  key: string,
  models: string[],
  prompt: string,
  callOpts?: SummaryJsonCallOpts,
): Promise<string | null> {
  let lastErrorBody = ''
  const maxAttemptsPerModel = 3
  const maxOutputTokens = callOpts?.maxOutTokens ?? 1024

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
              maxOutputTokens,
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

/** Non-LLM fallback when cloud models are unavailable or fail (editor should treat as low quality). */
function heuristicCapsuleFromProsCons(gameName: string, pros: string, cons: string): string {
  const pl = pros
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
  const cl = cons
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
  const parts: string[] = []
  parts.push(`${gameName}.`)
  if (pl.length) parts.push(pl.join(' '))
  if (cl.length) parts.push(`Tradeoffs: ${cl.join(' ')}`)
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1500)
}

export type ReviewCapsuleSummaryOk = {
  ok: true
  summary: string
  /** True when OpenAI/Gemini did not produce the text (keys missing or both providers failed). */
  usedHeuristicFallback: boolean
}

/**
 * One-paragraph review capsule from editor pros/cons (OpenAI if configured, else Gemini; heuristic fallback if neither works).
 */
export async function generateReviewCapsuleSummary(
  env: ServerProcessEnv,
  input: ReviewSummaryLlmInput,
  opts?: { geminiModel?: string | null },
): Promise<ReviewCapsuleSummaryOk | { ok: false; error: string }> {
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

  const fallback = (): ReviewCapsuleSummaryOk => ({
    ok: true,
    summary: heuristicCapsuleFromProsCons(gameName, pros, cons),
    usedHeuristicFallback: true,
  })

  if (!openai && !gemini) {
    return fallback()
  }

  if (openai) {
    try {
      const out = await summarizeOpenAi(openai, prompt)
      if (out) return { ok: true, summary: out, usedHeuristicFallback: false }
    } catch {
      if (!gemini) return fallback()
    }
  }

  if (gemini) {
    try {
      const out = await summarizeGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), prompt)
      if (out) return { ok: true, summary: out, usedHeuristicFallback: false }
    } catch {
      /* fall through */
    }
  }

  return fallback()
}

export type EditorNoteFromSummaryOk = {
  ok: true
  editorNote: string
  usedHeuristicFallback: boolean
}

/**
 * One-sentence editor kicker distilled from the capsule summary (OpenAI if configured, else Gemini; heuristic fallback).
 */
export async function generateEditorNoteFromSummary(
  env: ServerProcessEnv,
  input: { gameName: string; summary: string },
  opts?: { geminiModel?: string | null },
): Promise<EditorNoteFromSummaryOk | { ok: false; error: string }> {
  const gameName = input.gameName.trim()
  const summary = input.summary.trim()
  if (summary.length < 20) {
    return { ok: false, error: 'Write more summary text first (at least ~20 characters).' }
  }

  const prompt = buildEditorNoteFromSummaryPrompt(gameName, summary)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()

  const fallback = (): EditorNoteFromSummaryOk => ({
    ok: true,
    editorNote: heuristicEditorNoteFromSummary(summary),
    usedHeuristicFallback: true,
  })

  if (!openai && !gemini) {
    return fallback()
  }

  if (openai) {
    try {
      const out = await editorNoteOpenAi(openai, prompt)
      if (out) return { ok: true, editorNote: out, usedHeuristicFallback: false }
    } catch {
      if (!gemini) return fallback()
    }
  }

  if (gemini) {
    try {
      const out = await editorNoteGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), prompt)
      if (out) return { ok: true, editorNote: out, usedHeuristicFallback: false }
    } catch {
      /* fall through */
    }
  }

  return fallback()
}

export type ReviewSummaryEnglishAdjustInput = {
  /** Slightly richer / more advanced wording vs slightly plainer / easier. */
  direction: 'up' | 'down'
  paragraph: string
  gameName?: string
}

function buildEnglishLevelPrompt(direction: 'up' | 'down', gameName: string, paragraph: string): string {
  const ctx =
    gameName.trim().length >= 2
      ? `This capsule is for the game ${JSON.stringify(gameName.trim())} (tone only; do not output a title line).\n\n`
      : ''
  const tweak =
    direction === 'up'
      ? `Rewrite the paragraph so the English is slightly more advanced: a bit richer vocabulary and more varied sentence rhythm, still sounding like a skimmable game-review capsule. Stay clear; avoid purple prose or jargon for its own sake. Do not add spoilers or new factual claims. Keep roughly the same length (within about ±25%).`
      : `Rewrite the paragraph so the English is slightly simpler: clearer, plainer wording and somewhat shorter sentences where it still flows. Keep an adult editorial tone—do not sound childish. Do not change meaning, add spoilers, or new factual claims. Keep roughly the same length (within about ±25%).`
  return `${ctx}${tweak}

Current paragraph:
${JSON.stringify(clip(paragraph, 11_000))}

Return ONLY valid JSON with exactly this shape:
{"summary":"..."}`
}

/**
 * Nudge the capsule paragraph up or down one notch in reading level (OpenAI if configured, else Gemini). No heuristic fallback.
 */
export async function adjustReviewSummaryEnglishLevel(
  env: ServerProcessEnv,
  input: ReviewSummaryEnglishAdjustInput,
  opts?: { geminiModel?: string | null },
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const direction = input.direction
  if (direction !== 'up' && direction !== 'down') {
    return { ok: false, error: 'direction must be "up" or "down".' }
  }
  const paragraph = input.paragraph.trim()
  if (paragraph.length < 30) {
    return { ok: false, error: 'Add more summary text first (at least ~30 characters).' }
  }
  const gameName = (input.gameName ?? '').trim()
  const prompt = buildEnglishLevelPrompt(direction, gameName, paragraph)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()
  const tokenOpts: SummaryJsonCallOpts = { maxOutTokens: 2048 }

  if (!openai && !gemini) {
    return { ok: false, error: 'No OPENAI_API_KEY or GEMINI_API_KEY on the server.' }
  }

  if (openai) {
    try {
      const out = await summarizeOpenAi(openai, prompt, tokenOpts)
      if (out) return { ok: true, summary: out }
    } catch (e) {
      if (!gemini) {
        return { ok: false, error: e instanceof Error ? e.message : 'OpenAI request failed.' }
      }
    }
  }

  if (gemini) {
    try {
      const out = await summarizeGemini(
        gemini,
        geminiModelsToTry(env, opts?.geminiModel ?? null),
        prompt,
        tokenOpts,
      )
      if (out) return { ok: true, summary: out }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Gemini request failed.' }
    }
  }

  return { ok: false, error: 'Cloud models did not return a revised paragraph.' }
}
