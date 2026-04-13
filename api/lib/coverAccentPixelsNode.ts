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
