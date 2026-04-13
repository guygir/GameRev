import clsx from 'clsx'

const KOFI_HREF = 'https://ko-fi.com/guygir'

type KofiSupportButtonProps = {
  /** Matches home/review theme toggle (not `dark:` — this app uses explicit light/dark mode). */
  isLight: boolean
  className?: string
}

/** Ko-fi link: light = site brand purple (ReviewMode “Light”); dark = review accent vars on parent shell. */
export function KofiSupportButton({ isLight, className }: KofiSupportButtonProps) {
  return (
    <div className={clsx('mt-8 flex justify-start', className)}>
      <a
        href={KOFI_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold shadow-lg transition-colors',
          isLight
            ? 'bg-brand text-white shadow-[0_8px_28px_-6px_rgba(130,81,238,0.45)] hover:bg-brand-hover'
            : 'border border-[color:var(--review-accent-border)] bg-[color:var(--review-accent-surface)] text-[color:var(--review-accent-bright)] shadow-[0_0_32px_-10px_var(--review-accent-glow)] hover:brightness-110',
        )}
      >
        <svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          className="shrink-0 fill-current"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
        </svg>
        Buy me a cup of Ko-fi
      </a>
    </div>
  )
}
