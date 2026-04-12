import { ACCENT_PRESET_HUES, type AccentPresetIndex } from '../review/reviewDarkAccent'

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
        break
      case gn:
        h = ((bn - rn) / d + 2) / 6
        break
      default:
        h = ((rn - gn) / d + 4) / 6
    }
  }
  return { h: h * 360, s, l }
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

/** Pick preset index whose hue is closest to `hue`. */
export function nearestAccentPresetIndex(hue: number): AccentPresetIndex {
  let best: AccentPresetIndex = 0
  let bestD = Infinity
  for (let i = 0; i < ACCENT_PRESET_HUES.length; i++) {
    const d = hueDistance(hue, ACCENT_PRESET_HUES[i]!)
    if (d < bestD) {
      bestD = d
      best = i as AccentPresetIndex
    }
  }
  return best
}

/**
 * Samples the cover in the browser (canvas). Works only when the image host sends CORS headers
 * (`Access-Control-Allow-Origin`) so the canvas is not tainted — many CDN covers do; some do not.
 * Returns the closest preset index 0–4, or null if decoding failed.
 */
export async function suggestAccentPresetFromCoverUrl(imageUrl: string | null): Promise<AccentPresetIndex | null> {
  if (!imageUrl?.trim()) return null
  try {
    const u = new URL(imageUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  } catch {
    return null
  }

  return new Promise((resolve) => {
    const done = (v: AccentPresetIndex | null) => resolve(v)
    const t = window.setTimeout(() => done(null), 12000)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      window.clearTimeout(t)
      try {
        const w = 48
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          done(null)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        const buckets = new Float64Array(36)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!
          const g = data[i + 1]!
          const b = data[i + 2]!
          const { h, s, l } = rgbToHsl(r, g, b)
          if (s < 0.12 || l < 0.07 || l > 0.96) continue
          const weight = s * (1 - Math.abs(l - 0.5) * 1.8)
          const bin = Math.floor(((h % 360) + 360) % 360 / 10) % 36
          buckets[bin] += weight
        }
        let bestBin = 0
        let bestW = -1
        for (let b = 0; b < 36; b++) {
          if (buckets[b]! > bestW) {
            bestW = buckets[b]!
            bestBin = b
          }
        }
        if (bestW <= 0) {
          done(null)
          return
        }
        const dominantHue = bestBin * 10 + 5
        done(nearestAccentPresetIndex(dominantHue))
      } catch {
        done(null)
      }
    }
    img.onerror = () => {
      window.clearTimeout(t)
      done(null)
    }
    img.src = imageUrl
  })
}
