const HLTB_BASE_URL = 'https://howlongtobeat.com'
const HLTB_IMAGE_URL = `${HLTB_BASE_URL}/games/`

type HltbBleedInit = {
  token?: unknown
  hpKey?: unknown
  hpVal?: unknown
}

type HltbBleedGame = {
  game_id?: unknown
  game_name?: unknown
  game_image?: unknown
  profile_platform?: unknown
  comp_main?: unknown
  comp_plus?: unknown
  comp_100?: unknown
}

type HltbBleedResponse = {
  data?: unknown
}

export type HltbSearchHit = {
  id: string
  name: string
  imageUrl: string
  platforms: string[]
  gameplayMain: number
  gameplayMainExtra: number
  gameplayCompletionist: number
  similarity: number
}

function browserHeaders(referer = `${HLTB_BASE_URL}/`): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    referer,
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  }
}

function numberFromSeconds(raw: unknown): number {
  const seconds = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  return Math.round(seconds / 3600)
}

function platformsFromRaw(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

function calcSimilarity(a: string, b: string): number {
  const left = a.toLowerCase().trim()
  const right = b.toLowerCase().trim()
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.9

  const longer = left.length >= right.length ? left : right
  const shorter = left.length >= right.length ? right : left
  const dp = Array.from({ length: shorter.length + 1 }, (_, i) => i)
  for (let i = 1; i <= longer.length; i += 1) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= shorter.length; j += 1) {
      const tmp = dp[j]!
      dp[j] =
        longer[i - 1] === shorter[j - 1]
          ? prev
          : Math.min(prev + 1, dp[j]! + 1, dp[j - 1]! + 1)
      prev = tmp
    }
  }
  return Math.round(((longer.length - dp[shorter.length]!) / longer.length) * 100) / 100
}

async function hltbJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return JSON.parse(text) as T
}

async function searchOnce(query: string, signal?: AbortSignal): Promise<HltbSearchHit[]> {
  const init = await hltbJson<HltbBleedInit>(`${HLTB_BASE_URL}/api/bleed/init?t=${Date.now()}`, {
    headers: browserHeaders(),
    signal,
  })
  const token = typeof init.token === 'string' ? init.token : ''
  const hpKey = typeof init.hpKey === 'string' ? init.hpKey : ''
  const hpVal = typeof init.hpVal === 'string' ? init.hpVal : ''
  if (!token) throw new Error('HowLongToBeat did not return a search token.')

  const searchTerms = query.trim().split(/\s+/).filter(Boolean)
  const payload: Record<string, unknown> = {
    searchType: 'games',
    searchTerms,
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  }
  if (hpKey && hpVal) payload[hpKey] = hpVal

  const response = await hltbJson<HltbBleedResponse>(`${HLTB_BASE_URL}/api/bleed`, {
    method: 'POST',
    headers: {
      ...browserHeaders(`${HLTB_BASE_URL}/?q=${encodeURIComponent(query)}`),
      'content-type': 'application/json',
      origin: HLTB_BASE_URL,
      'x-auth-token': token,
      ...(hpKey ? { 'x-hp-key': hpKey } : {}),
      ...(hpVal ? { 'x-hp-val': hpVal } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  })

  const rows = Array.isArray(response.data) ? (response.data as HltbBleedGame[]) : []
  return rows.map((row) => {
    const id = typeof row.game_id === 'number' || typeof row.game_id === 'string' ? String(row.game_id) : ''
    const name = typeof row.game_name === 'string' ? row.game_name : ''
    const image = typeof row.game_image === 'string' ? row.game_image : ''
    return {
      id,
      name,
      imageUrl: image ? `${HLTB_IMAGE_URL}${image}` : '',
      platforms: platformsFromRaw(row.profile_platform),
      gameplayMain: numberFromSeconds(row.comp_main),
      gameplayMainExtra: numberFromSeconds(row.comp_plus),
      gameplayCompletionist: numberFromSeconds(row.comp_100),
      similarity: calcSimilarity(name, query),
    }
  })
}

export async function searchHowLongToBeat(query: string, signal?: AbortSignal): Promise<HltbSearchHit[]> {
  try {
    return await searchOnce(query, signal)
  } catch (firstErr) {
    try {
      return await searchOnce(query, signal)
    } catch (secondErr) {
      const first = firstErr instanceof Error ? firstErr.message : String(firstErr)
      const second = secondErr instanceof Error ? secondErr.message : String(secondErr)
      throw new Error(`Unable to search howlongtobeat.com: ${first} | retry: ${second}`)
    }
  }
}
