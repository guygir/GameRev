export type IgdbGenreMatch = {
  source: 'igdb'
  title: string
  externalId: string
  genres: string[]
}

let cachedToken: { value: string; exp: number } | null = null

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

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Twitch token failed (${res.status}): ${t.slice(0, 240)}`)
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) {
    throw new Error('Twitch token response missing access_token')
  }

  const ttl = typeof json.expires_in === 'number' ? json.expires_in : 3600
  cachedToken = { value: json.access_token, exp: now + ttl }
  return json.access_token
}

/** IGDB Apicalypse: search games and expand genre names. */
export async function fetchIgdbGenreMatches(
  query: string,
  clientId: string,
  clientSecret: string,
): Promise<IgdbGenreMatch[]> {
  if (!clientId.trim() || !clientSecret.trim()) {
    throw new Error('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not configured')
  }

  const safe = query.trim().replace(/"/g, '').replace(/\n/g, ' ').slice(0, 80)
  if (safe.length < 2) return []

  const token = await getIgdbAccessToken(clientId, clientSecret)
  const apicalypse = `search "${safe}";
fields name, genres.name;
limit 8;
`

  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain',
    },
    body: apicalypse,
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`IGDB request failed (${res.status}): ${t.slice(0, 240)}`)
  }

  const rows = (await res.json()) as Array<{
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
