import clsx from 'clsx'
import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameStatAxis, GameStats } from '../review/gameStats'
import { statAxes, statAxisTooltips } from '../review/gameStats'

type StatRadarProps = {
  stats: GameStats
  fill: string
  stroke: string
  gridStroke?: string
  labelColor?: string
  /** Coordinate space for geometry (viewBox); display size follows unless `fillContainer`. */
  size?: number
  label?: string
  /** Stretch SVG to fill parent; parent should set height/width (e.g. aspect-square + w-full). */
  fillContainer?: boolean
  className?: string
}

function wedgePoints(
  cx: number,
  cy: number,
  r: number,
  axisIndex: number,
  n: number,
): string {
  const mid = (Math.PI * 2 * axisIndex) / n - Math.PI / 2
  const da = Math.PI / n
  const a1 = mid - da
  const a2 = mid + da
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const x2 = cx + r * Math.cos(a2)
  const y2 = cy + r * Math.sin(a2)
  return `${cx},${cy} ${x1},${y1} ${x2},${y2}`
}

function axisTipText(axis: GameStatAxis, stats: GameStats) {
  return `${axis} (${stats[axis]}): ${statAxisTooltips[axis]}`
}

export function StatRadar({
  stats,
  fill,
  stroke,
  gridStroke = 'currentColor',
  labelColor = 'currentColor',
  size = 220,
  label = 'Review radar',
  fillContainer = false,
  className,
}: StatRadarProps) {
  const [hoverTip, setHoverTip] = useState<string | null>(null)
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 })

  const clampTip = useCallback((clientX: number, clientY: number) => {
    const pad = 12
    const maxW = 288
    const maxH = 72
    const x = Math.min(clientX + pad, window.innerWidth - maxW - 8)
    const y = Math.min(clientY + pad, window.innerHeight - maxH - 8)
    return { x: Math.max(8, x), y: Math.max(8, y) }
  }, [])

  const showTip = useCallback(
    (text: string, clientX: number, clientY: number) => {
      setHoverTip(text)
      setTipPos(clampTip(clientX, clientY))
    },
    [clampTip],
  )

  const moveTip = useCallback(
    (clientX: number, clientY: number) => {
      setTipPos(clampTip(clientX, clientY))
    },
    [clampTip],
  )

  const hideTip = useCallback(() => {
    setHoverTip(null)
  }, [])

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const n = statAxes.length

  const pointFor = (value: number, i: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const rr = (r * value) / 100
    return { x: cx + rr * Math.cos(angle), y: cy + rr * Math.sin(angle) }
  }

  const polyPoints = statAxes
    .map((axis, i) => {
      const p = pointFor(stats[axis], i)
      return `${p.x},${p.y}`
    })
    .join(' ')

  const rings = [0.25, 0.5, 0.75, 1] as const

  return (
    <figure
      className={clsx(
        fillContainer
          ? 'relative m-0 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col'
          : 'relative inline-flex flex-col items-center gap-2',
        className,
      )}
    >
      {hoverTip != null
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[200] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-left text-xs leading-snug text-zinc-100 shadow-lg"
              style={{ left: tipPos.x, top: tipPos.y }}
            >
              {hoverTip}
            </div>,
            document.body,
          )
        : null}

      <svg
        width={fillContainer ? '100%' : size}
        height={fillContainer ? '100%' : size}
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="xMidYMid meet"
        className={
          fillContainer ? 'absolute inset-0 h-full max-h-full w-full max-w-full' : undefined
        }
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        {rings.map((t) => (
          <polygon
            key={t}
            points={statAxes
              .map((_, i) => {
                const angle = (Math.PI * 2 * i) / n - Math.PI / 2
                const rr = r * t
                const x = cx + rr * Math.cos(angle)
                const y = cy + rr * Math.sin(angle)
                return `${x},${y}`
              })
              .join(' ')}
            fill="none"
            stroke={gridStroke}
            strokeOpacity={0.35}
            strokeWidth={1}
            pointerEvents="none"
          />
        ))}
        {statAxes.map((axis, i) => (
          <polygon
            key={`hit-${axis}`}
            points={wedgePoints(cx, cy, r, i, n)}
            fill="transparent"
            pointerEvents="all"
            style={{ cursor: 'help' }}
            onPointerEnter={(e) => showTip(axisTipText(axis, stats), e.clientX, e.clientY)}
            onPointerMove={(e) => moveTip(e.clientX, e.clientY)}
            onPointerLeave={hideTip}
          />
        ))}
        {statAxes.map((axis, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2
          const x2 = cx + r * Math.cos(angle)
          const y2 = cy + r * Math.sin(angle)
          return (
            <line
              key={`${axis}-spoke`}
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke={gridStroke}
              strokeOpacity={0.35}
              strokeWidth={1}
              pointerEvents="none"
            />
          )
        })}
        <polygon
          points={polyPoints}
          fill={fill}
          fillOpacity={0.35}
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          pointerEvents="none"
        />
        {statAxes.map((axis, i) => {
          const p = pointFor(stats[axis], i)
          return (
            <circle
              key={`dot-${axis}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={stroke}
              pointerEvents="none"
            />
          )
        })}
        {statAxes.map((axis, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2
          const lr = r + 18
          const lx = cx + lr * Math.cos(angle)
          const ly = cy + lr * Math.sin(angle)
          return (
            <circle
              key={`hit-label-${axis}`}
              cx={lx}
              cy={ly}
              r={26}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'help' }}
              onPointerEnter={(e) => showTip(axisTipText(axis, stats), e.clientX, e.clientY)}
              onPointerMove={(e) => moveTip(e.clientX, e.clientY)}
              onPointerLeave={hideTip}
            />
          )
        })}
        {statAxes.map((axis, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2
          const lr = r + 18
          const lx = cx + lr * Math.cos(angle)
          const ly = cy + lr * Math.sin(angle)
          const anchor =
            Math.abs(Math.cos(angle)) < 0.2
              ? 'middle'
              : Math.cos(angle) > 0
                ? 'start'
                : 'end'
          const baseline =
            Math.abs(Math.sin(angle)) < 0.2
              ? 'middle'
              : Math.sin(angle) > 0
                ? 'hanging'
                : 'auto'
          return (
            <text
              key={`${axis}-label`}
              x={lx}
              y={ly}
              textAnchor={anchor as 'start' | 'middle' | 'end'}
              dominantBaseline={baseline as 'auto' | 'middle' | 'hanging'}
              fill={labelColor}
              fontSize={10}
              fontWeight={600}
              style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
            >
              {axis}
            </text>
          )
        })}
      </svg>
      <figcaption className="sr-only">
        {statAxes.map((axis) => (
          <span key={axis}>
            {axis}: {stats[axis]} out of 100. {statAxisTooltips[axis]}{' '}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
