import clsx from 'clsx'
import { useId } from 'react'
import type { ReviewMode } from '../review/getReviewTheme'

/**
 * Horizontal semi-axis: arc endpoints at x = 100 and 500 match the centers of three equal
 * label columns (0–200, 200–400, 400–600) so “unknown” / “mainstream” sit under the arc ends.
 */
const RX = 208
/** Vertical semi-axis: shallow arc (slightly taller = gauge reads larger). */
const RY = 84
const CX = 300
/** Chord (flat base of the semicircle); sits a bit lower so arc sits closer to caption row. */
const CY = 176
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
const STROKE = 20
/** Slightly lower in the bowl (larger y) so it sits closer to the scale captions. */
const PCT_BASELINE_Y = CY - 9
const FONT_SIZE_VB = 44

/**
 * Arc + % only; keep a modest band below the % for stroke/glow without a large empty gap before HTML captions.
 */
const VIEW_Y0 = 48
const VIEW_HEIGHT = 162

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
    <section
      className="w-full overflow-visible pb-1.5"
      aria-label={`Steam store popularity snapshot, ${pct}. Scale: unknown, niche, mainstream.`}
    >
      <div className="mx-auto w-full max-w-[min(100%,36rem)] overflow-visible px-0.5">
        <svg
          viewBox={`0 ${VIEW_Y0} 600 ${VIEW_HEIGHT}`}
          className="block h-auto w-full overflow-visible"
          overflow="visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${gid}-arc`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor={stops.a} />
              <stop offset="50%" stopColor={stops.b} />
              <stop offset="100%" stopColor={stops.c} />
            </linearGradient>
            <filter id={`${gid}-glow`} x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation={isDark ? 2.2 : 1.5} result="b" />
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

        <div
          className={clsx(
            'mt-1 grid w-full grid-cols-3 items-start gap-2 px-0 pb-1 pt-0 leading-snug sm:gap-3',
            fontBodyClass,
            'text-base font-semibold uppercase tracking-[0.09em] sm:text-lg sm:tracking-[0.11em]',
            labelTone,
          )}
        >
          <span className="w-full text-center">unknown</span>
          <span className="w-full text-center">niche</span>
          <span className="w-full text-center">mainstream</span>
        </div>
      </div>
    </section>
  )
}
