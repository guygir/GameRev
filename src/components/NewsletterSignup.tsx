import { useState } from 'react'
import clsx from 'clsx'

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
      setStatus(json.message ?? 'Check your email to confirm your subscription.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Newsletter signup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={clsx(
        'mt-14 rounded-2xl border p-6',
        isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/5',
        className,
      )}
    >
      <h2 className={clsx('text-lg font-semibold', isLight ? 'text-zinc-950' : 'text-[#fff4e4]')}>
        Get new reviews by email
      </h2>
      <p className={clsx('mt-2 text-sm leading-relaxed', isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70')}>
        Powered by Buttondown: confirm by email, then get one note when a new review is published. Unsubscribe anytime.
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
              ? 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400'
              : 'border-white/10 bg-black/20 text-[#f4e9d8] placeholder:text-[#f4e9d8]/40',
          )}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-lg bg-[color:var(--review-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? 'Sending...' : 'Subscribe'}
        </button>
      </div>
      {status ? <p className={clsx('mt-3 text-sm', isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70')}>{status}</p> : null}
    </section>
  )
}
