import { useState } from 'react'
import clsx from 'clsx'

const SUCCESS_MESSAGE =
  'Check your email for a confirmation link.\nThis might take a while... Go read a review in the meantime!'

type NewsletterSignupProps = {
  isLight: boolean
  className?: string
}

export function NewsletterSignup({ isLight, className }: NewsletterSignupProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      setStatus('Enter your email first.')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/newsletter-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Newsletter signup failed.')
      setEmail('')
      setStatus(json.message ?? SUCCESS_MESSAGE)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Newsletter signup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={clsx(
        'rounded-2xl border p-4 shadow-sm',
        isLight ? 'border-zinc-200 bg-white/80' : 'border-white/10 bg-white/5',
        className,
      )}
    >
      <h2 className={clsx('text-base font-semibold', isLight ? 'text-zinc-950' : 'text-[#fff4e4]')}>
        Subscribe to get an email when a new review is up!
      </h2>
      <p className={clsx('mt-2 text-sm leading-relaxed', isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70')}>
        Unsubscribe anytime.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
          className={clsx(
            'min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--review-accent)]',
            isLight
              ? 'border-[color:var(--review-accent-border)] bg-white/90 text-zinc-900 placeholder:text-zinc-400'
              : 'border-[color:var(--review-accent-border)] bg-black/20 text-[#f4e9d8] placeholder:text-[#f4e9d8]/40',
          )}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className={clsx(
            'rounded-lg px-4 py-2 text-sm font-semibold shadow-lg transition-colors disabled:opacity-50',
            isLight
              ? 'bg-brand text-white shadow-[0_8px_28px_-6px_rgba(130,81,238,0.45)] hover:bg-brand-hover'
              : 'border border-[color:var(--review-accent-border)] bg-[color:var(--review-accent-surface)] text-[color:var(--review-accent-bright)] shadow-[0_0_32px_-10px_var(--review-accent-glow)] hover:brightness-110',
          )}
        >
          {busy ? 'Sending...' : 'Subscribe'}
        </button>
      </div>
      {status ? (
        <p className={clsx('mt-3 whitespace-pre-line text-sm', isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70')}>
          {status}
        </p>
      ) : null}
    </section>
  )
}
