import { useEffect, useState } from 'react'
import clsx from 'clsx'

const MAX_LENGTH = 500

type SuggestionBoxProps = {
  isLight: boolean
  className?: string
}

export function SuggestionBox({ isLight, className }: SuggestionBoxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [text, setText] = useState('')
  const [nickname, setNickname] = useState('')
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [issueUrl, setIssueUrl] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && status !== 'sending') setIsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, status])

  const reset = () => {
    setText('')
    setNickname('')
    setWebsite('')
    setErrorMessage('')
    setIssueUrl('')
    setStatus('idle')
  }

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed) {
      setErrorMessage('Write a suggestion first.')
      setStatus('error')
      return
    }
    setStatus('sending')
    setErrorMessage('')
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          nickname: nickname.trim() || null,
          pageUrl: window.location.href,
          website,
        }),
      })
      const json = (await res.json()) as { success?: boolean; issueUrl?: string; error?: string }
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to submit suggestion.')
      }
      setIssueUrl(json.issueUrl ?? '')
      setStatus('success')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Network error. Please try again.')
      setStatus('error')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setIsOpen(true)
        }}
        className={clsx(
          'mt-4 inline-flex self-start rounded-lg px-4 py-2 text-sm font-semibold shadow-lg transition-colors',
          isLight
            ? 'bg-brand text-white shadow-[0_8px_28px_-6px_rgba(130,81,238,0.45)] hover:bg-brand-hover'
            : 'border border-[color:var(--review-accent-border)] bg-[color:var(--review-accent-surface)] text-[color:var(--review-accent-bright)] shadow-[0_0_32px_-10px_var(--review-accent-glow)] hover:brightness-110',
          className,
        )}
      >
        Suggest a feature
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            if (status !== 'sending') setIsOpen(false)
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggestion-title"
        >
          <div
            className={clsx(
              'w-full max-w-md rounded-2xl border p-6 shadow-2xl',
              isLight ? 'border-zinc-200 bg-white text-zinc-950' : 'border-white/10 bg-[#17110d] text-[#fff4e4]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="suggestion-title" className="text-lg font-bold">
              Suggest a feature
            </h2>
            <p className={clsx('mt-2 text-sm leading-relaxed', isLight ? 'text-zinc-600' : 'text-[#f4e9d8]/70')}>
              Share a site idea or review request. It creates a standalone GitHub issue.
            </p>

            {status === 'success' ? (
              <div className="mt-5 space-y-3">
                <p className="font-medium text-emerald-500">Thanks, your suggestion was submitted.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 rounded-lg bg-[color:var(--review-accent)] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Close
                  </button>
                  {issueUrl ? (
                    <a
                      href={issueUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-semibold"
                    >
                      View issue
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <label className="block text-sm font-semibold">
                  Name (optional)
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value.slice(0, 80))}
                    disabled={status === 'sending'}
                    placeholder="Anonymous"
                    className={clsx(
                      'mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--review-accent)]',
                      isLight
                        ? 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400'
                        : 'border-white/10 bg-black/20 text-[#f4e9d8] placeholder:text-[#f4e9d8]/40',
                    )}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Suggestion
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
                    rows={5}
                    maxLength={MAX_LENGTH}
                    disabled={status === 'sending'}
                    placeholder="Your suggestion..."
                    className={clsx(
                      'mt-2 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--review-accent)]',
                      isLight
                        ? 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400'
                        : 'border-white/10 bg-black/20 text-[#f4e9d8] placeholder:text-[#f4e9d8]/40',
                    )}
                  />
                </label>
                <input
                  aria-hidden
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="hidden"
                  placeholder="Website"
                />
                <p className={clsx('text-xs', isLight ? 'text-zinc-500' : 'text-[#f4e9d8]/50')}>
                  {text.length}/{MAX_LENGTH}
                </p>
                {status === 'error' ? <p className="text-sm font-medium text-rose-500">{errorMessage}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={status === 'sending'}
                    className={clsx(
                      'flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50',
                      isLight ? 'bg-zinc-100 text-zinc-800' : 'bg-white/10 text-[#f4e9d8]',
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={status === 'sending' || !text.trim()}
                    className="flex-1 rounded-lg bg-[color:var(--review-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {status === 'sending' ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
