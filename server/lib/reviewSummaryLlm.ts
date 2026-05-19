import { geminiModelsToTry } from './backloggdLlmRefine.js'
import type { ServerProcessEnv } from './serverEnv.js'
import {
  hasLlmAiDetector,
  scorePipelineStagesBatchWithLlm,
  scoreTextAiLikelihoodWithLlm,
} from './summaryAiDetectorLlm.js'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const GEMINI_TRANSIENT_HTTP = new Set([429, 502, 503])

/** Free-tier / billing quota: retrying other models or backoff usually does not help within the same run. */
function isGeminiDeveloperQuotaExhausted(status: number, rawText: string): boolean {
  if (status !== 429) return false
  const t = rawText.toLowerCase()
  return (
    t.includes('generate_content_free_tier') ||
    t.includes('quota exceeded') ||
    t.includes('resource_exhausted') ||
    (t.includes('quota') && t.includes('billing'))
  )
}

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
  temperature?: number
}

function buildSummaryPrompt(gameName: string, pros: string, cons: string): string {
  return `You help a solo game-review editor write a short capsule for the public review page.

Game title: ${JSON.stringify(gameName)}

Editor's Pros (may be bullets or notes; synthesize, do not copy verbatim):
${JSON.stringify(clip(pros, 8000))}

Editor's Cons (same rules):
${JSON.stringify(clip(cons, 8000))}

Write ONE concise paragraph (about 3–6 sentences): editorial, skimmable, no spoilers, no markdown, no leading title line, no bullet characters. Weave strengths and weaknesses naturally; avoid "pros:" / "cons:" labels.

Return ONLY valid JSON with exactly this shape:
{"summary":"..."}`
}

function buildHumanizeSummaryPrompt(gameName: string, draft: string): string {
  const nameCtx =
    gameName.trim().length >= 2
      ? `Game: ${JSON.stringify(clip(gameName.trim(), 200))}. Tone only; do not add a title line.\n\n`
      : ''
  return `${nameCtx}You rewrite draft review copy so it reads like a real person typed it in a blog post, not like ChatGPT.

Draft paragraph:
${JSON.stringify(clip(draft, 11_000))}

Rules (strict):
- Keep the same facts and opinion; do not add spoilers or new claims.
- One paragraph, same rough length (about 3–6 sentences).
- Plain English, slightly simpler than the draft (a notch below polished magazine prose).
- Sound human and a little informal: contractions are fine, occasional "and" / "but" starts are fine.
- You MAY include very light human mess: a missing capital after a period once, an extra space before a comma once, a small typo like "teh" or "thier" at most once. Do not overdo it.
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, or "and" instead.
- BANNED phrasing and patterns (do not use): "delve", "tapestry", "testament", "landscape", "it's worth noting", "in conclusion", "overall", "compelling", "masterclass", "journey", "elevate", "underscore", "rich tapestry", "stands as", "offers a", "serves as", "a love letter to", "hits different", "at its core", "whether you're", rhetorical questions stacked back-to-back, triple adjectives, or perfectly parallel sentence openings.
- No markdown, bullets, or labels.

Return ONLY valid JSON:
{"summary":"..."}`
}

