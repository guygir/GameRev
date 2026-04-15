export type GameStatAxis =
  | 'Value'
  | 'Architecture'
  | 'Presentation'
  | 'Narrative'
  | 'Novelty'
  | 'Fun'

export type GameStats = Record<GameStatAxis, number>

/**
 * Vertex order = clockwise from top (−90°). Eastern vertices (−30°, +30°): Narrative + Value so
 * the right side isn’t all short words (balances visual weight vs the left). Presentation on the
 * bottom (+90°). Fun on the lower-left (150°) after the swap with Narrative.
 */
export const statAxes: GameStatAxis[] = [
  'Architecture',
  'Narrative',
  'Value',
  'Presentation',
  'Fun',
  'Novelty',
]

export const statAxisTooltips: Record<GameStatAxis, string> = {
  Value: 'Length, replayability, quality vs price',
  Architecture: 'Pacing, structure, depth',
  Presentation: 'Visuals, sound, polish',
  Narrative: 'Story, characters, themes',
  Novelty: 'Uniqueness, boldness, risk-taking',
  Fun: 'Enjoyment, flow, gameplay feel',
}
