#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runEditorLookupBundle } from '../server/lib/editorLookupBundle.js'

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}

async function main() {
  tryLoadDotEnv()
  try {
    const out = await runEditorLookupBundle(process.env, {
      query: 'Shotgun King: The Final Checkmate',
    })
    console.log(JSON.stringify(out, null, 2).slice(0, 3000))
  } catch (e) {
    console.error('THREW:', e)
  }
}

main()
