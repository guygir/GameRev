import type { VercelRequest, VercelResponse } from '@vercel/node'
import { HowLongToBeatService } from 'howlongtobeat'

const hltb = new HowLongToBeatService()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) {
    res.status(400).json({ error: 'Query too short' })
    return
  }

  try {
    const results = await hltb.search(q)
    const trimmed = results.slice(0, 12).map((r) => ({
      id: r.id,
      name: r.name,
      imageUrl: r.imageUrl,
      gameplayMain: r.gameplayMain,
      gameplayMainExtra: r.gameplayMainExtra,
      gameplayCompletionist: r.gameplayCompletionist,
      similarity: r.similarity,
    }))
    res.status(200).json({ results: trimmed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ error: message })
  }
}
