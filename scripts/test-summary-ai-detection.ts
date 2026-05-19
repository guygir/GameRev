#!/usr/bin/env npx tsx
/**
 * Generate "Suggest paragraph" copy for sample games, then score with a separate LLM acting as AI detector.
 *
 *   npx tsx scripts/test-summary-ai-detection.ts
 *   npx tsx scripts/test-summary-ai-detection.ts --slugs=balatro,dredge,inscryption
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { geminiModelsToTry } from '../server/lib/backloggdLlmRefine.js'
import { generateReviewCapsuleSummary, summaryLooksAiGenerated } from '../server/lib/reviewSummaryLlm.js'
import type { ServerProcessEnv } from '../server/lib/serverEnv.js'

const DEFAULT_SLUGS = ['balatro', 'dredge', 'inscryption', 'chants-of-sennaar', 'lunchbreak-tactics']

function tryLoadDotEnv() {
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}

function parseSlugs(): string[] {
  const arg = process.argv.find((a) => a.startsWith('--slugs='))
  if (!arg) return DEFAULT_SLUGS
  return arg
    .slice('--slugs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function aiSlopSignals(text: string): string[] {
  const signals: string[] = []
  if (summaryLooksAiGenerated(text)) signals.push('summaryLooksAiGenerated=true')
  if (/[—–]/.test(text)) signals.push('em/en dash present')
  return signals
}

async function detectWithGemini(
  key: string,
  gameName: string,
  paragraph: string,
): Promise<{ aiLikelihood: number; verdict: string; signals: string[] } | { error: string }> {
  const models = geminiModelsToTry({ GEMINI_API_KEY: key } as ServerProcessEnv, null)
  const prompt = `You are a strict AI-writing detector (like GPTZero-style analysis). You are NOT the author of the text.

Game context (title only): ${JSON.stringify(gameName)}

Paragraph to judge:
${JSON.stringify(paragraph)}

Score how likely this paragraph was written by ChatGPT/Claude/Gemini vs a human game blogger.
- 0 = almost certainly human
- 100 = almost certainly AI
Consider: uniform polish, generic praise, parallel sentence rhythm, hedge phrases, lack of personality, em dashes, stock transitions, overly balanced pros/cons framing.

Return ONLY JSON:
{"aiLikelihood":number,"verdict":"likely human"|"uncertain"|"likely AI","signals":["short reason",...]}`

  let lastErr = ''
  for (const model of models.slice(0, 3)) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
      })
      const raw = await res.text()
      if (!res.ok) {
        lastErr = raw.slice(0, 200)
        continue
      }
      const json = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) continue
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start < 0) continue
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        aiLikelihood?: number
        verdict?: string
        signals?: string[]
      }
      const score = typeof parsed.aiLikelihood === 'number' ? Math.round(parsed.aiLikelihood) : NaN
      if (!Number.isFinite(score)) continue
      return {
        aiLikelihood: Math.min(100, Math.max(0, score)),
        verdict: typeof parsed.verdict === 'string' ? parsed.verdict : 'uncertain',
        signals: Array.isArray(parsed.signals) ? parsed.signals.map(String).slice(0, 6) : [],
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { error: lastErr || 'Gemini detector failed' }
}

async function main() {
  tryLoadDotEnv()
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const gemini = process.env.GEMINI_API_KEY?.trim()
  if (!url || !serviceKey) throw new Error('Missing Supabase env')
  if (!gemini) throw new Error('Missing GEMINI_API_KEY for generation + detection')

  const env: ServerProcessEnv = {
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    GEMINI_API_KEY: gemini,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim(),
  }

  const slugs = parseSlugs()
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb
    .from('games')
    .select('slug, name, pros, cons, summary')
    .in('slug', slugs)
  if (error) throw error

  const rows = (data ?? []).sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug))
  if (!rows.length) throw new Error('No matching games found')

  console.log(`Testing Suggest paragraph pipeline on ${rows.length} game(s)…\n`)

  const results: {
    slug: string
    name: string
    generated: string
    heuristic: boolean
    slop: string[]
    detector?: { aiLikelihood: number; verdict: string; signals: string[] }
    detectorError?: string
    storedSummary?: string
    storedDetector?: { aiLikelihood: number; verdict: string }
  }[] = []

  for (const row of rows) {
    const pros = Array.isArray(row.pros) ? row.pros.join('\n') : ''
    const cons = Array.isArray(row.cons) ? row.cons.join('\n') : ''
    console.log(`--- ${row.name} (${row.slug}) ---`)

    const gen = await generateReviewCapsuleSummary(env, {
      gameName: row.name,
      pros,
      cons,
    })
    if (!gen.ok) {
      console.log(`  Generate failed: ${gen.error}\n`)
      continue
    }

    const slop = aiSlopSignals(gen.summary)
    console.log(`  Heuristic fallback: ${gen.usedHeuristicFallback}`)
    console.log(`  Local slop checks: ${slop.length ? slop.join('; ') : 'none'}`)
    if (gen.stages?.length) {
      console.log('  Pipeline stages:')
      for (const st of gen.stages) {
        const score =
          st.aiLikelihood != null
            ? `${st.aiLikelihood}% (${st.aiVerdict ?? '?'})`
            : st.detectorError ?? 'no score'
        console.log(`    - ${st.label}: ${score}${st.slopFlagged ? ' [slop]' : ''}`)
      }
    }
    console.log(`  Generated:\n  ${gen.summary}\n`)

    const det = await detectWithGemini(gemini, row.name, gen.summary)
    if ('error' in det) {
      console.log(`  Detector: ${det.error}\n`)
      results.push({
        slug: row.slug,
        name: row.name,
        generated: gen.summary,
        heuristic: gen.usedHeuristicFallback,
        slop,
        detectorError: det.error,
      })
      continue
    }
    console.log(`  Detector: ${det.aiLikelihood}% AI — ${det.verdict}`)
    console.log(`  Detector signals: ${det.signals.join('; ')}\n`)

    let storedDetector: { aiLikelihood: number; verdict: string } | undefined
    const stored = typeof row.summary === 'string' ? row.summary.trim() : ''
    if (stored.length >= 40) {
      const storedDet = await detectWithGemini(gemini, row.name, stored)
      if (!('error' in storedDet)) {
        storedDetector = { aiLikelihood: storedDet.aiLikelihood, verdict: storedDet.verdict }
      }
    }

    results.push({
      slug: row.slug,
      name: row.name,
      generated: gen.summary,
      heuristic: gen.usedHeuristicFallback,
      slop,
      detector: det,
      storedSummary: stored || undefined,
      storedDetector,
    })
  }

  console.log('\n=== SUMMARY ===\n')
  console.log('| Game | AI % (new) | Verdict | Slop | AI % (stored summary) |')
  console.log('|---|---:|---|---|---:|')
  for (const r of results) {
    const ai = r.detector?.aiLikelihood ?? '—'
    const verdict = r.detector?.verdict ?? r.detectorError ?? '—'
    const slop = r.slop.length ? r.slop.join(', ') : 'ok'
    const stored = r.storedDetector ? `${r.storedDetector.aiLikelihood}% (${r.storedDetector.verdict})` : '—'
    console.log(`| ${r.name} | ${ai} | ${verdict} | ${slop} | ${stored} |`)
  }

  const scores = results.map((r) => r.detector?.aiLikelihood).filter((n): n is number => typeof n === 'number')
  if (scores.length) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const max = Math.max(...scores)
    const min = Math.min(...scores)
    console.log(`\nNew paragraphs: avg ${avg}% AI, min ${min}%, max ${max}% (n=${scores.length})`)
    console.log('Note: scores use free detector APIs (AIDETECTORAPI_KEY, etc.) when set in .env.')
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
