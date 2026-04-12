import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchIgdbGenreMatches } from '../server/igdbGenres'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const q = String(req.query.q ?? '').trim()
  const clientId = process.env.IGDB_CLIENT_ID ?? ''
  const clientSecret = process.env.IGDB_CLIENT_SECRET ?? ''

  try {
    const matches = await fetchIgdbGenreMatches(q, clientId, clientSecret)
    res.status(200).json({ matches })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    const status = message.includes('not configured') ? 503 : 500
    res.status(status).json({ error: message })
  }
}
