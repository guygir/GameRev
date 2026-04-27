#!/usr/bin/env npx tsx
/**
 * Audit all games for missing `editor_note`, generate a one-line suggestion from `summary`
 * (same logic as POST /api/editor-note-from-summary).
 *
 * Default: **print only** — no Supabase writes.
 * Pass `--write` to UPDATE `games.editor_note` for rows that get a successful suggestion.
 *
 *   npm run backfill:editor-notes
 *   npm run backfill:editor-notes:write
 *
 * Default: **AI-only** (no heuristic). Pass `--allow-heuristic` to fall back to the summary clip if cloud fails.
 *
 * Optional: `--gemini-model=gemini-2.5-flash-lite` (must be on the same whitelist as Add Game → Cloud AI). When
 * omitted, behavior matches Add Game with **Auto** (uses `GEMINI_MODEL` from env when set, else default order).
 *
 * Loads `.env` then `.env.local` from repo root (fills only keys still unset).
 * Requires: `VITE_SUPABASE_URL` or `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
 * LLM: `OPENAI_API_KEY` and/or `GEMINI_API_KEY` (optional `GEMINI_MODEL` if allowed by whitelist).
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { geminiModelsToTry } from '../server/lib/backloggdLlmRefine.js'
import { generateEditorNoteFromSummary } from '../server/lib/reviewSummaryLlm.js'
import type { ServerProcessEnv } from '../server/lib/serverEnv.js'
import { isAllowedBackloggdGeminiModel } from '../src/lib/geminiBackloggdModels.js'

const wantWrite = process.argv.includes('--write')
/** Default false = require OpenAI/Gemini (matches strict backfill). */
const allowHeuristic = process.argv.includes('--allow-heuristic')

function parseGeminiModelCli(): string | null {
  const raw = process.argv.find((a) => a.startsWith('--gemini-model='))
  if (!raw) return null
  const v = raw.slice('--gemini-model='.length).trim()
  if (!v) return null
  if (!isAllowedBackloggdGeminiModel(v)) {
    console.warn(`Ignoring invalid --gemini-model=${JSON.stringify(v)} (not on the Add Game whitelist).`)
    return null
  }
  return v
}

const cliGeminiModel = parseGeminiModelCli()

function tryLoadDotEnv() {
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name)
    if (!existsSync(p)) continue
    const raw = readFileSync(p, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      const k = m[1]
      if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Avoid one bad/hung provider stalling the whole batch (per game). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

const PER_GAME_MS = allowHeuristic ? 180_000 : 600_000

tryLoadDotEnv()

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!url || !key) {
  console.error(
    'Missing VITE_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Run from repo root, e.g.:\n  npm run backfill:editor-notes\n' +
      'or: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/backfill-editor-notes.ts',
  )
  process.exit(1)
}

const env = process.env as ServerProcessEnv

if ((process.env.GEMINI_API_KEY ?? '').trim()) {
  const order = geminiModelsToTry(env, cliGeminiModel)
  console.log('Gemini try order (same `geminiModelsToTry` as POST /api/editor-note-from-summary / Add Game Cloud AI):')
  console.log(`  ${order.join(' → ')}`)
  const envPrimary = (process.env.GEMINI_MODEL ?? '').trim()
  if (envPrimary && isAllowedBackloggdGeminiModel(envPrimary) && !cliGeminiModel) {
    console.log(`  (GEMINI_MODEL in .env prepends ${envPrimary} when set; matches Auto when that is your env.)`)
  }
  if (cliGeminiModel) {
    console.log(`  (--gemini-model=${cliGeminiModel} = same as picking that model in the Add Game dropdown instead of Auto.)`)
  }
  console.log('')
}

