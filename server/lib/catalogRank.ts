import type { SupabaseClient } from '@supabase/supabase-js'

/** Shift rows at or after `position` up by 1 to make room for an insert at `position` (1-based). */
export async function shiftCatalogRanksUpFrom(
  sb: SupabaseClient,
  position: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rows, error } = await sb
    .from('games')
    .select('id, catalog_rank')
    .gte('catalog_rank', position)
    .order('catalog_rank', { ascending: false })
  if (error) return { ok: false, error: error.message }
  for (const row of rows ?? []) {
    const { error: u } = await sb
      .from('games')
      .update({ catalog_rank: (row.catalog_rank as number) + 1 })
      .eq('id', row.id as string)
    if (u) return { ok: false, error: u.message }
  }
  return { ok: true }
}

/** Assign ranks 1..n in `orderedIds` order (temporary negatives avoid unique conflicts). */
export async function persistCatalogOrder(
  sb: SupabaseClient,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (orderedIds.length === 0) return { ok: true }
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (seen.has(id)) return { ok: false, error: 'Duplicate game id in catalog order' }
    seen.add(id)
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb.from('games').update({ catalog_rank: -(i + 1) }).eq('id', orderedIds[i])
    if (error) return { ok: false, error: error.message }
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb.from('games').update({ catalog_rank: i + 1 }).eq('id', orderedIds[i])
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

export function parseCatalogRankPosition(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}
