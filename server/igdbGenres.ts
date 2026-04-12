export type IgdbGenreMatch = {
  source: 'igdb'
  title: string
  externalId: string
  genres: string[]
}

let cachedToken: { value: string; exp: number } | null = null

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`${label} returned non-JSON (${trimmed.slice(0, 120)}…)`)
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

async function getIgdbAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now() / 1000
  if (cachedToken && cachedToken.exp > now + 120) {
    return cachedToken.value
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Twitch token failed (${res.status}): ${raw.slice(0, 240)}`)
  }

  const json = parseJsonObject(raw, 'Twitch token')
  const accessToken = typeof json.access_token === 'string' ? json.access_token.trim() : ''
  if (!accessToken) {
    throw new Error('Twitch token response missing access_token')
  }

  const ttl = typeof json.expires_in === 'number' ? json.expires_in : 3600
  cachedToken = { value: accessToken, exp: now + ttl }
  return accessToken
}

/** IGDB Apicalypse: search games and expand genre names. */
export async function fetchIgdbGenreMatches(
  query: string,
  clientId: string,
  clientSecret: string,
): Promise<IgdbGenreMatch[]> {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (!id || !secret) {
    throw new Error('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not configured')
  }

  const safe = query
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/["\\;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (safe.length < 2) return []

  const token = await getIgdbAccessToken(id, secret)
  const apicalypse = `search "${safe}";
fields name, genres.name;
limit 8;
`

  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': id,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain',
    },
    body: apicalypse,
  })

  const igdbRaw = await res.text()
  if (!res.ok) {
    throw new Error(`IGDB request failed (${res.status}): ${igdbRaw.slice(0, 240)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(igdbRaw) as unknown
  } catch {
    throw new Error('IGDB returned invalid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('IGDB returned unexpected response shape')
  }

  const rows = parsed as Array<{
    id?: number
    name?: string
    genres?: Array<{ name?: string }>
  }>

  return rows.map((row) => {
    const genres = (row.genres ?? [])
      .map((g) => (typeof g.name === 'string' ? g.name.trim() : ''))
      .filter(Boolean)
    return {
      source: 'igdb' as const,
      title: (typeof row.name === 'string' && row.name.trim()) || 'Unknown',
      externalId: String(row.id ?? ''),
      genres: [...new Set(genres)],
    }
  })
}
