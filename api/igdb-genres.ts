import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchIgdbGenreMatches } from './lib/igdbGenres'

function firstQueryParam(value: string | string[] | undefined): string {
  if (value == null) return ''
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : String(v)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const q = firstQueryParam(req.query.q).trim()
  const clientId = (process.env.IGDB_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.IGDB_CLIENT_SECRET ?? '').trim()

  try {
    const matches = await fetchIgdbGenreMatches(q, clientId, clientSecret)
    res.status(200).json({ matches })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    const status = message.includes('not configured') ? 503 : 500
    res.status(status).json({ error: message })
  }
}
