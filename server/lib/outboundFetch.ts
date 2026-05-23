import type { ServerProcessEnv } from './serverEnv.js'

type FetchInit = Parameters<typeof fetch>[1]

let insecureDispatcher: import('undici').Dispatcher | undefined

function allowInsecureTls(env: ServerProcessEnv): boolean {
  if ((env.VERCEL ?? '').trim() === '1') return false
  if ((env.NODE_ENV ?? '').trim() === 'production') return false
  return (env.DEV_INSECURE_OUTBOUND_TLS ?? '').trim() === '1'
}

/** Outbound HTTPS from server routes. Optional localhost TLS bypass via DEV_INSECURE_OUTBOUND_TLS=1. */
export async function outboundFetch(
  env: ServerProcessEnv,
  url: string,
  init?: FetchInit,
): Promise<Response> {
  if (!allowInsecureTls(env)) return fetch(url, init)

  const undici = await import('undici')
  if (!insecureDispatcher) {
    insecureDispatcher = new undici.Agent({ connect: { rejectUnauthorized: false } })
  }
  return undici.fetch(url, { ...init, dispatcher: insecureDispatcher }) as unknown as Response
}

export function isDevInsecureTlsEnabled(env: ServerProcessEnv): boolean {
  return allowInsecureTls(env)
}
