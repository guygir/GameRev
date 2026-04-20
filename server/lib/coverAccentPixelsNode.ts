/** Dominant hue from JPEG pixels — Node-only for `/api/sample-cover-accent` (Vercel). */

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

/** Center of the strongest 10° hue bin (0–359), or null if no saturated color. */
export function dominantHueFromImageData(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): number | null {
  const buckets = new Float64Array(36)
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    const row = y * stride
    for (let x = 0; x < width; x++) {
      const i = row + x * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const { h, s, l } = rgbToHsl(r, g, b)
      if (s < 0.12 || l < 0.07 || l > 0.96) continue
      const weight = s * (1 - Math.abs(l - 0.5) * 1.8)
      const bin = Math.floor((((h % 360) + 360) % 360) / 10) % 36
      buckets[bin] += weight
    }
  }
  let bestBin = 0
  let bestW = -1
  for (let b = 0; b < 36; b++) {
    if (buckets[b]! > bestW) {
      bestW = buckets[b]!
      bestBin = b
    }
  }
  if (bestW <= 0) return null
  return bestBin * 10 + 5
}

/**
 * For low-saturation (B&W / gray) covers: derive **accent_gray_level** (0–100) from luminance + light/dark balance.
 * Stored on the game row and rendered as **achromatic** review accents (no chromatic hue).
 * `monoBias` 0 = nudge darker, 100 = nudge lighter (Add Game slider).
 */
export function monoGrayLevelFromImageData(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  monoBias: number,
): number {
  const bias = Math.min(100, Math.max(0, monoBias))
  const stride = width * 4
  let sumL = 0
  let nGray = 0
  let light = 0
  let dark = 0
  let sumLAll = 0
  let nAll = 0

  for (let y = 0; y < height; y++) {
    const row = y * stride
    for (let x = 0; x < width; x++) {
      const i = row + x * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const { s, l } = rgbToHsl(r, g, b)
      sumLAll += l
      nAll++
      if (s < 0.22) {
        sumL += l
        nGray++
        if (l > 0.62) light++
        if (l < 0.38) dark++
      }
    }
  }

  const avgL = nGray >= 16 ? sumL / nGray : nAll > 0 ? sumLAll / nAll : 0.45
  const denom = light + dark
  const wb = denom > 0 ? light / denom : 0.5
  const fromL = Math.round((1 - avgL) * 72 + avgL * 28)
  const fromBalance = Math.round(wb * 62 + (1 - wb) * 38)
  const blended = Math.round(fromL * 0.55 + fromBalance * 0.45)
  const nudge = Math.round((bias - 50) * 0.85)
  return Math.min(100, Math.max(0, blended + nudge))
}
