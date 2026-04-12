import { useCallback, useMemo, useState } from 'react'
import clsx from 'clsx'
import { getReviewTheme, type ReviewMode } from '../review/getReviewTheme'
import type { CommentRow } from '../types/game'
import { getSupabaseBrowser } from '../lib/supabaseClient'
import {
  DEFAULT_DARK_REVIEW_ACCENT_HUE,
  reviewDarkAccentCssVars,
} from '../review/reviewDarkAccent'

type CommentsSectionProps = {
  gameId: string
  mode: ReviewMode
  initialComments: CommentRow[]
  /** Dark mode: match review page accent (same hue as game slug). */
  darkAccentHue?: number
}

export function CommentsSection({ gameId, mode, initialComments, darkAccentHue }: CommentsSectionProps) {
  const accentHue = darkAccentHue ?? DEFAULT_DARK_REVIEW_ACCENT_HUE
  const theme = useMemo(
    () => getReviewTheme(mode, mode === 'dark' ? { darkAccentHue: accentHue } : undefined),
    [mode, accentHue],
  )
  const [comments, setComments] = useState<CommentRow[]>(initialComments)
  const [body, setBody] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sb = useMemo(() => getSupabaseBrowser(), [])

  const submit = useCallback(async () => {
    const text = body.trim()
    if (!text) {
      setStatus('Write something first.')
      return
    }
    if (!sb) {
      setStatus('Supabase is not configured.')
      return
    }
    setBusy(true)
    setStatus(null)
    const name = authorName.trim() || null
    const { data, error } = await sb
      .from('comments')
      .insert({ game_id: gameId, body: text, author_name: name })
      .select('id, game_id, body, author_name, created_at')
      .single()
    setBusy(false)
    if (error) {
      setStatus(error.message)
      return
    }
    if (data) {
      setComments((prev) => [data as CommentRow, ...prev])
      setBody('')
      setAuthorName('')
      setStatus('Posted.')
    }
  }, [authorName, body, gameId, sb])

  const isDark = mode === 'dark'

  return (
    <section
      className={clsx(
        'relative left-1/2 w-[100vw] max-w-[100vw] -translate-x-1/2 pb-32 pt-4',
        theme.fontBody,
        isDark ? 'grain-bg bg-[#120d0a]' : 'bg-[#f4f4f5]',
      )}
      style={isDark ? reviewDarkAccentCssVars(accentHue) : undefined}
    >
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        <div
          className={clsx(
            'rounded-2xl border p-6 md:p-8',
            isDark
              ? 'border-stone-700/40 bg-[#141210] text-[#ebe6df]'
              : 'border-zinc-200 bg-white text-zinc-900',
          )}
        >
        <h2 className={clsx(theme.fontDisplay, 'text-2xl font-semibold', isDark && 'text-[#f5f0ea]')}>
          Comments
        </h2>
        <p className={clsx('mt-2 text-sm', isDark ? 'text-stone-400' : 'text-zinc-600')}>
          Anonymous — no account. Be kind.
        </p>

        <div className="mt-6">
          {comments.length ? (
            <ul className={clsx('divide-y', isDark ? 'divide-stone-800/60' : 'divide-zinc-200')}>
              {comments.map((c) => (
                <li key={c.id} className="py-5 text-sm leading-relaxed first:pt-0 last:pb-0">
                  <p
                    className={clsx(
                      'text-xs font-semibold uppercase tracking-wide',
                      isDark ? 'text-stone-500' : 'text-zinc-500',
                    )}
                  >
                    {c.author_name?.trim() || 'Anonymous'}
                    <span
                      className={clsx(
                        'ml-2 font-normal normal-case',
                        isDark ? 'text-stone-600' : 'text-zinc-400',
                      )}
                    >
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={clsx('text-sm', isDark ? 'text-stone-500' : 'text-zinc-500')}>No comments yet.</p>
          )}
        </div>

        <div className={clsx('mt-8 border-t pt-8', isDark ? 'border-stone-800/60' : 'border-zinc-200')}>
          <label
            className={clsx('block text-sm font-semibold', isDark ? 'text-stone-300' : 'text-zinc-800')}
          >
            Name (optional)
          </label>
          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={80}
            placeholder="Anonymous"
            className={clsx(
              'mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none ring-brand/30 focus:ring-2',
              isDark
                ? 'border-stone-700/50 bg-[#141210] text-[#ebe6df] placeholder:text-stone-500'
                : 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400',
            )}
          />
          <label
            className={clsx('mt-4 block text-sm font-semibold', isDark ? 'text-stone-300' : 'text-zinc-800')}
          >
            Comment
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="Share your thoughts…"
            className={clsx(
              'mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none ring-brand/30 focus:ring-2',
              isDark
                ? 'border-stone-700/50 bg-[#141210] text-[#ebe6df] placeholder:text-stone-500'
                : 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400',
            )}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className={clsx(
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50',
                isDark
                  ? 'bg-[color:var(--review-accent)] text-[#120d0a] hover:brightness-110'
                  : 'bg-brand text-white hover:bg-brand-hover',
              )}
            >
              {busy ? 'Posting…' : 'Post comment'}
            </button>
            {status ? (
              <p className={clsx('text-sm', isDark ? 'text-stone-400' : 'text-zinc-600')}>{status}</p>
            ) : null}
          </div>
        </div>
      </div>
      </div>
    </section>
  )
}
