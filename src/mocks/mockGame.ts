import type { GameStats } from '../review/gameStats'

export type { GameStatAxis, GameStats } from '../review/gameStats'
export { statAxes, statAxisTooltips } from '../review/gameStats'

export const mockGame = {
  name: 'Signalis',
  subtitle: 'A survival horror love letter to late PS1 dread',
  coverImageUrl: 'https://howlongtobeat.com/games/57149_Signalis.jpg',
  platforms: ['Nintendo Switch', 'PC', 'PlayStation 4', 'Xbox One'] as const,
  hltbMain: '8h',
  hltbExtras: '11h',
  hltbCompletionist: '13h',
  genres: ['Survival horror', 'Retro sci-fi', 'Puzzle-adventure'],
  tags: ['PS1 aesthetic', 'Atmospheric', 'Inventory puzzles', 'Fixed camera'],
  pros: [
    'Pacing stays taut across the campaign',
    'Art direction sells the world in every corridor',
    'Sound design makes silence feel dangerous',
  ],
  cons: [
    'Inventory management can slow momentum',
    'Backtracking without new context can feel long',
  ],
  stats: {
    Value: 85,
    Architecture: 82,
    Presentation: 91,
    Narrative: 88,
    Novelty: 86,
    Fun: 79,
  } satisfies GameStats,
} as const

/** Games to suggest after Tags; edit names and `reviewed` / `slug` as you add real reviews. */
export type PlayIfLikedPick =
  | { name: string; reviewed: true; slug: string }
  | { name: string; reviewed: false }

export const mockPlayIfLiked: PlayIfLikedPick[] = [
  { name: 'Alien Isolation', reviewed: true, slug: 'alien-isolation' },
  { name: 'Pathologic 2', reviewed: true, slug: 'pathologic-2' },
  { name: 'Return of the Obra Dinn', reviewed: false },
]
