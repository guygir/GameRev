/** Long date for “Review published …” (first save); uses local timezone. */
export function formatReviewPublishedLabel(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(d)
}
