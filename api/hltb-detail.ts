import type { VercelRequest, VercelResponse } from '@vercel/node'
import { HowLongToBeatService } from '@micamerzeau/howlongtobeat'

const hltb = new HowLongToBeatService()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const id = String(req.query.id ?? '').trim()
  if (!id) {
    res.status(400).json({ error: 'Missing id' })
    return
  }

  try {
    const entry = await hltb.detail(id)
    res.status(200).json({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      platforms: entry.platforms,
      imageUrl: entry.imageUrl,
      gameplayMain: entry.gameplayMain,
      gameplayMainExtra: entry.gameplayMainExtra,
      gameplayCompletionist: entry.gameplayCompletionist,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ error: message })
  }
}
