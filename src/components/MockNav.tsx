import { Link } from 'react-router-dom'
import clsx from 'clsx'

type MockNavProps = {
  crumbs: { label: string; to?: string }[]
  homeLabel?: string
  homeTo?: string
  className?: string
}

export function MockNav({
  crumbs,
  className,
  homeLabel = 'GameRev',
  homeTo = '/',
}: MockNavProps) {
  return (
    <nav aria-label="Breadcrumb" className={clsx('text-sm', className)}>
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link className="underline-offset-4 hover:underline" to={homeTo}>
            {homeLabel}
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            <span aria-hidden className="opacity-40">
              /
            </span>
            {c.to ? (
              <Link className="underline-offset-4 hover:underline" to={c.to}>
                {c.label}
              </Link>
            ) : (
              <span className="font-medium">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
