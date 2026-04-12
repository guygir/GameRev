import { useCallback, useMemo, useState } from 'react'
import clsx from 'clsx'
import { getReviewTheme, type ReviewMode } from '../review/getReviewTheme'
import type { CommentRow } from '../types/game'
import { getSupabaseBrowser } from '../lib/supabaseClient'

type CommentsSectionProps = {
  gameId: string
  mode: ReviewMode
  initialComments: CommentRow[]
}

export function CommentsSection({ gameId, mode, initialComments }: CommentsSectionProps) {
  const theme = useMemo(() => getReviewTheme(mode), [mode])
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
  const shell = isDark
    ? 'border-white/15 bg-zinc-900/75 text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
    : 'border-zinc-200 bg-white text-zinc-900'

  return (
    <section className={clsx('mx-auto max-w-6xl px-4 pb-32 pt-4 md:px-8', theme.fontBody)}>
      <div className={clsx('rounded-2xl border p-6 md:p-8', shell)}>
        <h2 className={clsx(theme.fontDisplay, 'text-2xl font-semibold', isDark && 'text-[#fff4e4]')}>
          Comments
        </h2>
        <p className={clsx('mt-2 text-sm', isDark ? 'text-[#c9b8a4]' : 'text-zinc-600')}>
          Anonymous — no account. Be kind.
        </p>

        <div className="mt-6 space-y-4">
          {comments.length ? (
            <ul className="space-y-4">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className={clsx(
                    'rounded-xl border p-4 text-sm leading-relaxed',
                    isDark ? 'border-zinc-700/80 bg-zinc-800/45 text-zinc-200' : 'border-zinc-200 bg-zinc-50 text-zinc-900',
                  )}
                >
                  <p
                    className={clsx(
                      'text-xs font-semibold uppercase tracking-wide',
                      isDark ? 'text-[#b8a999]' : 'text-zinc-500',
                    )}
                  >
                    {c.author_name?.trim() || 'Anonymous'}
                    <span
                      className={clsx(
                        'ml-2 font-normal normal-case',
                        isDark ? 'text-[#9a8b7a]' : 'text-zinc-400',
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
            <p className={clsx('text-sm', isDark ? 'text-[#b8a999]' : 'text-zinc-500')}>No comments yet.</p>
          )}
        </div>

        <div className={clsx('mt-8 border-t pt-8', isDark ? 'border-zinc-700/60' : 'border-zinc-200')}>
          <label
            className={clsx('block text-sm font-semibold', isDark ? 'text-[#e8d5c4]' : 'text-zinc-800')}
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
                ? 'border-zinc-600 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500'
                : 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400',
            )}
          />
          <label
            className={clsx('mt-4 block text-sm font-semibold', isDark ? 'text-[#e8d5c4]' : 'text-zinc-800')}
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
                ? 'border-zinc-600 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500'
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
                isDark ? 'bg-[#e8b86d] text-[#120d0a] hover:bg-[#ffe7c2]' : 'bg-brand text-white hover:bg-brand-hover',
              )}
            >
              {busy ? 'Posting…' : 'Post comment'}
            </button>
            {status ? (
              <p className={clsx('text-sm', isDark ? 'text-[#c9b8a4]' : 'text-zinc-600')}>{status}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
