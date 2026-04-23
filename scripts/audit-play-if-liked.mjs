#!/usr/bin/env node
/**
 * Audit `games.play_if_liked` vs current catalog titles (same rules as save-time resolve).
 * Optional `--fix`: UPDATE rows where stored JSON ≠ resolve(); repeats until stable (cross-links).
 *
 * Usage (from repo root):
 *   node scripts/audit-play-if-liked.mjs
 *   node scripts/audit-play-if-liked.mjs --fix
 *   node --env-file=.env scripts/audit-play-if-liked.mjs --fix
 *
 * Reads URL from VITE_SUPABASE_URL or SUPABASE_URL; key from SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const wantFix = process.argv.includes('--fix')

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
    break
  }
}

function buildReviewedLookup(rows) {
  const m = new Map()
  for (const r of rows) {
    m.set(r.name.trim().toLowerCase(), { slug: r.slug, name: r.name })
  }
  return m
}

function resolvePlayIfLiked(picks, reviewed) {
  const out = []
  for (const pick of picks) {
    const key = pick.name.trim().toLowerCase()
    const hit = reviewed.get(key)
    if (hit) out.push({ name: hit.name, slug: hit.slug })
    else out.push({ name: pick.name.trim(), slug: null })
  }
  return out
}

function stableJson(a) {
  return JSON.stringify(a)
}

function picksFromStored(stored) {
  return stored.map((p) => ({ name: p.name }))
}

function playIfLikedListsName(raw, nameLower) {
  if (!Array.isArray(raw)) return false
  const want = nameLower.trim().toLowerCase()
  if (!want) return false
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const n = String(item.name ?? '')
      .trim()
      .toLowerCase()
    if (n === want) return true
  }
  return false
}

function mutualPartnerSlugs(rows, selfId, selfName, playPicks) {
  const selfKey = selfName.trim().toLowerCase()
  const out = []
  for (const pick of playPicks) {
    const pk = pick.name.trim().toLowerCase()
    if (!pk) continue
    const y = rows.find((r) => r.id !== selfId && r.name.trim().toLowerCase() === pk)
    if (!y) continue
    if (playIfLikedListsName(y.play_if_liked, selfKey)) out.push(y.slug)
  }
  return [...new Set(out)]
}

function normalizeStored(raw) {
  const stored = Array.isArray(raw) ? raw : []
  return stored.map((item) => {
    if (!item || typeof item !== 'object') return { name: '?', slug: null }
    const name = String(item.name ?? '').trim()
    const slug = item.slug == null || item.slug === '' ? null : String(item.slug)
    return { name, slug }
  })
}

tryLoadDotEnv()

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!url || !key) {
  console.error(
    'Missing VITE_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Run from repo root with .env, e.g.:\n  node --env-file=.env scripts/audit-play-if-liked.mjs',
  )
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function loadGames() {
  const { data: rows, error } = await sb
    .from('games')
    .select('id, name, slug, play_if_liked')
    .order('catalog_rank', { ascending: true })
  if (error) throw new Error(error.message)
  return rows ?? []
}

let games = await loadGames()
const slugSet = new Set(games.map((g) => g.slug))

console.log(`Games in catalog: ${games.length}`)
if (wantFix) {
  console.log('Mode: --fix (will UPDATE rows where stored ≠ resolve)\n')
} else {
  console.log('Mode: audit only (pass --fix to apply updates)\n')
}

let reviewed = buildReviewedLookup(games.map((g) => ({ name: g.name, slug: g.slug })))

const issues = {
  missingSlugExact: [],
  orphanSlug: [],
  slugNameMismatch: [],
  staleVsResolve: [],
  mutualButUnlinked: [],
}

function collectIssues(gamesList) {
  issues.missingSlugExact.length = 0
  issues.orphanSlug.length = 0
  issues.slugNameMismatch.length = 0
  issues.staleVsResolve.length = 0
  issues.mutualButUnlinked.length = 0

  const rev = buildReviewedLookup(gamesList.map((g) => ({ name: g.name, slug: g.slug })))

  for (const g of gamesList) {
    const normalized = normalizeStored(g.play_if_liked)
    const picks = picksFromStored(normalized)
    const resolved = resolvePlayIfLiked(picks, rev)

    if (stableJson(normalized) !== stableJson(resolved)) {
      issues.staleVsResolve.push({
        slug: g.slug,
        name: g.name,
        detail: `stored ≠ resolve()`,
        stored: normalized,
        resolved,
      })
    }

    for (const item of normalized) {
      const key = item.name.trim().toLowerCase()
      const hit = rev.get(key)
      if (hit && (item.slug == null || item.slug === '')) {
        issues.missingSlugExact.push({
          from: g.slug,
          fromTitle: g.name,
          pick: item.name,
          wouldLinkTo: hit.slug,
        })
      }
      if (item.slug && !slugSet.has(item.slug)) {
        issues.orphanSlug.push({
          from: g.slug,
          fromTitle: g.name,
          pick: item.name,
          badSlug: item.slug,
        })
      }
      if (item.slug && hit && hit.slug !== item.slug) {
        issues.slugNameMismatch.push({
          from: g.slug,
          pick: item.name,
          storedSlug: item.slug,
          catalogSlug: hit.slug,
        })
      }
    }

    const partners = mutualPartnerSlugs(gamesList, g.id, g.name, picks)
    for (const item of normalized) {
      if (item.slug != null && item.slug !== '') continue
      const hit = rev.get(item.name.trim().toLowerCase())
      if (!hit) continue
      if (partners.includes(hit.slug)) {
        issues.mutualButUnlinked.push({
          from: g.slug,
          fromTitle: g.name,
          pick: item.name,
          partnerSlug: hit.slug,
        })
      }
    }
  }
}

collectIssues(games)

function printSection(title, arr) {
  console.log(`\n## ${title} (${arr.length})`)
  if (!arr.length) {
    console.log('  (none)')
    return
  }
  for (const x of arr) {
    console.log(' ', JSON.stringify(x))
  }
}

printSection('Missing slug but exact catalog title match', issues.missingSlugExact)
printSection('Mutual pair in DB but pick still unlinked', issues.mutualButUnlinked)
printSection('Orphan slug (no game with that slug)', issues.orphanSlug)
printSection('Slug does not match catalog slug for that title', issues.slugNameMismatch)
printSection('Whole play_if_liked JSON differs from resolve()', issues.staleVsResolve)

const toResave = new Set()
for (const x of issues.staleVsResolve) toResave.add(x.slug)
for (const x of issues.missingSlugExact) toResave.add(x.from)
for (const x of issues.mutualButUnlinked) toResave.add(x.from)
for (const x of issues.slugNameMismatch) toResave.add(x.from)
for (const x of issues.orphanSlug) toResave.add(x.from)

console.log(`\n## Rows that would match after resolve (same as Add Game save)`)
console.log(`   Slugs: ${[...toResave].sort().join(', ') || '(none)'}`)

if (wantFix) {
  const maxRounds = 12
  let totalUpdated = 0
  for (let round = 0; round < maxRounds; round++) {
    games = await loadGames()
    reviewed = buildReviewedLookup(games.map((g) => ({ name: g.name, slug: g.slug })))
    const pending = []
    for (const g of games) {
      const normalized = normalizeStored(g.play_if_liked)
      const picks = picksFromStored(normalized)
      const resolved = resolvePlayIfLiked(picks, reviewed)
      if (stableJson(normalized) !== stableJson(resolved)) {
        pending.push({ id: g.id, slug: g.slug, resolved })
      }
    }
    if (!pending.length) {
      console.log(`\n## Fix: converged after ${round} round(s); ${totalUpdated} row(s) updated in total.`)
      break
    }
    for (const p of pending) {
      const { error: u } = await sb.from('games').update({ play_if_liked: p.resolved }).eq('id', p.id)
      if (u) {
        console.error(`UPDATE failed for ${p.slug}:`, u.message)
        process.exit(1)
      }
    }
    totalUpdated += pending.length
    console.log(`\n## Fix: round ${round + 1} — updated ${pending.length} row(s): ${pending.map((p) => p.slug).join(', ')}`)
    if (round === maxRounds - 1 && pending.length) {
      console.error('\nStopped: still pending changes after max rounds; check data manually.')
      process.exit(1)
    }
  }

  games = await loadGames()
  collectIssues(games)
  console.log('\n## Post-fix audit (should be clean for resolve drift)')
  printSection('Whole play_if_liked JSON differs from resolve()', issues.staleVsResolve)
  printSection('Orphan slug', issues.orphanSlug)
  if (issues.staleVsResolve.length || issues.orphanSlug.length) {
    console.log('\nSome issues remain (titles not in catalog, etc.). See sections above.')
  } else {
    console.log('\nResolve drift and orphan slugs: clear. New submits use server mutual pass only.')
  }
}

console.log('\nDone.')
