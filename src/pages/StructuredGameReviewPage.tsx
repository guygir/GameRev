import { useCallback, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { mockGame, mockPlayIfLiked } from '../mocks/mockGame'
import { GameReviewView, type GameReviewViewModel } from '../components/GameReviewView'
import type { ReviewMode } from '../review/getReviewTheme'
import { formatReviewPublishedLabel } from '../lib/formatReviewPublished'
import { resolveReviewMode, writeReviewModePreference } from '../lib/reviewModePreference'

export function StructuredGameReviewPage() {
  const [params, setParams] = useSearchParams()

  const mode = useMemo(() => resolveReviewMode(params.get('mode')), [params])

  useEffect(() => {
    const q = params.get('mode')
    if (q === 'dark' || q === 'light') writeReviewModePreference(q)
  }, [params])

  const vm: GameReviewViewModel = useMemo(
    () => ({
      name: mockGame.name,
      subtitle: mockGame.subtitle,
      releaseLabel: mockGame.releaseLabel,
      publishedAtLabel: formatReviewPublishedLabel(mockGame.reviewPublishedAtIso),
      coverImageUrl: mockGame.coverImageUrl,
      platforms: [...mockGame.platforms],
      hltbMain: mockGame.hltbMain,
      hltbExtras: mockGame.hltbExtras,
      hltbCompletionist: mockGame.hltbCompletionist,
      genres: [...mockGame.genres],
      tags: [...mockGame.tags],
      playIfLiked: mockPlayIfLiked.map((p) =>
        p.reviewed ? { name: p.name, slug: p.slug } : { name: p.name, slug: null },
      ),
      pros: [...mockGame.pros],
      cons: [...mockGame.cons],
      stats: { ...mockGame.stats },
      radarLabel: 'Signalis review stats radar chart',
    }),
    [],
  )

  const setMode = useCallback(
    (next: ReviewMode) => {
      writeReviewModePreference(next)
      const nextParams = new URLSearchParams(params)
      nextParams.set('mode', next)
      nextParams.delete('pack')
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  return (
    <>
      <GameReviewView
        vm={vm}
        mode={mode}
        onModeChange={setMode}
        showModeToggle
        navCrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Sample review (Signalis)' },
        ]}
      />
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] w-[min(92vw,360px)] -translate-x-1/2 text-center">
        <Link
          to="/"
          className="pointer-events-auto text-xs font-semibold text-zinc-500 underline-offset-4 hover:underline"
        >
          Back to reviews
        </Link>
      </div>
    </>
  )
}
