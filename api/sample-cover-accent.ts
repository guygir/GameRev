import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sampleCoverAccentFromUrl } from './lib/sampleCoverAccentFromUrl.js'

function parseBody(req: VercelRequest): unknown {
  const raw = req.body
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  return raw
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = parseBody(req)
  if (body === null) {
    res.status(400).json({ error: 'Invalid JSON' })
    return
  }

  const url = typeof (body as { url?: unknown }).url === 'string' ? (body as { url: string }).url : ''
  const out = await sampleCoverAccentFromUrl(url)
  if (out.ok === false) {
    res.status(422).json({ error: out.error })
    return
  }
  res.status(200).json({ hue: out.hue })
}
