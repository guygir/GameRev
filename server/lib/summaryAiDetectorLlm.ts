import { geminiJsonGenerationConfig, geminiModelsToTry } from './backloggdLlmRefine.js'
import type { ServerProcessEnv } from './serverEnv.js'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'

/** Fast, quota-friendly models for detection-only calls. */
const DETECTOR_GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const

export type AiDetectorLlmScore = {
  aiLikelihood: number
  aiVerdict: 'likely human' | 'uncertain' | 'likely AI'
  source: string
}

function verdictFromPercent(p: number): AiDetectorLlmScore['aiVerdict'] {
  if (p < 35) return 'likely human'
  if (p > 65) return 'likely AI'
  return 'uncertain'
}

function normalizeVerdict(raw: string | undefined, p: number): AiDetectorLlmScore['aiVerdict'] {
  const v = (raw ?? '').toLowerCase().replace(/\s+/g, ' ')
  if (v.includes('human')) return 'likely human'
  if (v.includes('ai')) return 'likely AI'
  return verdictFromPercent(p)
}

function shortenApiError(raw: string, max = 160): string {
  const t = raw.trim()
  try {
    const j = JSON.parse(t) as { error?: { message?: string } }
    const m = j.error?.message
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, max)
  } catch {
    /* ignore */
  }
  return t.replace(/\s+/g, ' ').slice(0, max)
}

function parseDetectorJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function scoreFromParsed(parsed: Record<string, unknown>, source: string): AiDetectorLlmScore | null {
  const score = parsed.aiLikelihood
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  const p = Math.min(100, Math.max(0, Math.round(score)))
  return {
    aiLikelihood: p,
    aiVerdict: normalizeVerdict(typeof parsed.verdict === 'string' ? parsed.verdict : undefined, p),
    source,
  }
}

const DETECTOR_SYSTEM = `You are a strict AI-writing detector (GPTZero-style). You are NOT the author.
Score how likely the text was written by ChatGPT/Claude/Gemini vs a human game blogger.
0 = almost certainly human, 100 = almost certainly AI.
Look for: uniform polish, generic praise, parallel rhythm, hedge phrases, no personality, em dashes, stock transitions, balanced pros/cons voice.`

function detectorModels(env: ServerProcessEnv, preferred?: string | null): string[] {
  const fromEnv = geminiModelsToTry(env, preferred ?? null)
  const ordered = [
    ...DETECTOR_GEMINI_MODELS,
    ...fromEnv.filter((m) => !DETECTOR_GEMINI_MODELS.includes(m as (typeof DETECTOR_GEMINI_MODELS)[number])),
  ]
  const seen = new Set<string>()
  return ordered
    .filter((m) => {
      if (seen.has(m)) return false
      seen.add(m)
      return true
    })
    .slice(0, 3)
}

export function hasLlmAiDetector(env: ServerProcessEnv): boolean {
  return Boolean(
    (env.GROQ_API_KEY ?? '').trim() ||
      (env.GEMINI_API_KEY ?? '').trim() ||
      (env.OPENAI_API_KEY ?? '').trim(),
  )
}

