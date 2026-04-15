import clsx from 'clsx'
import { useId } from 'react'
import type { ReviewMode } from '../review/getReviewTheme'

/**
 * Horizontal semi-axis: arc endpoints at x = 100 and 500 match the centers of three equal
 * label columns (0–200, 200–400, 400–600) so “unknown” / “mainstream” sit under the arc ends.
 */
const RX = 200
/** Vertical semi-axis: shallow arc. */
const RY = 78
const CX = 300
/** Chord (flat base of the semicircle). */
const CY = 170
const ARC_D = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX + RX} ${CY}`

/** Ramanujan ellipse perimeter; upper arc ≈ half. */
function semiEllipseArcLength(rx: number, ry: number): number {
  const a = Math.max(rx, ry)
  const b = Math.min(rx, ry)
  const h = Math.pow((a - b) / (a + b), 2)
  const full = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  return full / 2
}

const ARC_LEN = semiEllipseArcLength(RX, RY)
const STROKE = 18
/** Lift % into the bowl so production / tight viewBoxes don’t clip the bottom of the figures. */
const PCT_BASELINE_Y = CY - 14
const FONT_SIZE_VB = 44

function arcGradientStops(hue: number, mode: ReviewMode): { a: string; b: string; c: string; track: string } {
  if (mode === 'dark') {
    return {
      track: `hsla(${hue}, 16%, 38%, 0.35)`,
      a: `hsla(${hue}, 55%, 48%, 0.45)`,
      b: `hsl(${hue}, 68%, 58%)`,
      c: `hsl(${hue}, 62%, 52%)`,
    }
  }
  return {
    track: `hsla(${hue}, 22%, 90%, 0.75)`,
    a: `hsla(${hue}, 48%, 52%, 0.55)`,
    b: `hsl(${hue}, 52%, 42%)`,
    c: `hsl(${hue}, 46%, 36%)`,
  }
}

type PopularityGaugeProps = {
  value: number
  mode: ReviewMode
  accentHue: number
  fontDisplayClass: string
  fontBodyClass: string
}

export function PopularityGauge({
  value,
  mode,
  accentHue,
  fontDisplayClass,
  fontBodyClass,
}: PopularityGaugeProps) {
  const gid = useId()
  const v = Math.min(1, Math.max(0, value))
  const dash = ARC_LEN * v
  const isDark = mode === 'dark'
  const pct = `${(v * 100).toFixed(0)}%`
  const h = ((Math.round(accentHue) % 360) + 360) % 360
  const stops = arcGradientStops(h, mode)

  const labelTone = isDark ? 'text-[#f4e9d8]/48' : 'text-zinc-500'
  const textFill = isDark ? '#fff4e4' : '#18181b'

  return (
    <section className="w-full" aria-label={`Steam store popularity snapshot, ${pct}`}>
      <div className="mx-auto w-full max-w-[min(100%,36rem)]">
        {/* Room above arc peak and below % baseline (production was clipping the %). */}
        <svg viewBox="0 52 600 140" className="block h-auto w-full" aria-hidden>
          <defs>
            <linearGradient id={`${gid}-arc`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor={stops.a} />
              <stop offset="50%" stopColor={stops.b} />
              <stop offset="100%" stopColor={stops.c} />
            </linearGradient>
            <filter id={`${gid}-glow`} x="-45%" y="-45%" width="190%" height="190%">
              <feGaussianBlur stdDeviation={isDark ? 2.4 : 1.6} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={ARC_D}
            fill="none"
            stroke={stops.track}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <path
            d={ARC_D}
            fill="none"
            stroke={`url(#${gid}-arc)`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${ARC_LEN}`}
            filter={`url(#${gid}-glow)`}
          />
          <text
            x={CX}
            y={PCT_BASELINE_Y}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            fill={textFill}
            className={fontDisplayClass}
            style={{
              fontSize: FONT_SIZE_VB,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {pct}
          </text>
        </svg>
      </div>

      <div
        className={clsx(
          'mt-1.5 grid w-full grid-cols-3 items-start gap-2 px-0 leading-snug sm:gap-3',
          fontBodyClass,
          'text-xs font-semibold uppercase tracking-[0.12em] sm:text-[0.8125rem] sm:tracking-[0.14em]',
          labelTone,
        )}
      >
        <span className="w-full text-center">unknown</span>
        <span className="w-full text-center">niche</span>
        <span className="w-full text-center">mainstream</span>
      </div>
    </section>
  )
}
