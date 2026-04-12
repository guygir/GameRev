export type GameStatAxis =
  | 'Value'
  | 'Architecture'
  | 'Presentation'
  | 'Narrative'
  | 'Novelty'
  | 'Fun'

export type GameStats = Record<GameStatAxis, number>

export const statAxes: GameStatAxis[] = [
  'Value',
  'Architecture',
  'Presentation',
  'Narrative',
  'Novelty',
  'Fun',
]

export const statAxisTooltips: Record<GameStatAxis, string> = {
  Value: 'Length, replayability, quality vs price',
  Architecture: 'Pacing, structure, depth',
  Presentation: 'Visuals, sound, polish',
  Narrative: 'Story, characters, themes',
  Novelty: 'Uniqueness, boldness, risk-taking',
  Fun: 'Enjoyment, flow, gameplay feel',
}
