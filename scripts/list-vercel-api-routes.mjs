#!/usr/bin/env node
/**
 * Lists Vercel Serverless Function entry files under /api (shared code lives in server/lib/).
 * Only the catch-all `api/[...slug].ts` counts as ONE function.
 *
 *   npm run vercel:list-functions
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const apiDir = path.join(root, 'api')

function collectApiRouteFiles(dir, relParts = []) {
  /** @type {string[]} */
  const files = []
  if (!fs.existsSync(dir)) {
    console.error('No api/ directory found.')
    return files
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const nextRel = [...relParts, e.name]
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'lib') continue
      files.push(...collectApiRouteFiles(abs, nextRel))
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      files.push(nextRel.join('/'))
    }
  }
  return files
}

console.log('--- Vercel Serverless Function entry files (api/**/*.ts; handlers only) ---\n')
const entries = collectApiRouteFiles(apiDir).sort()
console.log(`Physical function count: ${entries.length} (Hobby limit: 12)\n`)
for (const r of entries) {
  console.log(`  api/${r}`)
}

console.log('\n--- Logical routes (same URLs as before; all hit the catch-all) ---')
const logical = [
  'GET  /api/hltb-search',
  'GET  /api/hltb-detail',
  'GET  /api/igdb-genres',
  'POST /api/add-game',
  'POST /api/update-game',
  'POST /api/editor-lookup-bundle',
  'POST /api/backloggd-suggestions',
  'POST /api/review-outline-from-summary',
  'POST /api/review-summary-suggest',
  'POST /api/editor-note-from-summary',
  'POST /api/review-summary-english-level',
  'POST /api/review-pros-cons-tidy',
  'POST /api/sample-cover-accent',
  'GET  /api/steam-visibility',
  'POST /api/notify-comment',
  'GET  /api/review',
]
for (const l of logical) console.log(`  ${l}`)

const outputConfig = path.join(root, '.vercel/output/config.json')
if (fs.existsSync(outputConfig)) {
  console.log('\n--- .vercel/output/config.json present (run: npx vercel build) ---')
}

console.log('\n--- Dashboard: Project → Deployments → [deployment] → Functions ---\n')
