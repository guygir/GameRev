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

  const shell = mode === 'light' ? 'border-zinc-200 bg-white text-zinc-900' : 'border-white/10 bg-black/30 text-[#f4e9d8]'

  return (
    <section className={clsx('mx-auto max-w-6xl px-4 pb-32 pt-4 md:px-8', theme.fontBody)}>
      <div className={clsx('rounded-2xl border p-6 md:p-8', shell)}>
        <h2 className={clsx(theme.fontDisplay, 'text-2xl font-semibold')}>Comments</h2>
        <p className="mt-2 text-sm opacity-80">Anonymous — no account. Be kind.</p>

        <div className="mt-6 space-y-4">
          {comments.length ? (
            <ul className="space-y-4">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className={clsx(
                    'rounded-xl border p-4 text-sm leading-relaxed',
                    mode === 'light' ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-white/5',
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-60">
                    {c.author_name?.trim() || 'Anonymous'}
                    <span className="ml-2 font-normal normal-case opacity-50">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm opacity-70">No comments yet.</p>
          )}
        </div>

        <div className="mt-8 border-t border-current/10 pt-8">
          <label className="block text-sm font-semibold">Name (optional)</label>
          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={80}
            placeholder="Anonymous"
            className={clsx(
              'mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none ring-brand/30 focus:ring-2',
              mode === 'light' ? 'border-zinc-200 bg-white' : 'border-white/15 bg-black/40',
            )}
          />
          <label className="mt-4 block text-sm font-semibold">Comment</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={4000}
            className={clsx(
              'mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none ring-brand/30 focus:ring-2',
              mode === 'light' ? 'border-zinc-200 bg-white' : 'border-white/15 bg-black/40',
            )}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className={clsx(
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50',
                mode === 'light' ? 'bg-brand text-white hover:bg-brand-hover' : 'bg-[#e8b86d] text-[#120d0a] hover:bg-[#ffe7c2]',
              )}
            >
              {busy ? 'Posting…' : 'Post comment'}
            </button>
            {status ? <p className="text-sm opacity-80">{status}</p> : null}
          </div>
        </div>
      </div>
    </section>
  )
}
