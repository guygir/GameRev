/** Parse a 4-digit year from release label text (e.g. "October 2022"). */
export function parseReleaseYearFromLabel(label: string | null | undefined): number | null {
  if (!label) return null
  const m = label.match(/\b(19|20)\d{2}\b/)
  if (!m) return null
  const y = parseInt(m[0], 10)
  if (y < 1970 || y > 2100) return null
  return y
}
