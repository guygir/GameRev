import { geminiModelsToTry } from './backloggdLlmRefine.js'
import type { ServerProcessEnv } from './serverEnv.js'
import { statAxes, statAxisTooltips, type GameStatAxis } from '../../src/review/gameStats.js'

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

function statHintsForPrompt(): string {
  return statAxes
    .map((a) => `- "${a}": ${statAxisTooltips[a]}`)
    .join('\n')
}

function buildOutlinePrompt(gameName: string, summary: string): string {
  return `You reverse-engineer structured review fields from ONE editorial summary paragraph about a single game.

Game title: ${JSON.stringify(gameName)}

Summary (the editor's capsule — infer carefully, do not invent facts not implied by the text):
${JSON.stringify(clip(summary, 12_000))}

Produce:
1) pros: up to 8 short editorial bullets (your phrasing; no markdown; no leading "Pro:"; each under ~100 chars). Strengths implied by the summary.
2) cons: up to 8 short bullets for weaknesses or caveats implied by the summary (use [] if the summary is purely positive).
3) playIfLiked: up to 8 OTHER game or series titles a reader might try — only when the summary gives a clear genre/tone hook; otherwise fewer or [].
4) stats: integers 0–100 for each axis, consistent with the summary's implied lean (50 = neutral / not enough signal):
${statHintsForPrompt()}

Return ONLY valid JSON with exactly these keys (stats must include all six axes exactly as named):
{"pros":[],"cons":[],"playIfLiked":[],"stats":{"Value":50,"Architecture":50,"Presentation":50,"Narrative":50,"Novelty":50,"Fun":50}}`
}

export type OutlineFromSummaryResult = {
  pros: string[]
  cons: string[]
  playIfLiked: string[]
  stats: Record<GameStatAxis, number>
}

function clampStat(n: unknown): number {
  const x = typeof n === 'number' ? n : typeof n === 'string' ? Number.parseInt(n, 10) : NaN
  if (!Number.isFinite(x)) return 50
  return Math.min(100, Math.max(0, Math.round(x)))
}

function parseStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim().replace(/^[\s•\-–]+/, '').slice(0, 200))
    .filter(Boolean)
    .slice(0, max)
}

function parseOutlineJson(raw: string): OutlineFromSummaryResult | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const o = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    const statsRaw = o.stats
    const stats = {} as Record<GameStatAxis, number>
    const box = statsRaw && typeof statsRaw === 'object' && statsRaw !== null ? (statsRaw as Record<string, unknown>) : {}
    for (const axis of statAxes) {
      stats[axis] = clampStat(box[axis])
    }
    return {
      pros: parseStringArray(o.pros, 8),
      cons: parseStringArray(o.cons, 8),
      playIfLiked: parseStringArray(o.playIfLiked, 10),
      stats,
    }
  } catch {
    return null
  }
}

async function outlineOpenAi(key: string, prompt: string): Promise<OutlineFromSummaryResult | null> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 55_000)
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
        max_tokens: 2200,
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
    return parseOutlineJson(content)
  } finally {
    clearTimeout(t)
  }
}

async function outlineGemini(key: string, models: string[], prompt: string): Promise<OutlineFromSummaryResult | null> {
  let lastErrorBody = ''
  const maxAttemptsPerModel = 3

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`

    attempts: for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 55_000)
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: ac.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
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
        const parsed = parseOutlineJson(text)
        if (parsed) return parsed
      } finally {
        clearTimeout(t)
      }
    }
  }
  throw new Error(
    lastErrorBody
      ? `Gemini: ${lastErrorBody}`
      : 'Gemini: no model returned usable outline JSON (tried multiple models).',
  )
}

export type OutlineFromSummaryInput = {
  gameName: string
  summary: string
}

/** Non-LLM fallback: split summary into pseudo-bullets; neutral stats (editor must review). */
function heuristicOutlineFromSummary(gameName: string, summary: string): OutlineFromSummaryResult {
  const chunks = summary
    .split(/(?<=[.!?])\s+|[\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 14 && s.length <= 220)
    .slice(0, 8)
  const pros =
    chunks.length > 0
      ? chunks.map((c) => c.replace(/\s+/g, ' ').replace(/^[\d.)]+/, '').trim()).filter(Boolean)
      : [summary.slice(0, 220).trim() + (summary.length > 220 ? '…' : '')]
  const stats = {} as Record<GameStatAxis, number>
  for (const a of statAxes) stats[a] = 50
  return {
    pros: pros.length ? pros.slice(0, 8) : [`${gameName}: expand the summary to infer bullets.`],
    cons: [],
    playIfLiked: [],
    stats,
  }
}

export type OutlineFromSummaryOk = {
  ok: true
  data: OutlineFromSummaryResult
  usedHeuristicFallback: boolean
}

/**
 * Pros, cons, play-if-liked, and hexagon stats from the summary (OpenAI then Gemini; heuristic split if both fail or keys missing).
 */
export async function generateOutlineFromSummary(
  env: ServerProcessEnv,
  input: OutlineFromSummaryInput,
  opts?: { geminiModel?: string | null },
): Promise<OutlineFromSummaryOk | { ok: false; error: string }> {
  const gameName = input.gameName.trim()
  const summary = input.summary.trim()
  if (gameName.length < 2) {
    return { ok: false, error: 'Game name is too short.' }
  }
  if (summary.length < 40) {
    return { ok: false, error: 'Summary is too short to infer from (try at least a few sentences).' }
  }

  const prompt = buildOutlinePrompt(gameName, summary)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()

  const tryLlm = async (): Promise<OutlineFromSummaryResult | null> => {
    if (openai) {
      try {
        const out = await outlineOpenAi(openai, prompt)
        if (out && (out.pros.length > 0 || out.cons.length > 0 || out.playIfLiked.length > 0)) return out
      } catch {
        /* try Gemini */
      }
    }
    if (gemini) {
      try {
        const out = await outlineGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), prompt)
        if (out && (out.pros.length > 0 || out.cons.length > 0 || out.playIfLiked.length > 0)) return out
      } catch {
        /* heuristic */
      }
    }
    return null
  }

  const llmOut = await tryLlm()
  if (llmOut) {
    return { ok: true, data: llmOut, usedHeuristicFallback: false }
  }
  return {
    ok: true,
    data: heuristicOutlineFromSummary(gameName, summary),
    usedHeuristicFallback: true,
  }
}