/** Strip em/en dashes and collapse odd spacing after model output. */
function sanitizeHumanSummary(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,{2,}/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** High-confidence AI-review phrasing; triggers the de-AI pass when matched. */
const AI_SLOP_HIGH_PATTERNS: RegExp[] = [
  /\bdelivers a(n)?\s+(deeply\s+)?(satisfying|polished|compelling|engaging|refreshing)/i,
  /\bpolished take on\b/i,
  /\bexcel(l)?ing with (its|the)\b/i,
  /\bdeeply satisfying\b/i,
  /\bhighly accessible\b/i,
  /\bprovides surprising\b/i,
  /\bpotentially impacting\b/i,
  /\bstrategic depth for fans\b/i,
  /\bcore (competitive )?loop is strong\b/i,
  /\bshould note its\b/i,
  /\bentirely focused on\b/i,
  /\bcould benefit from further\b/i,
]

const AI_SLOP_MEDIUM_PATTERNS: RegExp[] = [
  /\b(compelling|masterclass|testament|tapestry|landscape)\b/i,
  /\b(delve|underscore|elevate|journey)\b/i,
  /\bstands as a\b/i,
  /\boffers a\b/i,
  /\bserves as a\b/i,
  /\ba love letter to\b/i,
  /\bat its core\b/i,
  /\bit's worth noting\b/i,
  /\bin conclusion\b/i,
  /\boverall,\b/i,
  /\b(furthermore|moreover|additionally),/i,
  /\bwhile its\b/i,
  /\bwhile the experience\b/i,
  /\bfor fans of\b/i,
  /\bmakes it (highly |really )?(addictive|accessible|engaging)\b/i,
]

/** True when copy still reads like generic AI review prose after humanize. */
export function summaryLooksAiGenerated(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[—–]/.test(t)) return true
  if (AI_SLOP_HIGH_PATTERNS.some((re) => re.test(t))) return true
  let mediumHits = 0
  for (const re of AI_SLOP_MEDIUM_PATTERNS) {
    if (re.test(t)) mediumHits++
  }
  if (mediumHits >= 2) return true
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length >= 4) {
    const formalOpeners = sentences.filter((s) =>
      /^(The |Its |While |This |Players )/.test(s) && !/\b(i |i'|we |you |man,|yeah|kinda|sorta|gonna)\b/i.test(s),
    ).length
    if (formalOpeners >= 3 && mediumHits >= 1) return true
  }
  return false
}

function localVerdictFromPercent(p: number): 'likely human' | 'uncertain' | 'likely AI' {
  if (p < 35) return 'likely human'
  if (p > 65) return 'likely AI'
  return 'uncertain'
}

/** Rough 0–100 when no external detector API key is configured (pattern-based, not GPTZero). */
export function estimateLocalAiLikelihood(text: string): number {
  const t = text.trim()
  if (!t) return 0
  let score = 12
  if (/[—–]/.test(t)) score += 22
  for (const re of AI_SLOP_HIGH_PATTERNS) {
    if (re.test(t)) score += 16
  }
  let mediumHits = 0
  for (const re of AI_SLOP_MEDIUM_PATTERNS) {
    if (re.test(t)) mediumHits++
  }
  score += mediumHits * 9
  if (/\b(however|moreover|furthermore|additionally)\b/i.test(t)) score += 6
  if (/\bmasterfully\b/i.test(t)) score += 14
  if (/\btransitions smoothly\b/i.test(t)) score += 10
  if (summaryLooksAiGenerated(t)) score = Math.max(score, 58)
  return Math.round(Math.min(92, Math.max(8, score)))
}

