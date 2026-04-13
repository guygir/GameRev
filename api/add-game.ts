import type { VercelRequest, VercelResponse } from '@vercel/node'
import { addGameFromBody } from './lib/addGame.js'

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

  const out = await addGameFromBody(body, {
    supabaseUrl: process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    addGamePassword: process.env.ADD_GAME_PASSWORD ?? '',
  })

  if (out.ok === false) {
    res.status(out.status).json({ error: out.error })
    return
  }

  res.status(200).json({ slug: out.slug })
}