type GameRow = {
  slug: string
  name: string
  summary: string | null
  editor_note: string | null
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function loadGames(): Promise<GameRow[]> {
  const { data, error } = await sb
    .from('games')
    .select('slug, name, summary, editor_note')
    .order('catalog_rank', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as GameRow[]
}

const rows = await loadGames()
const total = rows.length
const withNote = rows.filter((r) => (r.editor_note ?? '').trim().length > 0).length
const missingNote = rows.filter((r) => !(r.editor_note ?? '').trim())

console.log(`Games loaded: ${total}`)
console.log(`Already have editor_note: ${withNote}`)
console.log(`Missing editor_note: ${missingNote.length}`)
console.log(wantWrite ? 'Mode: --write (will UPDATE Supabase)\n' : 'Mode: dry-run (no Supabase writes)\n')

const llmTargets = rows.filter(
  (r) => !(r.editor_note ?? '').trim() && (r.summary ?? '').trim().length >= 20,
)
if (llmTargets.length > 0) {
  console.log(
    `Generating for ${llmTargets.length} game(s) with summary (≥20 chars). ` +
      (allowHeuristic
        ? 'Heuristic fallback allowed if cloud fails. '
        : 'Strict: cloud only (pass --allow-heuristic to allow heuristic). ') +
      `This can take several minutes; progress prints per slug.\n`,
  )
}

type ResultRow = {
  slug: string
  name: string
  status: 'has_note' | 'skip_no_summary' | 'skip_summary_short' | 'ok' | 'error'
  detail?: string
  suggested?: string
  heuristic?: boolean
}

const results: ResultRow[] = []
let llmIndex = 0

for (const r of rows) {
  if ((r.editor_note ?? '').trim()) {
    results.push({ slug: r.slug, name: r.name, status: 'has_note' })
    continue
  }
  const summary = (r.summary ?? '').trim()
  if (!summary) {
    results.push({
      slug: r.slug,
      name: r.name,
      status: 'skip_no_summary',
      detail: 'No summary text',
    })
    continue
  }
  if (summary.length < 20) {
    results.push({
      slug: r.slug,
      name: r.name,
      status: 'skip_summary_short',
      detail: `Summary only ${summary.length} chars (< 20)`,
    })
    continue
  }

  llmIndex += 1
  const t0 = Date.now()
  console.log(`[${llmIndex}/${llmTargets.length}] ${r.slug} — generating…`)
  try {
    const out = await withTimeout(
      generateEditorNoteFromSummary(env, { gameName: r.name, summary }, {
        geminiModel: cliGeminiModel ?? undefined,
        allowHeuristic,
        cloudRetryRounds: allowHeuristic ? 4 : 6,
        retryBackoffMs: 2500,
      }),
      PER_GAME_MS,
      r.slug,
    )
    const ms = Date.now() - t0
    if (out.ok === false) {
      results.push({ slug: r.slug, name: r.name, status: 'error', detail: out.error })
      console.log(`    ${ms}ms → error: ${out.error}`)
    } else {
      results.push({
        slug: r.slug,
        name: r.name,
        status: 'ok',
        suggested: out.editorNote,
        heuristic: out.usedHeuristicFallback,
      })
      const hint = out.usedHeuristicFallback ? 'heuristic' : 'cloud'
      console.log(`    ${ms}ms → ${hint} (${out.editorNote.length} chars):`)
      console.log(`    ${out.editorNote}`)
      if (out.usedHeuristicFallback && out.cloudTrace) {
        console.log(`    (cloud trace: ${out.cloudTrace})`)
      }
    }
  } catch (e) {
    const ms = Date.now() - t0
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ slug: r.slug, name: r.name, status: 'error', detail: msg })
    console.log(`    ${ms}ms → error: ${msg}`)
  }
  await sleep(400)
}

console.log('--- Results (markdown) ---\n')
console.log('| slug | name | status | suggested / detail |')
console.log('| --- | --- | --- | --- |')
for (const x of results) {
  const col4 =
    x.status === 'ok'
      ? `${JSON.stringify(x.suggested ?? '')}${x.heuristic ? ' *(heuristic)*' : ''}`
      : JSON.stringify(x.detail ?? x.status)
  console.log(`| ${x.slug} | ${x.name.replace(/\|/g, '\\|')} | ${x.status} | ${col4} |`)
}

const toWrite = results.filter((x) => x.status === 'ok' && x.suggested)
if (wantWrite && toWrite.length) {
  console.log(`\n--- Writing ${toWrite.length} row(s) ---\n`)
  for (const x of toWrite) {
    const { error } = await sb.from('games').update({ editor_note: x.suggested }).eq('slug', x.slug)
    if (error) {
      console.error(`UPDATE failed ${x.slug}: ${error.message}`)
    } else {
      console.log(`OK ${x.slug}`)
    }
  }
} else if (wantWrite && !toWrite.length) {
  console.log('\n--write: nothing to update (no successful suggestions).')
} else {
  console.log(
    '\nDry-run complete. Re-run with `npm run backfill:editor-notes:write` after you verify the suggested lines.',
  )
}
