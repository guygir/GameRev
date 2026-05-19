const DEFAULT_PUBLIC_SITE_URL = 'https://game-rev.vercel.app'

/** Canonical public URL for `/g/:slug` (Backloggd paste, sharing). */
export function publicReviewUrl(slug: string): string {
  const base =
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim().replace(/\/+$/, '') ||
    DEFAULT_PUBLIC_SITE_URL
  return `${base}/g/${slug}`
}

export function buildBackloggdPasteText(opts: {
  editorNote: string
  summary: string
  slug: string
}): string {
  const note = opts.editorNote.trim()
  const summary = opts.summary.trim()
  const url = publicReviewUrl(opts.slug)
  return `${note}\n[Click here for my full review.](${url})\n\n${summary}`
}
