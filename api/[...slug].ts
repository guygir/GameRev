import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleGamerevApi } from '../server/lib/gamerevApiHandler.js'

function parseBody(req: VercelRequest): unknown | null {
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

/** One Serverless Function for all `/api/*` routes (Hobby function-count limit). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url || '/', `https://${host}`)

  let jsonBody: unknown | undefined
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const parsed = parseBody(req)
    if (parsed === null) {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }
    jsonBody = parsed
  }

  const out = await handleGamerevApi({
    method: req.method || 'GET',
    pathname: url.pathname,
    searchParams: url.searchParams,
    jsonBody,
    env: process.env,
  })

  res.status(out.status).json(out.body)
}
