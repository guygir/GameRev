import jpeg from 'jpeg-js'
import { dominantHueFromImageData, monoGrayLevelFromImageData } from './coverAccentPixelsNode.js'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function isAllowedCoverUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return h === 'howlongtobeat.com' || h.endsWith('.howlongtobeat.com')
  } catch {
    return false
  }
}

export type CoverAccentSampleSource = 'saturated' | 'mono'

export async function sampleCoverAccentFromUrl(
  rawUrl: string,
  monoBias?: number,
): Promise<
  | { ok: true; source: 'saturated'; hue: number }
  | { ok: true; source: 'mono'; grayLevel: number }
  | { ok: false; error: string }
> {
  const url = rawUrl.trim()
  if (!url) return { ok: false, error: 'Missing url' }
  if (url.length > 2048) return { ok: false, error: 'URL too long' }
  if (!isAllowedCoverUrl(url)) {
    return { ok: false, error: 'Only https://howlongtobeat.com cover URLs are allowed.' }
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 18000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/*;q=0.8,*/*;q=0.5' },
      signal: ac.signal,
    })
    if (!res.ok) {
      return { ok: false, error: `Cover fetch failed (${res.status})` }
    }
    const len = Number(res.headers.get('content-length') ?? '0')
    if (len > 6_000_000) return { ok: false, error: 'Image too large' }
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      return { ok: false, error: 'Expected a JPEG cover (HowLongToBeat).' }
    }
    const decoded = jpeg.decode(buf, { useTArray: true })
    if (!decoded?.data?.length || decoded.width < 2 || decoded.height < 2) {
      return { ok: false, error: 'Could not decode JPEG.' }
    }
    const hueSat = dominantHueFromImageData(decoded.data, decoded.width, decoded.height)
    if (hueSat != null) {
      return { ok: true, hue: hueSat, source: 'saturated' }
    }
    const bias =
      typeof monoBias === 'number' && Number.isFinite(monoBias)
        ? Math.min(100, Math.max(0, Math.round(monoBias)))
        : 50
    const grayLevel = monoGrayLevelFromImageData(decoded.data, decoded.width, decoded.height, bias)
    return { ok: true, source: 'mono', grayLevel }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed'
    if (/abort/i.test(msg)) return { ok: false, error: 'Cover fetch timed out.' }
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}
