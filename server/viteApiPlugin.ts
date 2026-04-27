import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { handleGamerevApi } from './lib/gamerevApiHandler.js'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers?: Record<string, string>) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v)
    }
  }
  res.end(JSON.stringify(body))
}

function installApiRoutes(middlewares: Connect.Server, env: Record<string, string>) {
  middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? ''
    if (!rawUrl.startsWith('/api/')) return next()

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const url = new URL(rawUrl, 'http://dev.local')
    const method = req.method || 'GET'

    let jsonBody: unknown | undefined
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const text = await readBody(req)
      if (!text.trim()) {
        jsonBody = {}
      } else {
        try {
          jsonBody = JSON.parse(text) as unknown
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON' })
          return
        }
      }
    }

    try {
      const out = await handleGamerevApi({
        method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        headers: req.headers,
        jsonBody,
        env: { ...process.env, ...env },
      })
      sendJson(res, out.status, out.body, out.headers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Server error'
      const status = /not configured/i.test(message) ? 503 : 500
      sendJson(res, status, { error: message })
    }
  })
}

export function gamerevApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'gamerev-api',
    configureServer(server) {
      installApiRoutes(server.middlewares, env)
    },
    configurePreviewServer(server) {
      installApiRoutes(server.middlewares, env)
    },
  }
}
