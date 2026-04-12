import type { AccentPresetIndex } from '../review/reviewDarkAccent'
import { presetIndexFromImageData } from './coverAccentPresetFromPixels'

/**
 * Samples the cover in the browser (canvas). Usually fails for HowLongToBeat URLs
 * because they omit CORS headers — prefer `/api/sample-cover-accent` from the app instead.
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
        const { data, width, height } = ctx.getImageData(0, 0, w, h)
        done(presetIndexFromImageData(data, width, height))
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