function buildDeAiSummaryPrompt(gameName: string, draft: string, pass: number): string {
  const nameCtx =
    gameName.trim().length >= 2
      ? `Game: ${JSON.stringify(clip(gameName.trim(), 200))}.\n\n`
      : ''
  const passNote =
    pass > 0
      ? 'This is a second rewrite — the last version STILL failed AI detection. Be messier and more casual.\n\n'
      : 'The draft below still reads like ChatGPT and may get flagged. Rewrite it hard.\n\n'
  return `${nameCtx}${passNote}Draft (do not keep this voice):
${JSON.stringify(clip(draft, 11_000))}

Rewrite as one paragraph a tired blogger would post after finishing the game:
- Same facts and verdict; no new spoilers.
- Shorter sentences mixed with longer ones. Start some sentences with "And" or "But" or "Yeah".
- Use contractions (it's, doesn't, you're). Mild slang ok (kinda, super, man).
- NO PR polish. NO press-release verbs: delivers, provides, offers, excels, boasts, features, showcases, elevates, underscores.
- NO phrases like: deeply satisfying, polished take, highly accessible, engaging X and Y, While its, players should note, potentially impacting, for fans of, core loop is strong.
- No em dashes (—) or en dashes (–).
- Optional ONE tiny human slip (missing capital after period, or "teh" once). Do not stack errors.
- 3–6 sentences, plain English slightly below magazine polish.

BAD (do not write like this): "Game X delivers a deeply satisfying and polished take on the genre, excelling with its engaging systems."
GOOD: "Game X is kinda addictive once the card synergies click, and yeah it gets mean later, but I kept hitting restart anyway."

Return ONLY valid JSON:
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
    let t = s.trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' ')
    if (!t) return null
    t = t.replace(/\s*[—–]\s*/g, ', ')
    const firstSentence = t.split(/(?<=[.!?])\s+/)[0]?.trim()
    if (firstSentence) t = firstSentence
    return t.length > 180 ? t.slice(0, 180).trim() : t
  } catch {
    return null
  }
}

function buildEditorNoteFromSummaryPrompt(gameName: string, summary: string): string {
  const nameCtx =
    gameName.trim().length >= 2
      ? `Game title (tone only; do not repeat as a standalone headline): ${JSON.stringify(clip(gameName.trim(), 200))}\n\n`
      : ''
  return `${nameCtx}You write a one-line punch for the top of a game review: a single short sentence that sticks.

Source summary (distill only; no new plot beats or spoilers):
${JSON.stringify(clip(summary, 11_000))}

Requirements:
- Exactly ONE sentence. Not two sentences joined with a semicolon.
- Punchy and specific: the hook or verdict in the fewest words that still land.
- Memorable wording; avoid generic praise ("a must-play", "worth your time").
- Personal editorial voice, slightly informal. No markdown, no "Editor's note:" label.
- Target under ~120 characters when possible; hard cap one sentence and under ~180 characters.
- No em dashes (—) or en dashes (–).

Return ONLY valid JSON:
{"editorNote":"..."}`
}

/** When cloud models are unavailable or fail — first sentence only, clipped for a punch line. */
function heuristicEditorNoteFromSummary(summary: string): string {
  const t = summary.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const parts = t.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean)
  let line = parts[0] ?? t
  line = line.replace(/^["'“”]+|["'“”]+$/g, '').trim()
  line = line.replace(/\s*[—–]\s*/g, ', ')
  const out = clip(line, 180)
  return out || clip(t, 180)
}

async function editorNoteOpenAi(key: string, prompt: string): Promise<string | null> {
  const max_tokens = 900
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
        temperature: 0.55,
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
    const parsed = parseEditorNoteJson(content)
    if (!parsed) return null
    return parsed.replace(/\s*[—–]\s*/g, ', ').trim()
  } finally {
    clearTimeout(t)
  }
}

async function editorNoteGemini(key: string, models: string[], prompt: string): Promise<string | null> {
  let lastErrorBody = ''
  const maxAttemptsPerModel = 5
  const maxOutputTokens = 1024

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
              temperature: 0.55,
              maxOutputTokens,
              responseMimeType: 'application/json',
            },
          }),
        })
        const rawText = await res.text()
        if (!res.ok) {
          lastErrorBody = shortenGeminiErrorBody(rawText)
          if (res.status === 404) break attempts
          if (isGeminiDeveloperQuotaExhausted(res.status, rawText)) {
            throw new Error(`Gemini: ${lastErrorBody}`)
          }
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
        if (parsed) return parsed.replace(/\s*[—–]\s*/g, ', ').trim()
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
        temperature: callOpts?.temperature ?? 0.35,
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
              temperature: callOpts?.temperature ?? 0.35,
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

/**
 * Second pass after capsule draft: rephrase so copy reads human-written, not AI-polished.
 * Returns the draft unchanged if cloud humanize fails.
 */
async function humanizeReviewSummary(
  env: ServerProcessEnv,
  gameName: string,
  draft: string,
  opts?: { geminiModel?: string | null },
): Promise<string> {
  const trimmed = draft.trim()
  if (trimmed.length < 40) return sanitizeHumanSummary(trimmed)

  const prompt = buildHumanizeSummaryPrompt(gameName, trimmed)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()
  const humanizeOpts: SummaryJsonCallOpts = { maxOutTokens: 2048, temperature: 0.55 }

  if (openai) {
    try {
      const out = await summarizeOpenAi(openai, prompt, humanizeOpts)
      if (out) return sanitizeHumanSummary(out)
    } catch {
      if (!gemini) return sanitizeHumanSummary(trimmed)
    }
  }

  if (gemini) {
    try {
      const out = await summarizeGemini(
        gemini,
        geminiModelsToTry(env, opts?.geminiModel ?? null),
        prompt,
        humanizeOpts,
      )
      if (out) return sanitizeHumanSummary(out)
    } catch {
      /* fall through */
    }
  }

  return sanitizeHumanSummary(trimmed)
}

/**
 * Third pass (conditional): aggressive de-AI rewrite when heuristics still flag the paragraph.
 */
async function deAiReviewSummary(
  env: ServerProcessEnv,
  gameName: string,
  draft: string,
  opts?: { geminiModel?: string | null; pass?: number },
): Promise<string | null> {
  const trimmed = draft.trim()
  if (trimmed.length < 40) return sanitizeHumanSummary(trimmed)

  const prompt = buildDeAiSummaryPrompt(gameName, trimmed, opts?.pass ?? 0)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()
  const callOpts: SummaryJsonCallOpts = { maxOutTokens: 2048, temperature: 0.65 }

  if (openai) {
    try {
      const out = await summarizeOpenAi(openai, prompt, callOpts)
      if (out) return sanitizeHumanSummary(out)
    } catch {
      if (!gemini) return null
    }
  }

  if (gemini) {
    try {
      const out = await summarizeGemini(
        gemini,
        geminiModelsToTry(env, opts?.geminiModel ?? null),
        prompt,
        callOpts,
      )
      if (out) return sanitizeHumanSummary(out)
    } catch {
      /* fall through */
    }
  }

  return null
}

export type SummaryPipelineStage = {
  id: string
  label: string
  text: string
  /** 0–100 from detector LLM; null when skipped or failed. */
  aiLikelihood: number | null
  aiVerdict: string | null
  /** Local AI-slop heuristic (triggers de-AI when true). */
  slopFlagged: boolean
  detectorError?: string
  /** Which free API produced the score, when set. */
  detectorSource?: string
}

export type ReviewCapsuleSummaryOpts = {
  geminiModel?: string | null
  /** Score pipeline stages with Gemini (batch). Default: on. */
  scoreStages?: boolean
}

function pushSummaryPipelineStage(
  stages: SummaryPipelineStage[],
  id: string,
  label: string,
  text: string,
): void {
  stages.push({
    id,
    label,
    text,
    aiLikelihood: null,
    aiVerdict: null,
    slopFlagged: summaryLooksAiGenerated(text),
  })
}

async function attachPipelineStageScores(
  env: ServerProcessEnv,
  gameName: string,
  stages: SummaryPipelineStage[],
  opts?: ReviewCapsuleSummaryOpts,
): Promise<'llm' | 'local'> {
  if (opts?.scoreStages === false) return 'local'

  let llmError = ''
  if (hasLlmAiDetector(env)) {
    const batch = await scorePipelineStagesBatchWithLlm(env, gameName, stages, opts)
    if (batch.ok) {
      for (const stage of stages) {
        const scored = batch.scores.get(stage.id)
        if (scored) {
          stage.aiLikelihood = scored.aiLikelihood
          stage.aiVerdict = scored.aiVerdict
          stage.detectorSource = scored.source
        }
      }
      const missing = stages.filter((s) => s.aiLikelihood == null)
      for (const stage of missing) {
        const single = await scoreTextAiLikelihoodWithLlm(env, gameName, stage.text, opts)
        if (!('error' in single)) {
          stage.aiLikelihood = single.aiLikelihood
          stage.aiVerdict = single.aiVerdict
          stage.detectorSource = single.source
        }
      }
      if (stages.every((s) => s.aiLikelihood != null)) return 'llm'
    } else {
      llmError = batch.error
      for (const stage of stages) {
        const single = await scoreTextAiLikelihoodWithLlm(env, gameName, stage.text, opts)
        if (!('error' in single)) {
          stage.aiLikelihood = single.aiLikelihood
          stage.aiVerdict = single.aiVerdict
          stage.detectorSource = single.source
        }
      }
      if (stages.every((s) => s.aiLikelihood != null)) return 'llm'
    }
  } else {
    llmError =
      'No LLM key for AI scoring. Add GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY to .env.'
  }

  for (const stage of stages) {
    if (stage.aiLikelihood != null) continue
    const p = estimateLocalAiLikelihood(stage.text)
    stage.aiLikelihood = p
    stage.aiVerdict = localVerdictFromPercent(p)
    stage.detectorSource = 'local estimate'
    if (llmError) stage.detectorError = llmError
  }
  return stages.some((s) => s.detectorSource && s.detectorSource !== 'local estimate') ? 'llm' : 'local'
}

/**
 * Full Suggest-paragraph polish with inspectable stages: draft → humanize → de-AI (0–2×).
 */
async function finalizeSuggestedSummaryWithStages(
  env: ServerProcessEnv,
  gameName: string,
  draft: string,
  opts?: ReviewCapsuleSummaryOpts,
): Promise<{ text: string; stages: SummaryPipelineStage[]; detectorMode: 'llm' | 'local' }> {
  const stages: SummaryPipelineStage[] = []
  pushSummaryPipelineStage(stages, 'draft', '1. Initial draft (cloud)', draft)

  let text = await humanizeReviewSummary(env, gameName, draft, opts)
  const humanizeUnchanged = text.replace(/\s+/g, ' ').trim() === draft.replace(/\s+/g, ' ').trim()
  pushSummaryPipelineStage(
    stages,
    'humanize',
    humanizeUnchanged
      ? '2. Humanize (unchanged — cloud pass failed or returned same text)'
      : '2. Humanize',
    text,
  )

  const maxDeAiPasses = 2
  let forceDeAiAfterUnchangedHumanize = humanizeUnchanged
  for (
    let pass = 0;
    pass < maxDeAiPasses && (summaryLooksAiGenerated(text) || forceDeAiAfterUnchangedHumanize);
    pass++
  ) {
    forceDeAiAfterUnchangedHumanize = false
    const rewritten = await deAiReviewSummary(env, gameName, text, { ...opts, pass })
    if (!rewritten) break
    text = rewritten
    pushSummaryPipelineStage(stages, `deai-${pass + 1}`, `3. De-AI pass ${pass + 1}`, text)
  }

  const detectorMode = await attachPipelineStageScores(env, gameName, stages, opts)
  return { text, stages, detectorMode }
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
  /** Each pipeline version + AI detector score (for editor inspection). */
  stages: SummaryPipelineStage[]
  /** True when GROQ / GEMINI / OPENAI key is set for LLM scoring. */
  detectorConfigured: boolean
  /** `llm` = model-scored stages; `local` = pattern estimate (LLM failed or no key). */
  detectorMode: 'llm' | 'local'
}

/**
 * One-paragraph review capsule from editor pros/cons (OpenAI if configured, else Gemini; heuristic fallback if neither works).
 * Cloud path: draft → humanize → optional de-AI pass(es) when copy still matches AI-slop heuristics.
 */
export async function generateReviewCapsuleSummary(
  env: ServerProcessEnv,
  input: ReviewSummaryLlmInput,
  opts?: ReviewCapsuleSummaryOpts,
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

  const fallback = async (): Promise<ReviewCapsuleSummaryOk> => {
    const summary = heuristicCapsuleFromProsCons(gameName, pros, cons)
    const stages: SummaryPipelineStage[] = []
    pushSummaryPipelineStage(stages, 'heuristic', 'Heuristic fallback (no cloud draft)', summary)
    const detectorMode = await attachPipelineStageScores(env, gameName, stages, opts)
    return {
      ok: true,
      summary,
      usedHeuristicFallback: true,
      stages,
      detectorConfigured: hasLlmAiDetector(env),
      detectorMode,
    }
  }

  if (!openai && !gemini) {
    return fallback()
  }

  if (openai) {
    try {
      const out = await summarizeOpenAi(openai, prompt)
      if (out) {
        const { text, stages, detectorMode } = await finalizeSuggestedSummaryWithStages(env, gameName, out, opts)
        return {
          ok: true,
          summary: text,
          usedHeuristicFallback: false,
          stages,
          detectorConfigured: hasLlmAiDetector(env),
          detectorMode,
        }
      }
    } catch {
      if (!gemini) return fallback()
    }
  }

  if (gemini) {
    try {
      const out = await summarizeGemini(gemini, geminiModelsToTry(env, opts?.geminiModel ?? null), prompt)
      if (out) {
        const { text, stages, detectorMode } = await finalizeSuggestedSummaryWithStages(env, gameName, out, opts)
        return {
          ok: true,
          summary: text,
          usedHeuristicFallback: false,
          stages,
          detectorConfigured: hasLlmAiDetector(env),
          detectorMode,
        }
      }
    } catch {
      /* fall through */
    }
  }

  return fallback()
}

export type EditorNoteFromSummaryOk = {
  ok: true
  editorNote: string
  /** True when OpenAI/Gemini did not return usable JSON after all retries (local clip from summary). */
  usedHeuristicFallback: boolean
  /** When heuristic ran after cloud misses: condensed error trail for debugging. */
  cloudTrace?: string
}

export type EditorNoteFromSummaryOpts = {
  geminiModel?: string | null
  /**
   * When false, returns `{ ok: false }` if no cloud model produced a parseable `editorNote` (no heuristic).
   * Use for CLI backfills that must be AI-only.
   */
  allowHeuristic?: boolean
  /** Full OpenAI attempt + full Gemini model rotation counts as one round. Default 4. */
  cloudRetryRounds?: number
  /** Delay before each retry round after the first (ms). Default 2000. */
  retryBackoffMs?: number
}

/**
 * One-sentence editor kicker distilled from the capsule summary (OpenAI if configured, else Gemini; optional heuristic).
 */
export async function generateEditorNoteFromSummary(
  env: ServerProcessEnv,
  input: { gameName: string; summary: string },
  opts?: EditorNoteFromSummaryOpts,
): Promise<EditorNoteFromSummaryOk | { ok: false; error: string }> {
  const gameName = input.gameName.trim()
  const summary = input.summary.trim()
  if (summary.length < 20) {
    return { ok: false, error: 'Write more summary text first (at least ~20 characters).' }
  }

  const prompt = buildEditorNoteFromSummaryPrompt(gameName, summary)
  const openai = (env.OPENAI_API_KEY ?? '').trim()
  const gemini = (env.GEMINI_API_KEY ?? '').trim()
  const allowHeuristic = opts?.allowHeuristic !== false
  const rounds = Math.max(1, Math.min(12, opts?.cloudRetryRounds ?? 4))
  const backoffMs = Math.max(0, Math.min(60_000, opts?.retryBackoffMs ?? 2000))

  const heuristicOk = (cloudTrace: string): EditorNoteFromSummaryOk => ({
    ok: true,
    editorNote: heuristicEditorNoteFromSummary(summary),
    usedHeuristicFallback: true,
    cloudTrace: cloudTrace.slice(0, 2000),
  })

  if (!openai && !gemini) {
    if (!allowHeuristic) {
      return { ok: false, error: 'No OPENAI_API_KEY or GEMINI_API_KEY on the server (strict mode: no heuristic).' }
    }
    return heuristicOk('No API keys configured; heuristic only.')
  }

  const traces: string[] = []
  const geminiModels = () => geminiModelsToTry(env, opts?.geminiModel ?? null)

  for (let r = 0; r < rounds; r++) {
    let stopRounds = false
    if (r > 0 && backoffMs > 0) await sleep(backoffMs)
    const label = `Round ${r + 1}/${rounds}`

    if (openai) {
      try {
        const out = await editorNoteOpenAi(openai, prompt)
        if (out) return { ok: true, editorNote: out, usedHeuristicFallback: false }
        traces.push(`${label}: OpenAI returned empty or unparseable editorNote JSON.`)
      } catch (e) {
        traces.push(`${label}: OpenAI ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (gemini) {
      try {
        const out = await editorNoteGemini(gemini, geminiModels(), prompt)
        if (out) return { ok: true, editorNote: out, usedHeuristicFallback: false }
        traces.push(`${label}: Gemini returned empty or unparseable editorNote JSON.`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        traces.push(`${label}: Gemini ${msg}`)
        if (isGeminiDeveloperQuotaExhausted(429, msg)) stopRounds = true
      }
    }

    if (stopRounds) break
  }

  const trace = traces.length ? traces.join(' \u00bb ') : 'Cloud models did not return usable JSON.'
  if (!allowHeuristic) {
    return {
      ok: false,
      error: `Cloud retries exhausted (${rounds} round(s), OpenAI + Gemini each). ${trace}`,
    }
  }
  return heuristicOk(trace)
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