/** @deprecated Use hasLlmAiDetector */
export function hasGeminiAiDetector(env: ServerProcessEnv): boolean {
  return hasLlmAiDetector(env)
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  sourceLabel: string,
  prompt: string,
  maxTokens: number,
): Promise<AiDetectorLlmScore | { error: string }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 30_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DETECTOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const raw = await res.text()
    if (!res.ok) return { error: `${sourceLabel}: ${shortenApiError(raw)}` }
    const json = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const text = json.choices?.[0]?.message?.content
    if (!text) return { error: `${sourceLabel}: empty response` }
    const parsed = parseDetectorJson(text)
    if (!parsed) return { error: `${sourceLabel}: invalid JSON` }
    const scored = scoreFromParsed(parsed, sourceLabel)
    if (!scored) return { error: `${sourceLabel}: missing aiLikelihood` }
    return scored
  } catch (e) {
    return { error: `${sourceLabel}: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    clearTimeout(t)
  }
}

async function callGeminiDetector(
  key: string,
  models: string[],
  prompt: string,
  maxOutputTokens: number,
): Promise<AiDetectorLlmScore | { error: string }> {
  let lastErr = ''
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: geminiJsonGenerationConfig(model, {
            temperature: 0.15,
            maxOutputTokens,
          }),
        }),
      })
      const raw = await res.text()
      if (!res.ok) {
        lastErr = shortenApiError(raw)
        continue
      }
      const json = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) continue
      const parsed = parseDetectorJson(text)
      if (!parsed) continue
      const scored = scoreFromParsed(parsed, `Gemini ${model}`)
      if (scored) return scored
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { error: lastErr || 'Gemini AI detector failed' }
}

function buildSinglePrompt(gameName: string, paragraph: string): string {
  return `Game (title only): ${JSON.stringify(gameName.trim().slice(0, 200))}

Paragraph:
${JSON.stringify(paragraph.trim().slice(0, 8000))}

Return ONLY JSON: {"aiLikelihood":number,"verdict":"likely human"|"uncertain"|"likely AI"}`
}

function buildBatchPrompt(gameName: string, stages: PipelineStageForScoring[]): string {
  const payload = stages.map((s) => ({
    id: s.id,
    label: s.label,
    text: s.text.trim().slice(0, 2500),
  }))
  return `Game (title only): ${JSON.stringify(gameName.trim().slice(0, 200))}

Score EACH stage independently (0 = human, 100 = AI).

Stages:
${JSON.stringify(payload)}

Return ONLY JSON:
{"scores":[{"id":"...","aiLikelihood":number,"verdict":"likely human"|"uncertain"|"likely AI"}]}`
}

export type PipelineStageForScoring = { id: string; label: string; text: string }

async function scoreBatchWithGroqFull(
  key: string,
  gameName: string,
  stages: PipelineStageForScoring[],
): Promise<{ ok: true; scores: Map<string, AiDetectorLlmScore> } | { ok: false; error: string }> {
  const prompt = buildBatchPrompt(gameName, stages)
  const out = await callOpenAiCompatible(GROQ_URL, key, GROQ_MODEL, 'Groq', prompt, 1024)
  if ('error' in out) return { ok: false, error: out.error }

  const parsed = parseDetectorJson(
    JSON.stringify({ scores: [{ id: stages[0]?.id, aiLikelihood: out.aiLikelihood, verdict: out.aiVerdict }] }),
  )
  void parsed

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 45_000)
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.15,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DETECTOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const raw = await res.text()
    if (!res.ok) return { ok: false, error: `Groq: ${shortenApiError(raw)}` }
    const json = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const text = json.choices?.[0]?.message?.content
    if (!text) return { ok: false, error: 'Groq: empty response' }
    const body = parseDetectorJson(text) as { scores?: { id?: string; aiLikelihood?: number; verdict?: string }[] } | null
    if (!body?.scores?.length) return { ok: false, error: 'Groq: missing scores array' }
    const map = new Map<string, AiDetectorLlmScore>()
    for (const row of body.scores) {
      if (typeof row.id !== 'string') continue
      const scored = scoreFromParsed(
        { aiLikelihood: row.aiLikelihood, verdict: row.verdict },
        'Groq',
      )
      if (scored) map.set(row.id, scored)
    }
    if (map.size > 0) return { ok: true, scores: map }
    return { ok: false, error: 'Groq: no valid stage scores' }
  } catch (e) {
    return { ok: false, error: `Groq: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    clearTimeout(t)
  }
}

