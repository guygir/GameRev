import clsx from 'clsx'
import { useId } from 'react'
import type { ReviewMode } from '../review/getReviewTheme'

const R = 76
const CX = 100
const CY = 102
/** Upper semicircle, left → right (y-down: sweep 1 picks the arc through smaller y). */
const ARC_D = `M ${CX - R} ${CY} A ${R} ${R} 0 1 1 ${CX + R} ${CY}`
const ARC_LEN = Math.PI * R

type PopularityGaugeProps = {
  /** 0–1 (clamped). */
  value: number
  mode: ReviewMode
}

export function PopularityGauge({ value, mode }: PopularityGaugeProps) {
  const gid = useId()
  const v = Math.min(1, Math.max(0, value))
  const dash = ARC_LEN * v
  const isDark = mode === 'dark'

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex items-end justify-between gap-2">
        <h2
          className={clsx(
            'text-lg font-semibold tracking-tight',
            isDark ? 'text-[#f5f0ea]' : 'text-zinc-900',
          )}
        >
          Steam footprint
        </h2>
        <span
          className={clsx(
            'font-mono text-xs tabular-nums',
            isDark ? 'text-stone-500' : 'text-zinc-500',
          )}
        >
          {(v * 100).toFixed(0)}%
        </span>
      </div>
      <p className={clsx('text-xs leading-relaxed', isDark ? 'text-stone-500' : 'text-zinc-600')}>
        Review count on the Steam store, log-scaled and nudged by release year — captured when the review was saved, not
        live-updated.
      </p>
      <svg viewBox="0 0 200 118" className="mt-1 w-full max-w-[15rem]" aria-hidden>
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" stopOpacity={isDark ? 0.55 : 0.85} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={isDark ? 1 : 1} />
          </linearGradient>
        </defs>
        <path
          d={ARC_D}
          fill="none"
          stroke={isDark ? 'rgba(255,244,232,0.1)' : '#e4e4e7'}
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={ARC_D}
          fill="none"
          stroke={`url(#${gid}-fill)`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${ARC_LEN}`}
          className={isDark ? 'text-[color:var(--review-accent)]' : 'text-teal-600'}
        />
      </svg>
    </div>
  )
}
