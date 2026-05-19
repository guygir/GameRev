#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  scorePipelineStagesBatchWithLlm,
  scoreTextAiLikelihoodWithLlm,
} from '../server/lib/summaryAiDetectorLlm.js'

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

async function main() {
  tryLoadDotEnv()
  const env = process.env
  const text =
    'Gambonanza masterfully reinterprets classic chess mechanics through a roguelike lens, introducing a creative Gambit system.'
  console.log('GROQ_API_KEY:', (env.GROQ_API_KEY ?? '').trim() ? 'set' : '—')
  console.log('GEMINI_API_KEY:', (env.GEMINI_API_KEY ?? '').trim() ? 'set' : '—')
  const single = await scoreTextAiLikelihoodWithLlm(env, 'Gambonanza', text)
  console.log('single:', single)
  const batch = await scorePipelineStagesBatchWithLlm(env, 'Gambonanza', [
    { id: 'draft', label: 'draft', text },
  ])
  console.log('batch:', batch.ok ? Object.fromEntries(batch.scores) : batch.error)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