async function scoreBatchWithGemini(
  env: ServerProcessEnv,
  gameName: string,
  stages: PipelineStageForScoring[],
  opts?: { geminiModel?: string | null },
): Promise<{ ok: true; scores: Map<string, AiDetectorLlmScore> } | { ok: false; error: string }> {
  const key = (env.GEMINI_API_KEY ?? '').trim()
  if (!key) return { ok: false, error: 'GEMINI_API_KEY not set' }

  const prompt = buildBatchPrompt(gameName, stages)
  let lastErr = ''
  for (const model of detectorModels(env, opts?.geminiModel ?? null)) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${DETECTOR_SYSTEM}\n\n${prompt}` }] }],
          generationConfig: geminiJsonGenerationConfig(model, {
            temperature: 0.15,
            maxOutputTokens: 1024,
          }),
        }),
      })
      const raw = await res.text()
      if (!res.ok) {
        lastErr = shortenApiError(raw)
        continue
      }
      const json = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) continue
      const parsed = parseDetectorJson(text) as {
        scores?: { id?: string; aiLikelihood?: number; verdict?: string }[]
      } | null
      if (!parsed?.scores?.length) continue

      const map = new Map<string, AiDetectorLlmScore>()
      const source = `Gemini ${model}`
      for (const row of parsed.scores) {
        if (typeof row.id !== 'string') continue
        const scored = scoreFromParsed(
          { aiLikelihood: row.aiLikelihood, verdict: row.verdict },
          source,
        )
        if (scored) map.set(row.id, scored)
      }
      if (map.size > 0) return { ok: true, scores: map }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, error: lastErr || 'Gemini batch detector failed' }
}

async function scoreBatchWithOpenAi(
  key: string,
  gameName: string,
  stages: PipelineStageForScoring[],
): Promise<{ ok: true; scores: Map<string, AiDetectorLlmScore> } | { ok: false; error: string }> {
  const prompt = buildBatchPrompt(gameName, stages)
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
        temperature: 0.15,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DETECTOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const raw = await res.text()
    if (!res.ok) return { ok: false, error: `OpenAI: ${shortenApiError(raw)}` }
    const json = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    const text = json.choices?.[0]?.message?.content
    if (!text) return { ok: false, error: 'OpenAI: empty response' }
    const parsed = parseDetectorJson(text) as {
      scores?: { id?: string; aiLikelihood?: number; verdict?: string }[]
    } | null
    if (!parsed?.scores?.length) return { ok: false, error: 'OpenAI: missing scores array' }
    const map = new Map<string, AiDetectorLlmScore>()
    for (const row of parsed.scores) {
      if (typeof row.id !== 'string') continue
      const scored = scoreFromParsed(
        { aiLikelihood: row.aiLikelihood, verdict: row.verdict },
        'OpenAI gpt-4o-mini',
      )
      if (scored) map.set(row.id, scored)
    }
    if (map.size > 0) return { ok: true, scores: map }
    return { ok: false, error: 'OpenAI: no valid stage scores' }
  } catch (e) {
    return { ok: false, error: `OpenAI: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Score all pipeline stages in one LLM call. Tries Groq (fast free) → Gemini → OpenAI.
 */
export async function scorePipelineStagesBatchWithLlm(
  env: ServerProcessEnv,
  gameName: string,
  stages: PipelineStageForScoring[],
  opts?: { geminiModel?: string | null },
): Promise<
  | { ok: true; scores: Map<string, AiDetectorLlmScore> }
  | { ok: false; error: string }
> {
  if (!stages.length) return { ok: true, scores: new Map() }

  const errors: string[] = []
  const groq = (env.GROQ_API_KEY ?? '').trim()
  if (groq) {
    const out = await scoreBatchWithGroqFull(groq, gameName, stages)
    if (out.ok) return out
    errors.push(out.error)
  }

  const gemini = (env.GEMINI_API_KEY ?? '').trim()
  if (gemini) {
    const out = await scoreBatchWithGemini(env, gameName, stages, opts)
    if (out.ok) return out
    errors.push(out.error)
  }

  const openai = (env.OPENAI_API_KEY ?? '').trim()
  if (openai) {
    const out = await scoreBatchWithOpenAi(openai, gameName, stages)
    if (out.ok) return out
    errors.push(out.error)
  }

  if (!groq && !gemini && !openai) {
    return {
      ok: false,
      error:
        'No LLM key for AI scoring. Add GROQ_API_KEY (free, instant at console.groq.com) or GEMINI_API_KEY in .env.',
    }
  }

  return { ok: false, error: errors.join(' | ') || 'All LLM detectors failed' }
}

/** Score one paragraph. Tries Groq → Gemini → OpenAI. */
export async function scoreTextAiLikelihoodWithLlm(
  env: ServerProcessEnv,
  gameName: string,
  paragraph: string,
  opts?: { geminiModel?: string | null },
): Promise<AiDetectorLlmScore | { error: string }> {
  const trimmed = paragraph.trim()
  if (trimmed.length < 20) return { error: 'Text too short to score' }

  const prompt = buildSinglePrompt(gameName, trimmed)
  const errors: string[] = []

  const groq = (env.GROQ_API_KEY ?? '').trim()
  if (groq) {
    const out = await callOpenAiCompatible(GROQ_URL, groq, GROQ_MODEL, 'Groq', prompt, 256)
    if (!('error' in out)) return out
    errors.push(out.error)
  }

  const gemini = (env.GEMINI_API_KEY ?? '').trim()
  if (gemini) {
    const out = await callGeminiDetector(gemini, detectorModels(env, opts?.geminiModel ?? null), `${DETECTOR_SYSTEM}\n\n${prompt}`, 256)
    if (!('error' in out)) return out
    errors.push(out.error)
  }

  const openai = (env.OPENAI_API_KEY ?? '').trim()
  if (openai) {
    const out = await callOpenAiCompatible(OPENAI_URL, openai, 'gpt-4o-mini', 'OpenAI gpt-4o-mini', prompt, 256)
    if (!('error' in out)) return out
    errors.push(out.error)
  }

  if (!groq && !gemini && !openai) {
    return {
      error:
        'No LLM key for AI scoring. Add GROQ_API_KEY (free, instant at console.groq.com) or GEMINI_API_KEY in .env.',
    }
  }

  return { error: errors.join(' | ') || 'All LLM detectors failed' }
}

/** @deprecated Use scorePipelineStagesBatchWithLlm */
export const scorePipelineStagesBatchWithGemini = scorePipelineStagesBatchWithLlm

/** @deprecated Use scoreTextAiLikelihoodWithLlm */
export const scoreTextAiLikelihoodWithGemini = scoreTextAiLikelihoodWithLlm
