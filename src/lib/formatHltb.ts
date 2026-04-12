export function formatHltbHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const rounded = hours % 1 === 0 ? String(Math.round(hours)) : hours.toFixed(1).replace(/\.0$/, '')
  return `${rounded}h`
}
